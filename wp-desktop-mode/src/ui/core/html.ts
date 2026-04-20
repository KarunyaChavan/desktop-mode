/**
 * wpd-ui — minimalistic tagged-template renderer.
 *
 * Inspired by lit-html; deliberately ~200 LOC instead of ~3000. Covers
 * the bindings we actually need:
 *
 *   - text:            `<div>${value}</div>`
 *   - attribute:       `<div class=${value}>...</div>`
 *   - event:           `<button @click=${handler}>...</button>`
 *   - property:        `<input .value=${value}>`
 *   - boolean attr:    `<button ?disabled=${cond}>...</button>`
 *
 * What it does NOT do (on purpose):
 *   - Nested template results (no `${html\`...\`}` inside another template)
 *   - Keyed list rendering (arrays get serialised via `String()`)
 *   - SVG / MathML namespace handling beyond what `innerHTML` gives
 *
 * Use these primitives from `Component`'s `render()` or pass the
 * result to the lower-level `render(result, container)` helper when
 * mounting into an external node.
 *
 * @since 0.9.0
 */

/**
 * Opaque template result — identity is the `strings` array, so the
 * renderer can cache its parsed parts and diff only the `values`
 * across re-renders.
 */
export interface TemplateResult {
	readonly __wpdHtml: true;
	readonly strings: TemplateStringsArray;
	readonly values: readonly unknown[];
}

/** Tag for HTML templates. */
export function html(
	strings: TemplateStringsArray,
	...values: unknown[]
): TemplateResult {
	return { __wpdHtml: true, strings, values };
}

/**
 * A placeholder marker inserted wherever a `${}` slot lives. After
 * `innerHTML`-parse we walk the tree, find markers, and build a
 * list of `Part`s that know how to update their slot on re-render.
 *
 * The marker is unusual enough that no real markup collides with
 * it (double `$`, the word "wpd", `$$`). Both the text-node and
 * attribute-value forms use the same shape so a single walk picks
 * both up.
 */
const MARKER_PREFIX = '$$wpd$$';
const MARKER_RE = /\$\$wpd\$\$(\d+)\$\$/g;

/**
 * Build the interpolated HTML string + returns the raw string so a
 * template element can parse it. Each `${}` slot is replaced by a
 * `$$wpd$$N$$` marker so the walk can find it.
 */
function joinWithMarkers( strings: TemplateStringsArray ): string {
	let out = strings[ 0 ];
	for ( let i = 1; i < strings.length; i++ ) {
		out += `${ MARKER_PREFIX }${ i - 1 }$$` + strings[ i ];
	}
	return out;
}

// ---------------------------------------------------------------
// Part types — one per binding discovered in the template.
// ---------------------------------------------------------------

interface NodePart {
	kind: 'node';
	valueIndex: number;
	/** Placeholder text node the renderer replaces / updates. */
	node: Text;
	/** Last rendered value so we can skip no-op updates. */
	last?: unknown;
}

interface AttrPart {
	kind: 'attr';
	/** Value indices this attribute weaves — can be more than one. */
	valueIndices: number[];
	element: Element;
	name: string;
	/** Template fragments between markers, so `class="a ${b} c"` → [`a `, ` c`]. */
	template: string[];
	last?: string;
}

interface EventPart {
	kind: 'event';
	valueIndex: number;
	element: Element;
	name: string;
	current?: EventListener;
}

interface PropPart {
	kind: 'prop';
	valueIndex: number;
	element: Element;
	name: string;
	last?: unknown;
}

interface BoolAttrPart {
	kind: 'bool';
	valueIndex: number;
	element: Element;
	name: string;
	last?: boolean;
}

type Part = NodePart | AttrPart | EventPart | PropPart | BoolAttrPart;

/** Compiled template — cached per unique `strings` array. */
interface Compiled {
	template: HTMLTemplateElement;
	/**
	 * Factory that takes a cloned fragment and returns the Parts
	 * wired to that clone's node tree. Kept as a factory (rather
	 * than index paths) for clarity — templates rarely clone more
	 * than once in practice anyway.
	 */
	buildParts: ( fragment: DocumentFragment ) => Part[];
}

/**
 * Cache keyed by the template `strings` array identity. Template
 * strings arrays are frozen + reused across render calls, so strict
 * equality is the correct key.
 */
const compiledCache = new WeakMap<TemplateStringsArray, Compiled>();

/** Compile `strings` once, then reuse forever. */
function compile( strings: TemplateStringsArray ): Compiled {
	const cached = compiledCache.get( strings );
	if ( cached ) {
		return cached;
	}

	const template = document.createElement( 'template' );
	template.innerHTML = joinWithMarkers( strings );

	// Walk the just-parsed template, recording HOW to find each
	// marker (node path + kind) so we can rebuild parts against any
	// clone of this template. We don't store element references
	// here — they belong to the template itself, not the clone.
	interface Recipe {
		path: number[];
		kind: Part[ 'kind' ];
		valueIndex?: number;
		name?: string;
		valueIndices?: number[];
		template?: string[];
	}
	const recipes: Recipe[] = [];

	const walk = ( node: Node, path: number[] ): void => {
		// Collect element attribute bindings first — we consume +
		// remove any `@…`/`.…`/`?…` attrs so a downstream mount
		// doesn't see them.
		if ( node.nodeType === Node.ELEMENT_NODE ) {
			const el = node as Element;
			for ( const attr of Array.from( el.attributes ) ) {
				const rawName = attr.name;
				const rawValue = attr.value;
				const prefix = rawName[ 0 ];
				if ( MARKER_RE.test( rawValue ) ) {
					MARKER_RE.lastIndex = 0;
					if ( prefix === '@' ) {
						// Event binding — single marker expected.
						const match = MARKER_RE.exec( rawValue );
						MARKER_RE.lastIndex = 0;
						recipes.push( {
							path,
							kind: 'event',
							name: rawName.slice( 1 ),
							valueIndex: match ? Number( match[ 1 ] ) : 0,
						} );
						el.removeAttribute( rawName );
					} else if ( prefix === '.' ) {
						const match = MARKER_RE.exec( rawValue );
						MARKER_RE.lastIndex = 0;
						recipes.push( {
							path,
							kind: 'prop',
							name: rawName.slice( 1 ),
							valueIndex: match ? Number( match[ 1 ] ) : 0,
						} );
						el.removeAttribute( rawName );
					} else if ( prefix === '?' ) {
						const match = MARKER_RE.exec( rawValue );
						MARKER_RE.lastIndex = 0;
						recipes.push( {
							path,
							kind: 'bool',
							name: rawName.slice( 1 ),
							valueIndex: match ? Number( match[ 1 ] ) : 0,
						} );
						el.removeAttribute( rawName );
					} else {
						// Regular attribute. Could carry 1+ markers;
						// decompose into template fragments.
						const fragments: string[] = [];
						const indices: number[] = [];
						let lastEnd = 0;
						let m;
						MARKER_RE.lastIndex = 0;
						while ( ( m = MARKER_RE.exec( rawValue ) ) !== null ) {
							fragments.push( rawValue.slice( lastEnd, m.index ) );
							indices.push( Number( m[ 1 ] ) );
							lastEnd = m.index + m[ 0 ].length;
						}
						fragments.push( rawValue.slice( lastEnd ) );
						recipes.push( {
							path,
							kind: 'attr',
							name: rawName,
							template: fragments,
							valueIndices: indices,
						} );
						// Blank out the placeholder value; the attr
						// part will set it on first render.
						el.setAttribute( rawName, '' );
					}
				}
			}
		}

		// Recurse. For text children we split nodes on markers so
		// each marker becomes its own placeholder text node.
		const children = Array.from( node.childNodes );
		for ( let i = 0; i < children.length; i++ ) {
			const child = children[ i ];
			if ( child.nodeType === Node.TEXT_NODE ) {
				const text = child.textContent || '';
				if ( ! MARKER_RE.test( text ) ) {
					MARKER_RE.lastIndex = 0;
					continue;
				}
				MARKER_RE.lastIndex = 0;
				// Replace the text node with a sequence of real text
				// nodes + empty placeholders for each marker.
				const parent = child.parentNode!;
				let lastEnd = 0;
				let m;
				const newNodes: Node[] = [];
				const newRecipes: Recipe[] = [];
				MARKER_RE.lastIndex = 0;
				while ( ( m = MARKER_RE.exec( text ) ) !== null ) {
					if ( m.index > lastEnd ) {
						newNodes.push( document.createTextNode( text.slice( lastEnd, m.index ) ) );
					}
					const placeholder = document.createTextNode( '' );
					newNodes.push( placeholder );
					newRecipes.push( {
						path: [ ...path, i + newNodes.length - 1 ],
						kind: 'node',
						valueIndex: Number( m[ 1 ] ),
					} );
					lastEnd = m.index + m[ 0 ].length;
				}
				if ( lastEnd < text.length ) {
					newNodes.push( document.createTextNode( text.slice( lastEnd ) ) );
				}
				for ( const nn of newNodes ) {
					parent.insertBefore( nn, child );
				}
				parent.removeChild( child );
				// The inserted nodes landed before `child`, so
				// their indices are `i`, `i+1`, ... and we already
				// wrote those into recipe paths above. Adjust child
				// loop counter to skip over what we just inserted.
				i += newNodes.length - 1;
				recipes.push( ...newRecipes );
				// Rebuild the local children cache since we mutated.
				// (Only cosmetic — loop uses the immutable Array.from snapshot.)
			} else {
				walk( child, [ ...path, i ] );
			}
		}
	};

	walk( template.content, [] );

	const buildParts = ( fragment: DocumentFragment ): Part[] => {
		const out: Part[] = [];
		for ( const r of recipes ) {
			let node: Node = fragment;
			for ( const idx of r.path ) {
				node = node.childNodes[ idx ];
			}
			if ( r.kind === 'node' ) {
				out.push( {
					kind: 'node',
					valueIndex: r.valueIndex!,
					node: node as Text,
				} );
			} else if ( r.kind === 'attr' ) {
				out.push( {
					kind: 'attr',
					element: node as Element,
					name: r.name!,
					template: r.template!,
					valueIndices: r.valueIndices!,
				} );
			} else if ( r.kind === 'event' ) {
				out.push( {
					kind: 'event',
					valueIndex: r.valueIndex!,
					element: node as Element,
					name: r.name!,
				} );
			} else if ( r.kind === 'prop' ) {
				out.push( {
					kind: 'prop',
					valueIndex: r.valueIndex!,
					element: node as Element,
					name: r.name!,
				} );
			} else if ( r.kind === 'bool' ) {
				out.push( {
					kind: 'bool',
					valueIndex: r.valueIndex!,
					element: node as Element,
					name: r.name!,
				} );
			}
		}
		return out;
	};

	const entry: Compiled = { template, buildParts };
	compiledCache.set( strings, entry );
	return entry;
}

/**
 * Per-container mount state: the strings array it was compiled
 * against, the parts wired to its DOM, the last values array. A
 * fresh `strings` identity triggers a full re-mount.
 */
interface MountState {
	strings: TemplateStringsArray;
	parts: Part[];
}

const mountState = new WeakMap<Element | DocumentFragment, MountState>();

/**
 * Render `result` into `container`. Idempotent — subsequent calls
 * with the same template compile just update the changed values.
 * A different template resets the container and re-mounts.
 */
export function render(
	result: TemplateResult,
	container: Element | DocumentFragment,
): void {
	const existing = mountState.get( container );
	if ( existing && existing.strings === result.strings ) {
		applyValues( existing.parts, result.values );
		return;
	}

	const compiled = compile( result.strings );
	const fragment = compiled.template.content.cloneNode( true ) as DocumentFragment;
	const parts = compiled.buildParts( fragment );

	// Reset container. Using textContent='' is faster than innerHTML=''
	// because it avoids the HTML parser path.
	while ( container.firstChild ) {
		container.removeChild( container.firstChild );
	}
	container.appendChild( fragment );

	applyValues( parts, result.values );
	mountState.set( container, { strings: result.strings, parts } );
}

/** Update each part to the new slot value if it actually changed. */
function applyValues( parts: Part[], values: readonly unknown[] ): void {
	for ( const part of parts ) {
		if ( part.kind === 'node' ) {
			const next = values[ part.valueIndex ];
			if ( next !== part.last ) {
				part.last = next;
				part.node.textContent = formatText( next );
			}
		} else if ( part.kind === 'attr' ) {
			// Build the new attribute value from template fragments +
			// current values. Skip the write if unchanged.
			let composed = part.template[ 0 ];
			for ( let i = 0; i < part.valueIndices.length; i++ ) {
				composed += formatText( values[ part.valueIndices[ i ] ] );
				composed += part.template[ i + 1 ];
			}
			if ( composed !== part.last ) {
				part.last = composed;
				if ( composed === '' ) {
					part.element.removeAttribute( part.name );
				} else {
					part.element.setAttribute( part.name, composed );
				}
			}
		} else if ( part.kind === 'event' ) {
			const next = values[ part.valueIndex ] as EventListener | undefined;
			if ( next !== part.current ) {
				if ( part.current ) {
					part.element.removeEventListener( part.name, part.current );
				}
				if ( next ) {
					part.element.addEventListener( part.name, next );
				}
				part.current = next;
			}
		} else if ( part.kind === 'prop' ) {
			const next = values[ part.valueIndex ];
			if ( next !== part.last ) {
				part.last = next;
				( part.element as unknown as Record<string, unknown> )[ part.name ] =
					next;
			}
		} else if ( part.kind === 'bool' ) {
			const next = !! values[ part.valueIndex ];
			if ( next !== part.last ) {
				part.last = next;
				if ( next ) {
					part.element.setAttribute( part.name, '' );
				} else {
					part.element.removeAttribute( part.name );
				}
			}
		}
	}
}

/** Coerce a slot value to its text representation for text/attr parts. */
function formatText( v: unknown ): string {
	if ( v === null || v === undefined || v === false ) {
		return '';
	}
	if ( Array.isArray( v ) ) {
		return v.map( formatText ).join( '' );
	}
	return String( v );
}
