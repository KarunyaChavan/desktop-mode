/**
 * Animated WP Logo — boids / particle scene.
 *
 * Samples the official WordPress "W" mark PNG (ships in `assets/images/`)
 * to build a dense grid of particle "home" positions. Each particle is
 * a tiny rendered blob that lives near its home via a spring + damping
 * model. The cursor acts as a repelling magnet — particles near the
 * pointer are pushed outward with an inverse-distance falloff, and
 * elastically spring back when the pointer leaves.
 *
 * Rendered with PixiJS (loaded via `needs: ['pixijs']` at the
 * wallpaper-definition level, so `window.PIXI` is guaranteed defined
 * by the time this module runs). Designed to hold a steady 60fps
 * with ~2.5k particles on mid-range hardware — the hot loop is a
 * plain array scan with no per-particle allocations.
 *
 * @since 0.6.0
 */

/**
 * Minimal structural types for the slice of PIXI we use. Declared
 * inline so the plugin doesn't depend on a separate loader module —
 * the shell loads PIXI via the module registry (`needs: ['pixijs']`)
 * before mount fires, and we just read `window.PIXI` at that point.
 */
interface PixiApi {
	Application: new () => PixiApplication;
	Graphics: new () => PixiGraphics;
	Container: new () => PixiContainer;
}

interface PixiApplication {
	init( options: {
		resizeTo?: HTMLElement;
		backgroundAlpha?: number;
		antialias?: boolean;
		resolution?: number;
		autoDensity?: boolean;
	} ): Promise<void>;
	stage: PixiContainer;
	canvas: HTMLCanvasElement;
	ticker: {
		add( cb: ( ticker: { deltaTime: number } ) => void ): void;
		stop(): void;
		start(): void;
	};
	destroy( removeView?: boolean, options?: object ): void;
}

interface PixiContainer {
	addChild( child: unknown ): unknown;
	x: number;
	y: number;
	rotation: number;
	scale: { set( value: number ): void };
	children: unknown[];
}

interface PixiGraphics extends PixiContainer {
	circle( x: number, y: number, r: number ): PixiGraphics;
	fill( options: { color: number; alpha?: number } ): PixiGraphics;
	stroke( options: { color: number; alpha?: number; width: number } ): PixiGraphics;
	moveTo( x: number, y: number ): PixiGraphics;
	lineTo( x: number, y: number ): PixiGraphics;
	clear(): PixiGraphics;
}

declare global {
	interface Window {
		PIXI?: PixiApi;
	}
}

export interface SceneHandle {
	/** Stop the render loop and release WebGL resources. */
	destroy(): void;
	/** Temporarily pause / resume animation (e.g. tab backgrounded). */
	setAnimating( playing: boolean ): void;
}

interface SceneOptions {
	container: HTMLElement;
	logoUrl: string;
	prefersReducedMotion: boolean;
}

/**
 * Sampling / physics / rendering tuning constants. All tuned together —
 * changing one usually means revisiting the others.
 */
const CONFIG = {
	/** Grid stride when sampling the logo PNG. Smaller → denser particle field → heavier frame cost. */
	sampleStride: 7,
	/** Alpha threshold (0–255) for "this pixel is part of the logo." */
	alphaThreshold: 128,
	/**
	 * Target logo rendering width in CSS pixels. Capped at this value
	 * on huge screens; on normal screens we take 72% of the smaller
	 * shell axis so the logo reads as "hero-sized" without cropping.
	 */
	targetLogoWidth: 820,
	/** Fraction of the smaller shell dimension the logo is allowed to occupy. */
	logoShellFraction: 0.72,
	/** Spring stiffness — how hard a particle pulls back to its home. */
	springK: 0.055,
	/** Velocity damping per tick. 1 = no damping, 0 = instant stop. */
	damping: 0.86,
	/**
	 * Velocity floor below which a particle is considered at rest —
	 * its position snaps to its home and its velocity zeroes out. Kills
	 * the subpixel jitter that made the resting logo flicker.
	 */
	restVelocityEpsilon: 0.02,
	/** Pointer repulsion radius in CSS pixels. Beyond this, no effect. */
	repelRadius: 160,
	/**
	 * Repulsion strength. Combined with the (1 − distance/radius)^2
	 * falloff, this is the acceleration per tick at the pointer's
	 * dead-center position.
	 */
	repelStrength: 2.6,
	/** Particle render radius (CSS pixels). */
	particleRadius: 1.8,
	/** Second outer-glow circle radius — painted first, softer. */
	particleHaloRadius: 3.4,
};

/** CSS radial-gradient used as the backdrop. Painted by the browser
 * directly on the wallpaper container, so the shell does perfectly
 * smooth interpolation — Pixi Graphics can't produce gradients this
 * clean without shader work. */
const BACKDROP_CSS =
	'radial-gradient(circle at 50% 50%, #1e40af 0%, #152a6b 45%, #0a1024 100%)';

/**
 * Build and mount the Pixi scene into the given container. Returns a
 * handle for pause/resume + full teardown. `destroy` removes the
 * canvas element and the resize observer; tearing down without it
 * would leak the WebGL context.
 *
 * Assumes the caller has already ensured `window.PIXI` is defined —
 * the shell does this via `needs: ['pixijs']` on the wallpaper def.
 */
export async function mountScene(
	{ container, logoUrl, prefersReducedMotion }: SceneOptions
): Promise<SceneHandle> {
	const pixi = window.PIXI;
	if ( ! pixi ) {
		throw new Error(
			'[animated-logo-wallpaper] window.PIXI is undefined; ' +
				'declare `needs: [\'pixijs\']` on the wallpaper def so ' +
				'the shell loads it before mount.'
		);
	}

	// Sample the logo upfront — done once, shared across resizes. The
	// sampled homes are unit coordinates (0..1 × 0..1) so we can scale
	// them on every layout pass without re-sampling.
	const homes = await sampleLogoHomes( logoUrl );

	// Paint the gradient via CSS on the container instead of drawing it
	// in Pixi — the browser produces a perfectly smooth radial gradient
	// with no banding, no per-frame cost, and no Pixi Graphics fill
	// approximations needed. The Pixi app renders transparent on top.
	const priorBackground = container.style.background;
	container.style.background = BACKDROP_CSS;

	const app = new pixi.Application();
	await app.init( {
		resizeTo: container,
		backgroundAlpha: 0,
		antialias: true,
		autoDensity: true,
		resolution: Math.min( window.devicePixelRatio || 1, 2 ),
	} );

	container.appendChild( app.canvas );
	applyCanvasLayout( app.canvas );

	// Particle layer — cleared + redrawn every frame.
	const particleLayer = new pixi.Graphics();
	app.stage.addChild( particleLayer );

	// Particle state — flat typed arrays instead of objects so the hot
	// loop doesn't walk 3k prototype chains per frame.
	const n = homes.length;
	const homeX = new Float32Array( n );
	const homeY = new Float32Array( n );
	const x = new Float32Array( n );
	const y = new Float32Array( n );
	const vx = new Float32Array( n );
	const vy = new Float32Array( n );

	let logoScale = 1;
	let logoOffsetX = 0;
	let logoOffsetY = 0;

	const computeLayout = (): void => {
		const w = app.canvas.clientWidth;
		const h = app.canvas.clientHeight;
		const target = Math.min(
			CONFIG.targetLogoWidth,
			Math.min( w, h ) * CONFIG.logoShellFraction
		);
		logoScale = target;
		logoOffsetX = ( w - target ) / 2;
		logoOffsetY = ( h - target ) / 2;

		for ( let i = 0; i < n; i++ ) {
			homeX[ i ] = logoOffsetX + homes[ i ][ 0 ] * logoScale;
			homeY[ i ] = logoOffsetY + homes[ i ][ 1 ] * logoScale;
			// First layout seeds current positions to home; subsequent
			// relayouts keep current positions where they are so the
			// animation doesn't snap on a browser resize.
			if ( x[ i ] === 0 && y[ i ] === 0 ) {
				x[ i ] = homeX[ i ];
				y[ i ] = homeY[ i ];
			}
		}
	};
	computeLayout();

	const resizeObserver = new ResizeObserver( () => computeLayout() );
	resizeObserver.observe( container );

	// Pointer tracking — we keep it in container-local coordinates so
	// the repulsion math stays correct under any scale or scroll.
	// Default to far-offscreen so we don't push particles on mount
	// before the user has interacted.
	let pointerX = -1e6;
	let pointerY = -1e6;

	const onPointerMove = ( e: PointerEvent ): void => {
		const rect = app.canvas.getBoundingClientRect();
		pointerX = e.clientX - rect.left;
		pointerY = e.clientY - rect.top;
	};
	const onPointerLeave = (): void => {
		pointerX = -1e6;
		pointerY = -1e6;
	};
	// Listen on the container so pointer events bubble from windows too
	// (they float above the wallpaper layer, but `pointer-events: none`
	// on our layer means events pass through to the elements underneath
	// anyway — we grab from `window` to get the raw position). Falling
	// back to window covers the case where the wallpaper sits behind
	// other pointer-event owners.
	window.addEventListener( 'pointermove', onPointerMove, { passive: true } );
	window.addEventListener( 'pointerleave', onPointerLeave );

	// Reduced-motion: render one static frame and never start the
	// ticker. Homes are already populated, so a single paint gives a
	// clean still image of the logo.
	let animating = ! prefersReducedMotion;

	const tick = (): void => {
		if ( animating ) {
			step( n, homeX, homeY, x, y, vx, vy, pointerX, pointerY );
		}
		paintParticles( particleLayer, n, x, y );
	};

	app.ticker.add( tick );
	// Even when not animating we need one paint to show the logo.
	tick();
	if ( ! animating ) {
		app.ticker.stop();
	}

	return {
		destroy(): void {
			resizeObserver.disconnect();
			window.removeEventListener( 'pointermove', onPointerMove );
			window.removeEventListener( 'pointerleave', onPointerLeave );
			app.destroy( true, {
				children: true,
				texture: true,
				textureSource: true,
				context: true,
			} as object );
			// Put the container's inline background back however we
			// found it — next wallpaper's apply() takes over from
			// there via `--wp-desktop-bg`.
			container.style.background = priorBackground;
		},
		setAnimating( playing: boolean ): void {
			animating = playing && ! prefersReducedMotion;
			if ( animating ) {
				app.ticker.start();
			} else {
				app.ticker.stop();
			}
		},
	};
}

/**
 * Integration step — spring toward home, damp, repel from pointer,
 * integrate. Flat Float32Arrays keep the loop allocation-free.
 *
 * Once a particle's velocity drops below a small floor AND it's close
 * enough to its home to be visually at rest, we snap it to the home
 * and zero its velocity. This kills the subpixel jitter that otherwise
 * shows as shimmer on the resting logo.
 */
function step(
	n: number,
	homeX: Float32Array,
	homeY: Float32Array,
	x: Float32Array,
	y: Float32Array,
	vx: Float32Array,
	vy: Float32Array,
	pointerX: number,
	pointerY: number
): void {
	const { springK, damping, repelRadius, repelStrength, restVelocityEpsilon } = CONFIG;
	const repelRadiusSq = repelRadius * repelRadius;
	const restEpsSq = restVelocityEpsilon * restVelocityEpsilon;
	const restPosEps = 0.25; // sub-pixel — imperceptible snap.
	const restPosEpsSq = restPosEps * restPosEps;

	for ( let i = 0; i < n; i++ ) {
		// Spring force toward home.
		const dhx = homeX[ i ] - x[ i ];
		const dhy = homeY[ i ] - y[ i ];
		let fx = dhx * springK;
		let fy = dhy * springK;

		// Pointer repulsion — soft quadratic falloff. Branchless
		// hot-path: cheap squared-distance gate before the sqrt.
		const dx = x[ i ] - pointerX;
		const dy = y[ i ] - pointerY;
		const distSq = dx * dx + dy * dy;
		let disturbed = false;
		if ( distSq < repelRadiusSq && distSq > 0.0001 ) {
			const dist = Math.sqrt( distSq );
			const t = 1 - dist / repelRadius; // 0..1
			const mag = ( t * t * repelStrength ) / dist;
			fx += dx * mag;
			fy += dy * mag;
			disturbed = true;
		}

		// Velocity Verlet-ish integration with damping.
		const nvx = ( vx[ i ] + fx ) * damping;
		const nvy = ( vy[ i ] + fy ) * damping;

		// Snap-to-rest: only when the particle is both slow AND
		// essentially at home AND not being disturbed by the pointer.
		// Without all three conditions a particle decelerating through
		// the rest threshold mid-orbit would get stuck off-home.
		if (
			! disturbed &&
			nvx * nvx + nvy * nvy < restEpsSq &&
			dhx * dhx + dhy * dhy < restPosEpsSq
		) {
			x[ i ] = homeX[ i ];
			y[ i ] = homeY[ i ];
			vx[ i ] = 0;
			vy[ i ] = 0;
			continue;
		}

		vx[ i ] = nvx;
		vy[ i ] = nvy;
		x[ i ] += nvx;
		y[ i ] += nvy;
	}
}

/**
 * Redraw every particle into the shared Graphics node. Pixi's
 * Graphics API is retained-mode, so we clear and re-issue every
 * frame — that's cheap compared to allocating thousands of sprites,
 * and keeps the code simple.
 */
function paintParticles(
	g: PixiGraphics,
	n: number,
	x: Float32Array,
	y: Float32Array
): void {
	g.clear();
	// Outer glow pass — soft larger circles at low alpha. Painted
	// first so the brighter core draws on top.
	for ( let i = 0; i < n; i++ ) {
		g.circle( x[ i ], y[ i ], CONFIG.particleHaloRadius );
	}
	g.fill( { color: 0xffffff, alpha: 0.14 } );

	// Core pass — bright, small.
	for ( let i = 0; i < n; i++ ) {
		g.circle( x[ i ], y[ i ], CONFIG.particleRadius );
	}
	g.fill( { color: 0xffffff, alpha: 0.85 } );
}

/**
 * Load the logo PNG, rasterize it to an offscreen canvas, and sample
 * the alpha channel on a fixed grid. Returns unit-coordinate pairs
 * (each in [0, 1]) that can be scaled to fit any render surface.
 *
 * The grid walk samples at CONFIG.sampleStride — slightly offset per
 * row by half a stride so particles don't line up on a perfectly
 * rectangular lattice (visible as visual banding).
 */
async function sampleLogoHomes( url: string ): Promise<Array<[ number, number ]>> {
	const img = await loadImage( url );

	const maxSide = 400;
	const ratio = img.naturalWidth / img.naturalHeight;
	const sampleWidth = ratio >= 1 ? maxSide : Math.round( maxSide * ratio );
	const sampleHeight = ratio >= 1 ? Math.round( maxSide / ratio ) : maxSide;

	const off = document.createElement( 'canvas' );
	off.width = sampleWidth;
	off.height = sampleHeight;
	const ctx = off.getContext( '2d', { willReadFrequently: true } );
	if ( ! ctx ) {
		return [];
	}
	ctx.drawImage( img, 0, 0, sampleWidth, sampleHeight );

	const data = ctx.getImageData( 0, 0, sampleWidth, sampleHeight ).data;
	const homes: Array<[ number, number ]> = [];
	const stride = CONFIG.sampleStride;
	const threshold = CONFIG.alphaThreshold;

	for ( let row = 0; row < sampleHeight; row += stride ) {
		const rowOffset = ( row / stride ) % 2 === 0 ? 0 : stride / 2;
		for ( let col = 0; col < sampleWidth; col += stride ) {
			const px = Math.min( sampleWidth - 1, Math.round( col + rowOffset ) );
			const py = row;
			const alpha = data[ ( py * sampleWidth + px ) * 4 + 3 ];
			if ( alpha > threshold ) {
				// Unit coordinates relative to the max dimension so
				// non-square logos stay aspect-correct when scaled.
				homes.push( [ px / sampleWidth, py / sampleHeight ] );
			}
		}
	}

	return homes;
}

function loadImage( url: string ): Promise<HTMLImageElement> {
	return new Promise( ( resolve, reject ) => {
		const img = new Image();
		// crossOrigin not strictly needed (same-origin) but future-proofs
		// the loader if the URL ever comes from a CDN.
		img.crossOrigin = 'anonymous';
		img.onload = () => resolve( img );
		img.onerror = () => reject( new Error( `Failed to load logo: ${ url }` ) );
		img.src = url;
	} );
}

function applyCanvasLayout( canvas: HTMLCanvasElement ): void {
	canvas.style.display = 'block';
	canvas.style.width = '100%';
	canvas.style.height = '100%';
}

