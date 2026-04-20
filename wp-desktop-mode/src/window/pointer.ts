/**
 * Desktop Mode — Window drag + resize pointer handlers.
 *
 * Extracted from the class body because the two flows each own a
 * nested event loop (pointerdown opens a move/up/cancel triple) and
 * because together they carried ~200 lines of bookkeeping that dwarfed
 * the class's other methods.
 *
 * Each handler takes the `Window` instance and the originating
 * `PointerEvent`; the class's `bindEvents` routes its two listeners
 * through here.
 *
 * @since 0.8.1
 */

import { doAction, HOOKS } from '../hooks';
import { EDGE_MARGIN } from './constants';
import type { Window } from './index';

/** Title-bar pointerdown → drag session. */
export function handleDragStart( win: Window, e: PointerEvent ): void {
	// Only drag from the title bar background, not from any buttons.
	const target = e.target as HTMLElement;
	if (
		target.closest( '.wp-desktop-window__controls' ) ||
		target.closest( '.wp-desktop-window__screen-meta' ) ||
		target.closest( '.wp-desktop-window__menu-btn' ) ||
		target.closest( '.wp-desktop-window__menu-panel' )
	) {
		return;
	}

	// Auto-unmaximize on drag: macOS / Windows convention. We restore
	// the saved geometry, then re-position the window so the cursor
	// lands at the same horizontal RATIO on the new (smaller) title
	// bar. Without that re-anchor, a drag from the right edge of a
	// maximized window would feel like the window jumps to the left
	// mid-grab.
	if ( win.state === 'maximized' ) {
		const titleRect = win._titleBar.getBoundingClientRect();
		const cursorRatioX =
			titleRect.width > 0
				? ( e.clientX - titleRect.left ) / titleRect.width
				: 0.5;

		// Lift the maximized class + restore saved geometry. We don't
		// go through `toggleMaximize()` because that re-emits state
		// hooks and runs a transition animation; the drag path just
		// needs the geometry change without the visual pop.
		win.element.classList.remove( 'wp-desktop-window--maximized' );
		const w = win._savedGeometry?.width ?? win.element.offsetWidth;
		const h = win._savedGeometry?.height ?? win.element.offsetHeight;
		win.element.style.width = `${ w }px`;
		win.element.style.height = `${ h }px`;
		// Anchor the new title bar under the cursor — left edge
		// computed so cursor stays at the same fractional X on the
		// (now smaller) title bar; vertical drop snaps the window so
		// the cursor sits on its title bar.
		const left = Math.round( e.clientX - w * cursorRatioX );
		const top = Math.round( e.clientY - titleRect.height / 2 );
		win.element.style.left = `${ left }px`;
		win.element.style.top = `${ top }px`;
		win.state = 'normal';
		win._emitChange( 'state' );
		doAction( HOOKS.WINDOW_UNMAXIMIZED, { windowId: win.id } );
	}

	win._isDragging = true;
	win._dragOffsetX = e.clientX - win.element.offsetLeft;
	win._dragOffsetY = e.clientY - win.element.offsetTop;
	win._titleBar.setPointerCapture( e.pointerId );

	// Add an overlay to prevent iframe from eating pointer events
	// during drag.
	win.element.classList.add( 'wp-desktop-window--dragging' );
	doAction( HOOKS.WINDOW_DRAG_START, { windowId: win.id } );

	// Snapshot snap config once for the duration of the drag so we
	// don't re-measure the desktop area's bounding rect on every
	// pointermove. Stays accurate because the desktop area's size
	// doesn't change mid-drag in practice.
	const snap = win.snapConfigProvider?.() ?? { enabled: false, cellWidth: 0, cellHeight: 0 };
	// When snap is on, restore a SHORT transition on left/top so the
	// cell-to-cell jumps animate instead of teleporting. The
	// `--dragging` class normally suppresses the base 0.25 s
	// transition (which would lag the cursor on un-snapped drags); the
	// `--snap-drag` class re-enables a quicker 80 ms curve scoped to
	// drag-with-snap.
	if ( snap.enabled ) {
		win.element.classList.add( 'wp-desktop-window--snap-drag' );
	}

	const onDragMove = ( ev: PointerEvent ): void => {
		if ( ! win._isDragging ) {
			return;
		}
		let x = ev.clientX - win._dragOffsetX;
		let y = ev.clientY - win._dragOffsetY;

		// Constrain to desktop bounds.
		const desktop = win.element.parentElement;
		if ( desktop ) {
			x = Math.max( EDGE_MARGIN, Math.min( x, desktop.clientWidth - EDGE_MARGIN ) );
			y = Math.max( EDGE_MARGIN, Math.min( y, desktop.clientHeight - EDGE_MARGIN ) );
		}

		// Quantise to the live grid when snap is on. Round (not floor)
		// so the window settles onto the nearest grid intersection
		// rather than always biasing left/up.
		if ( snap.enabled ) {
			x = Math.round( x / snap.cellWidth ) * snap.cellWidth;
			y = Math.round( y / snap.cellHeight ) * snap.cellHeight;
		}

		win.element.style.left = `${ x }px`;
		win.element.style.top = `${ y }px`;
	};

	const onDragEnd = (): void => {
		if ( ! win._isDragging ) {
			return;
		}
		win._isDragging = false;
		win.element.classList.remove( 'wp-desktop-window--dragging' );
		win.element.classList.remove( 'wp-desktop-window--snap-drag' );
		win._titleBar.removeEventListener( 'pointermove', onDragMove );
		win._titleBar.removeEventListener( 'pointerup', onDragEnd );
		win._titleBar.removeEventListener( 'pointercancel', onDragEnd );
		win._titleBar.removeEventListener( 'lostpointercapture', onDragEnd );
		win._emitChange( 'moved' );
		const payload = {
			windowId: win.id,
			x: win.element.offsetLeft,
			y: win.element.offsetTop,
		};
		doAction( HOOKS.WINDOW_DRAG_END, payload );
		doAction( HOOKS.WINDOW_MOVED, payload );
	};

	win._titleBar.addEventListener( 'pointermove', onDragMove );
	win._titleBar.addEventListener( 'pointerup', onDragEnd );
	win._titleBar.addEventListener( 'pointercancel', onDragEnd );
	win._titleBar.addEventListener( 'lostpointercapture', onDragEnd );
}

/** Resize-handle pointerdown → resize session. */
export function handleResizeStart( win: Window, e: PointerEvent ): void {
	if ( win.state === 'maximized' ) {
		return;
	}

	e.preventDefault();
	e.stopPropagation();

	win._isResizing = true;
	win._resizeStartX = e.clientX;
	win._resizeStartY = e.clientY;
	win._resizeStartW = win.element.offsetWidth;
	win._resizeStartH = win.element.offsetHeight;

	( e.target as HTMLElement ).setPointerCapture( e.pointerId );
	win.element.classList.add( 'wp-desktop-window--resizing' );
	doAction( HOOKS.WINDOW_RESIZE_START, { windowId: win.id } );

	const snap = win.snapConfigProvider?.() ?? { enabled: false, cellWidth: 0, cellHeight: 0 };
	if ( snap.enabled ) {
		win.element.classList.add( 'wp-desktop-window--snap-drag' );
	}

	const onResizeMove = ( ev: PointerEvent ): void => {
		if ( ! win._isResizing ) {
			return;
		}
		let newW = Math.max( win.config.minWidth, win._resizeStartW + ( ev.clientX - win._resizeStartX ) );
		let newH = Math.max( win.config.minHeight, win._resizeStartH + ( ev.clientY - win._resizeStartY ) );
		if ( snap.enabled ) {
			// Snap dimensions to whole grid cells. Re-clamp to
			// minWidth/minHeight afterwards because the round-down
			// could otherwise drop dimensions below the minimum.
			newW = Math.max(
				win.config.minWidth,
				Math.round( newW / snap.cellWidth ) * snap.cellWidth,
			);
			newH = Math.max(
				win.config.minHeight,
				Math.round( newH / snap.cellHeight ) * snap.cellHeight,
			);
		}
		win.element.style.width = `${ newW }px`;
		win.element.style.height = `${ newH }px`;
	};

	const onResizeEnd = (): void => {
		if ( ! win._isResizing ) {
			return;
		}
		win._isResizing = false;
		win.element.classList.remove( 'wp-desktop-window--resizing' );
		win.element.classList.remove( 'wp-desktop-window--snap-drag' );
		const handle = win.element.querySelector( '.wp-desktop-window__resize-handle' ) as HTMLElement;
		handle.removeEventListener( 'pointermove', onResizeMove );
		handle.removeEventListener( 'pointerup', onResizeEnd );
		handle.removeEventListener( 'pointercancel', onResizeEnd );
		handle.removeEventListener( 'lostpointercapture', onResizeEnd );
		win._emitChange( 'resized' );
		const payload = {
			windowId: win.id,
			width: win.element.offsetWidth,
			height: win.element.offsetHeight,
		};
		doAction( HOOKS.WINDOW_RESIZE_END, payload );
		doAction( HOOKS.WINDOW_RESIZED, payload );
	};

	const handle = e.target as HTMLElement;
	handle.addEventListener( 'pointermove', onResizeMove );
	handle.addEventListener( 'pointerup', onResizeEnd );
	handle.addEventListener( 'pointercancel', onResizeEnd );
	handle.addEventListener( 'lostpointercapture', onResizeEnd );
}
