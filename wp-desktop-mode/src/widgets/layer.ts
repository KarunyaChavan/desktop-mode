/**
 * Desktop Mode — Widget layer.
 *
 * Owns the right-side `#wp-desktop-widgets` column. Responsibilities:
 *
 *   - Load the enabled-id list from localStorage on boot
 *   - Mount each enabled widget into a card, async-safe via a
 *     monotonic generation counter per card
 *   - Render the trailing `+` tile that opens the picker
 *   - Handle per-card `×` remove
 *   - Persist changes back to localStorage (+ fire add/remove actions)
 *
 * Widgets paint above the wallpaper (z-index: 1) but under windows
 * (which start at z-index 100). The column never intercepts window
 * drag / resize — only its own cards + `+` button are interactive,
 * everything else passes through.
 *
 * @since 0.7.0
 */

import { doAction, HOOKS } from '../hooks';
import { __, sprintf } from '../i18n';
import * as registry from './registry';
import { openWidgetPicker, refreshWidgetPicker } from './picker';
import type { WidgetDef, WidgetTeardown } from './types';

/** Storage key for the ordered list of enabled widget ids. */
const STORAGE_KEY = 'wp-desktop-widgets';

/**
 * First-run default — the clock. A single entry so new users land on
 * a non-empty column; removable like any other. Plugins wanting to
 * seed additional widgets on first run can mutate this via the
 * `wp-desktop.widgets.defaults` filter (not yet public — add when
 * someone asks).
 */
const DEFAULT_ENABLED_IDS = [ 'clock' ];

/** Internal record of a mounted widget. */
interface MountedWidget {
	id: string;
	card: HTMLElement;
	body: HTMLElement;
	/** Generation at mount time — races compare against this. */
	generation: number;
	/** Teardown fn the def returned. `null` until mount resolves. */
	teardown: WidgetTeardown | null;
}

export class WidgetLayer {
	private root: HTMLElement;
	private listEl: HTMLElement;
	private addTile: HTMLButtonElement;

	private pluginUrl: string;
	private enabledIds: string[];
	private mounted: Map<string, MountedWidget> = new Map();

	/**
	 * Monotonic counter incremented on every mount / unmount so async
	 * mounts that resolve after the user flipped the widget off can
	 * detect they're stale and tear themselves down silently.
	 */
	private generation = 0;

	constructor( root: HTMLElement, pluginUrl: string ) {
		this.root = root;
		this.pluginUrl = pluginUrl;
		this.enabledIds = loadEnabledIds();

		// Ensure the column has a list container + the trailing + tile.
		// We DON'T nuke whatever's inside root — plugins may have
		// pre-mounted something. But the list + tile we build fresh.
		this.listEl = document.createElement( 'div' );
		this.listEl.className = 'wp-desktop-widgets__list';
		this.root.appendChild( this.listEl );

		this.addTile = document.createElement( 'button' );
		this.addTile.type = 'button';
		this.addTile.className = 'wp-desktop-widgets__add';
		this.addTile.setAttribute( 'aria-label', __( 'Add widget' ) );
		const addPlus = document.createElement( 'span' );
		addPlus.className = 'wp-desktop-widgets__add-plus';
		addPlus.setAttribute( 'aria-hidden', 'true' );
		addPlus.textContent = '+';
		const addLabel = document.createElement( 'span' );
		addLabel.className = 'wp-desktop-widgets__add-label';
		addLabel.textContent = __( 'Add widget' );
		this.addTile.appendChild( addPlus );
		this.addTile.appendChild( addLabel );
		this.addTile.addEventListener( 'click', ( e ) => {
			e.preventDefault();
			e.stopPropagation();
			openWidgetPicker( {
				anchor: this.addTile,
				registry: () => registry.all(),
				enabledIds: () => [ ...this.enabledIds ],
				onAdd: ( id ) => this.add( id ),
			} );
		} );
		this.root.appendChild( this.addTile );

		this.paintEmptyState();
	}

	/**
	 * Mount every widget the user has enabled (per localStorage).
	 * Called once during shell boot, AFTER the registry seed has run
	 * so built-ins are available. Safe to call multiple times — the
	 * `mounted` map dedupes.
	 */
	public hydrate(): void {
		// First-run: no saved list at all → seed with the default
		// (currently just 'clock'). This writes through so the next
		// boot sees an explicit empty [] if the user removed it,
		// distinct from first-run.
		if ( readRawStored() === null ) {
			this.enabledIds = DEFAULT_ENABLED_IDS.filter(
				( id ) => !! registry.get( id ),
			);
			saveEnabledIds( this.enabledIds );
		}

		for ( const id of this.enabledIds ) {
			if ( this.mounted.has( id ) ) {
				continue;
			}
			this.mountById( id );
		}
		this.paintEmptyState();
	}

	/**
	 * Add a widget by id — called by the picker after the user
	 * selects an available entry. Idempotent: adding an already-
	 * enabled widget is a no-op.
	 */
	public add( id: string ): void {
		if ( this.enabledIds.includes( id ) ) {
			return;
		}
		if ( ! registry.get( id ) ) {
			// Unknown id — don't persist a broken entry. Most likely
			// a plugin was deactivated between picker-open and click.
			return;
		}
		this.enabledIds.push( id );
		saveEnabledIds( this.enabledIds );
		this.mountById( id );
		this.paintEmptyState();
		doAction( HOOKS.WIDGET_ADDED, { id } );
		refreshWidgetPicker();
	}

	/**
	 * Remove a widget by id — called from the card's × button and
	 * also from the picker if that's wired later. Idempotent.
	 */
	public remove( id: string ): void {
		const before = this.enabledIds.length;
		this.enabledIds = this.enabledIds.filter( ( e ) => e !== id );
		if ( this.enabledIds.length === before ) {
			return;
		}
		saveEnabledIds( this.enabledIds );
		this.unmountById( id );
		this.paintEmptyState();
		doAction( HOOKS.WIDGET_REMOVED, { id } );
		refreshWidgetPicker();
	}

	/** Public read for the picker / external callers. */
	public getEnabledIds(): string[] {
		return [ ...this.enabledIds ];
	}

	/**
	 * Tear down every widget. Called on shell unload via `pagehide`
	 * so intervals / RAF loops stop before the beacon flush.
	 */
	public disposeAll(): void {
		for ( const id of Array.from( this.mounted.keys() ) ) {
			this.unmountById( id );
		}
	}

	// --- Internal ---------------------------------------------------

	private mountById( id: string ): void {
		const def = registry.get( id );
		if ( ! def ) {
			return;
		}
		const gen = ++this.generation;
		const card = this.buildCard( def );
		const body = card.querySelector<HTMLElement>(
			'.wp-desktop-widgets__card-body',
		)!;
		const record: MountedWidget = {
			id,
			card,
			body,
			generation: gen,
			teardown: null,
		};
		this.mounted.set( id, record );
		this.listEl.appendChild( card );

		const ctx = { id, pluginUrl: this.pluginUrl };
		doAction( HOOKS.WIDGET_MOUNTING, { id, container: body, ctx } );

		const onResolve = ( teardown: WidgetTeardown ): void => {
			// Race check: user flipped this widget off (or the whole
			// layer was disposed) before mount resolved. Run the
			// teardown to reverse whatever the widget half-started,
			// then drop the record silently.
			const current = this.mounted.get( id );
			if ( ! current || current.generation !== gen ) {
				try {
					teardown();
				} catch {
					/* best-effort */
				}
				return;
			}
			current.teardown = teardown;
			doAction( HOOKS.WIDGET_MOUNTED, { id, container: body, ctx } );
		};

		let result;
		try {
			result = def.mount( body, ctx );
		} catch ( err ) {
			this.handleMountFailure( id, err );
			return;
		}
		if ( isThenable( result ) ) {
			result.then( onResolve, ( err ) => {
				if ( this.mounted.get( id )?.generation === gen ) {
					this.handleMountFailure( id, err );
				}
			} );
			return;
		}
		onResolve( result );
	}

	private unmountById( id: string ): void {
		const record = this.mounted.get( id );
		if ( ! record ) {
			return;
		}
		doAction( HOOKS.WIDGET_UNMOUNTING, { id } );
		try {
			record.teardown?.();
		} catch ( err ) {
			if ( typeof console !== 'undefined' ) {
				console.error(
					`[wp-desktop-mode] Widget "${ id }" teardown threw:`,
					err,
				);
			}
		}
		// Bumping the generation here ensures any in-flight async
		// mount that resolves AFTER this point also tears itself down.
		this.generation++;
		record.card.remove();
		this.mounted.delete( id );
	}

	private handleMountFailure( id: string, err: unknown ): void {
		const record = this.mounted.get( id );
		if ( record ) {
			record.card.remove();
			this.mounted.delete( id );
		}
		doAction( HOOKS.WIDGET_MOUNT_FAILED, { id, error: err } );
		if ( typeof console !== 'undefined' ) {
			console.error(
				`[wp-desktop-mode] Widget "${ id }" failed to mount:`,
				err,
			);
		}
	}

	private buildCard( def: WidgetDef ): HTMLElement {
		const card = document.createElement( 'div' );
		card.className = 'wp-desktop-widgets__card';
		card.dataset.widgetId = def.id;

		const close = document.createElement( 'button' );
		close.type = 'button';
		close.className = 'wp-desktop-widgets__card-close';
		// translators: %s is the widget label (e.g., "Clock")
		close.setAttribute( 'aria-label', sprintf( __( 'Remove %s' ), def.label ) );
		close.innerHTML =
			'<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">' +
			'<path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" ' +
			'stroke-width="1.6" stroke-linecap="round"/></svg>';
		close.addEventListener( 'click', ( e ) => {
			e.preventDefault();
			e.stopPropagation();
			this.remove( def.id );
		} );
		card.appendChild( close );

		const body = document.createElement( 'div' );
		body.className = 'wp-desktop-widgets__card-body';
		card.appendChild( body );

		return card;
	}

	/**
	 * Toggle a `--has-widgets` modifier so CSS can hide the column's
	 * decorative backdrop when nothing's mounted (keeps the empty
	 * state clean — just the `+` tile floating in the corner).
	 */
	private paintEmptyState(): void {
		this.root.classList.toggle(
			'wp-desktop-widgets--has-widgets',
			this.mounted.size > 0,
		);
	}
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function isThenable( x: unknown ): x is PromiseLike<WidgetTeardown> {
	return (
		!! x &&
		( typeof x === 'object' || typeof x === 'function' ) &&
		typeof ( x as { then?: unknown } ).then === 'function'
	);
}

/**
 * Raw read so callers can distinguish "never saved" (null) from
 * "user explicitly cleared the list" (empty array serialised as
 * `[]`). That difference is what lets first-run seed the clock.
 */
function readRawStored(): string | null {
	try {
		return window.localStorage.getItem( STORAGE_KEY );
	} catch {
		return null;
	}
}

function loadEnabledIds(): string[] {
	const raw = readRawStored();
	if ( raw === null ) {
		return [];
	}
	try {
		const parsed = JSON.parse( raw );
		if ( ! Array.isArray( parsed ) ) {
			return [];
		}
		return parsed.filter( ( x ): x is string => typeof x === 'string' );
	} catch {
		return [];
	}
}

function saveEnabledIds( ids: string[] ): void {
	try {
		window.localStorage.setItem( STORAGE_KEY, JSON.stringify( ids ) );
	} catch {
		/* private mode / quota exceeded — best-effort */
	}
}
