/**
 * `<wpd-text-field>` — labelled text input primitive.
 *
 * Sits alongside `<wpd-color-field>` / `<wpd-range-field>` /
 * `<wpd-number-field>` in the kit of labelled inputs; use it
 * anywhere a native window needs free-form text entry — search
 * boxes, notes, renameable labels, form fields.
 *
 * ```html
 * <wpd-text-field
 *     label="Note title"
 *     value="Untitled"
 *     placeholder="Name this note"
 *     autocomplete="off"
 * ></wpd-text-field>
 * ```
 *
 * Emits `wpd-input-change` with `{ value: string }` on every user
 * keystroke (debounced once per `input` event firing — same cadence
 * as `<wpd-range-field>`). Callers that need Enter-to-submit can
 * listen for the `wpd-submit` event the component fires when the
 * user presses Enter without Shift.
 *
 * @since 0.11.0
 */

import {
	Component,
	defineComponent,
	ensureAutoId,
	html,
} from '../../core';
import { textFieldStyles } from './wpd-text-field.styles';

export class WpdTextField extends Component {
	static props = [
		'label',
		'value',
		'placeholder',
		'disabled',
		'readonly',
		'autocomplete',
		'type',
		'maxlength',
		'minlength',
		'pattern',
		'name',
		'suffix',
		'invalid',
	] as const;
	static styles = [ textFieldStyles ];

	connectedCallback(): void {
		super.connectedCallback();
		// Deterministic id derived from native-window + tab
		// ancestry + the `label` attribute. See `src/ui/core/auto-id.ts`.
		// Only applied when the caller hasn't set one explicitly —
		// plugin authors keep full control by passing `id="…"`.
		ensureAutoId( this );
	}

	protected render() {
		const label = ( this as unknown as { label: string | null } ).label || '';
		const value = ( this as unknown as { value: string | null } ).value ?? '';
		const placeholder =
			( this as unknown as { placeholder: string | null } ).placeholder ||
			'';
		const disabled =
			( this as unknown as { disabled: string | null } ).disabled !== null;
		const readonly =
			( this as unknown as { readonly: string | null } ).readonly !== null;
		const autocomplete =
			( this as unknown as { autocomplete: string | null } ).autocomplete ||
			'off';
		const type =
			( this as unknown as { type: string | null } ).type || 'text';
		const maxLength = ( this as unknown as { maxlength: string | null } )
			.maxlength;
		const minLength = ( this as unknown as { minlength: string | null } )
			.minlength;
		const pattern =
			( this as unknown as { pattern: string | null } ).pattern || '';
		const name =
			( this as unknown as { name: string | null } ).name || '';
		const suffix =
			( this as unknown as { suffix: string | null } ).suffix || '';
		const invalid =
			( this as unknown as { invalid: string | null } ).invalid !== null;

		// Shadow-DOM <label for=…> pairing. `this.id` is populated
		// by ensureAutoId on connect (or by the caller's own id).
		// The inner control's id is deterministic too, derived from
		// the host id + the conventional `__input` suffix.
		const hostId = this.id || 'wpd-unnamed';
		const inputId = `${ hostId }__input`;

		return html`
			${ label
				? html`<label
						class="wpd-text-field__label"
						for=${ inputId }
					>${ label }</label>`
				: html`` }
			<span class="wpd-text-field__row">
				<input
					id=${ inputId }
					type=${ type }
					.value=${ value }
					placeholder=${ placeholder }
					?disabled=${ disabled }
					?readonly=${ readonly }
					autocomplete=${ autocomplete }
					maxlength=${ maxLength ?? '' }
					minlength=${ minLength ?? '' }
					pattern=${ pattern }
					name=${ name }
					aria-invalid=${ invalid ? 'true' : 'false' }
					aria-label=${ label || '' }
					@input=${ ( e: Event ) => this._onInput( e ) }
					@change=${ ( e: Event ) => this._onChange( e ) }
					@keydown=${ ( e: KeyboardEvent ) => this._onKeyDown( e ) }
				/>
				${ suffix
					? html`<span class="wpd-text-field__suffix">${ suffix }</span>`
					: html`` }
			</span>
		`;
	}

	private _onInput( e: Event ): void {
		const input = e.target as HTMLInputElement;
		( this as unknown as { value: string } ).value = input.value;
		this.emit( 'wpd-input-change', { value: input.value } );
	}

	private _onChange( e: Event ): void {
		// `change` fires after focus-loss — a looser debounce for
		// callers who only care about the final value (form submit,
		// save-on-blur). `wpd-input-change` already fires on every
		// keystroke; this event is the commit-point signal.
		const input = e.target as HTMLInputElement;
		this.emit( 'wpd-input-commit', { value: input.value } );
	}

	private _onKeyDown( e: KeyboardEvent ): void {
		if ( e.key === 'Enter' && ! e.shiftKey && ! e.altKey && ! e.metaKey ) {
			const input = e.target as HTMLInputElement;
			this.emit( 'wpd-submit', { value: input.value } );
		}
	}
}
defineComponent( 'wpd-text-field', WpdTextField );
