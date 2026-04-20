/**
 * `<wpd-key>` — semantic key cap. A press-sensitive tile that
 * fires a `wpd-key` CustomEvent both on click AND when the
 * matching `event.key` / `event.code` is pressed anywhere on
 * the owning document. Intended for calculators, keyboards,
 * synths, keybinding demos — anything that needs a "real key"
 * with a live press animation plus a clear physical-key contract.
 *
 * Usage:
 *
 *   <wpd-key key="7"        label="7"></wpd-key>
 *   <wpd-key key="Enter"    label="="></wpd-key>
 *   <wpd-key key="Escape"   label="AC"></wpd-key>
 *   <wpd-key code="NumpadAdd" key="+" label="+"></wpd-key>
 *
 *   document.addEventListener( 'wpd-key', ( e ) => {
 *     console.log( e.detail.key, e.detail.source );
 *   } );
 *
 * Attributes:
 *   - `key`     — KeyboardEvent.key to match. Case-sensitive, per the spec.
 *   - `code`    — KeyboardEvent.code to match (takes priority over `key`
 *                 when set). Good for positional keys (NumpadAdd,
 *                 KeyA) that shouldn't match the shifted variant.
 *   - `label`   — visible text. Falls back to the default slot.
 *   - `variant` — `primary` | `secondary` | `ghost` | `danger` (mirrors
 *                 `<wpd-button>`). Default `ghost`.
 *   - `fill-cell` — boolean; keys fill their parent grid cell.
 *                 Default on — calculators are the common case.
 *   - `hold`    — boolean; press + release dispatch separate
 *                 `wpd-key-down` / `wpd-key-up` events instead of
 *                 the single `wpd-key`. Useful for synths and games.
 *   - `modifier` — `ctrl` | `alt` | `shift` | `meta` | combos joined
 *                 with `+` (e.g. `ctrl+shift`). Required for the key
 *                 match to fire when those modifiers are held.
 *
 * Events:
 *   - `wpd-key`      — fires once per press (click OR keydown).
 *                      `detail: { key, code, label, source: 'click' | 'keyboard' }`.
 *   - `wpd-key-down` — only when `hold` is set. Same detail shape.
 *   - `wpd-key-up`   — only when `hold` is set. Same detail shape.
 *
 * Every event bubbles and `composed: true`, so listeners can live
 * anywhere in the tree including the shadow of a parent component.
 *
 * @since 0.10.0
 */

import { Component, defineComponent, html } from '../../core';
import { styles } from './wpd-key.styles';

const PRESSED_CLASS = 'wpd-key--pressed';

type KeySource = 'click' | 'keyboard';

interface WpdKeyDetail {
	key: string;
	code: string;
	label: string;
	source: KeySource;
}

export class WpdKey extends Component {
	static props = [
		'key',
		'code',
		'label',
		'variant',
		'fill-cell',
		'hold',
		'modifier',
		'disabled',
	] as const;
	static styles = [ styles ];

	private _onKeyDown: ( ( e: KeyboardEvent ) => void ) | null = null;
	private _onKeyUp: ( ( e: KeyboardEvent ) => void ) | null = null;
	private _keyHeldByKeyboard = false;

	connectedCallback(): void {
		super.connectedCallback?.();
		this._onKeyDown = ( e: KeyboardEvent ) => this.handleKeyboardDown( e );
		this._onKeyUp = ( e: KeyboardEvent ) => this.handleKeyboardUp( e );
		document.addEventListener( 'keydown', this._onKeyDown );
		document.addEventListener( 'keyup', this._onKeyUp );
	}

	disconnectedCallback(): void {
		if ( this._onKeyDown ) {
			document.removeEventListener( 'keydown', this._onKeyDown );
		}
		if ( this._onKeyUp ) {
			document.removeEventListener( 'keyup', this._onKeyUp );
		}
	}

	protected render() {
		const label = ( this as unknown as { label: string | null } ).label;
		const disabled =
			( this as unknown as { disabled: string | null } ).disabled !== null;
		return html`
			<button
				part="button"
				type="button"
				?disabled=${ disabled }
				@click=${ ( e: MouseEvent ) => this.handleClick( e ) }
			>
				${ label !== null && label !== undefined && label !== ''
		? label
		: html`<slot></slot>` }
			</button>
		`;
	}

	private handleClick( e: MouseEvent ): void {
		if ( this.isDisabled() ) {
			return;
		}
		const detail = this.buildDetail( 'click' );
		this.flashPressed();
		if ( this.hasAttribute( 'hold' ) ) {
			this.emitKey( 'wpd-key-down', detail );
			this.emitKey( 'wpd-key-up', detail );
		} else {
			this.emitKey( 'wpd-key', detail );
		}
		e.stopPropagation();
	}

	private handleKeyboardDown( e: KeyboardEvent ): void {
		if ( this.isDisabled() || ! this.matchesEvent( e ) ) {
			return;
		}
		if ( this._keyHeldByKeyboard ) {
			return;
		}
		this._keyHeldByKeyboard = true;
		this.classList.add( PRESSED_CLASS );
		const detail = this.buildDetail( 'keyboard' );
		if ( this.hasAttribute( 'hold' ) ) {
			this.emitKey( 'wpd-key-down', detail );
		} else {
			this.emitKey( 'wpd-key', detail );
		}
	}

	private handleKeyboardUp( e: KeyboardEvent ): void {
		if ( ! this._keyHeldByKeyboard || ! this.matchesEvent( e, /* up */ true ) ) {
			return;
		}
		this._keyHeldByKeyboard = false;
		this.classList.remove( PRESSED_CLASS );
		if ( this.hasAttribute( 'hold' ) ) {
			this.emitKey( 'wpd-key-up', this.buildDetail( 'keyboard' ) );
		}
	}

	/**
	 * Decide whether an incoming KeyboardEvent matches the key cap.
	 * Prefers `code` (positional) when set, falls back to `key`
	 * (character / named). Modifier-matching is strict: if
	 * `modifier` is absent, no modifier may be held; if present,
	 * ALL listed modifiers must be held. Prevents a bare `7` key
	 * from firing when the user presses Ctrl+7.
	 */
	private matchesEvent( e: KeyboardEvent, _isUp = false ): boolean {
		const expectedCode =
			( this as unknown as { code: string | null } ).code || '';
		const expectedKey =
			( this as unknown as { key: string | null } ).key || '';
		if ( expectedCode ) {
			if ( e.code !== expectedCode ) {
				return false;
			}
		} else if ( expectedKey ) {
			if ( e.key !== expectedKey ) {
				return false;
			}
		} else {
			return false;
		}

		const rawMod =
			( this as unknown as { modifier: string | null } ).modifier || '';
		const required = new Set(
			rawMod
				.split( '+' )
				.map( ( s ) => s.trim().toLowerCase() )
				.filter( Boolean ),
		);
		const expectCtrl = required.has( 'ctrl' ) || required.has( 'control' );
		const expectAlt = required.has( 'alt' );
		const expectShift = required.has( 'shift' );
		const expectMeta =
			required.has( 'meta' ) || required.has( 'cmd' ) || required.has( 'command' );

		return (
			e.ctrlKey === expectCtrl &&
			e.altKey === expectAlt &&
			e.shiftKey === expectShift &&
			e.metaKey === expectMeta
		);
	}

	private buildDetail( source: KeySource ): WpdKeyDetail {
		const label =
			( this as unknown as { label: string | null } ).label ||
			this.textContent?.trim() ||
			'';
		return {
			key: ( this as unknown as { key: string | null } ).key || '',
			code: ( this as unknown as { code: string | null } ).code || '',
			label,
			source,
		};
	}

	private isDisabled(): boolean {
		return ( this as unknown as { disabled: string | null } ).disabled !== null;
	}

	private emitKey( type: string, detail: WpdKeyDetail ): void {
		this.dispatchEvent(
			new CustomEvent< WpdKeyDetail >( type, {
				detail,
				bubbles: true,
				composed: true,
			} ),
		);
	}

	/**
	 * Brief visual press flash for click-driven presses — keyboard
	 * presses get the pressed class via the keydown/keyup pair.
	 * Timeout matches the CSS transition so the paint window
	 * roughly aligns with the state flip.
	 */
	private flashPressed(): void {
		this.classList.add( PRESSED_CLASS );
		window.setTimeout( () => {
			this.classList.remove( PRESSED_CLASS );
		}, 120 );
	}
}
defineComponent( 'wpd-key', WpdKey );
