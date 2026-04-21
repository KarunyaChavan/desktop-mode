/**
 * Desktop Mode — AI Assistant spotlight overlay.
 *
 * A conversational assistant panel opened with Cmd+K. The user types any
 * natural-language request — "find my post about Málaga", "where can I
 * see categories?", "do I have any spam comments?" — and the server-side
 * agent loop picks the right tools and returns one of three answer types:
 *
 *   - entity:     a matching post / page / comment; opens in a legacy
 *                 (iframe) window via wp.desktop.windowManager.open().
 *   - navigation: 1-3 wp-admin destinations; each opens in a legacy
 *                 window on click.
 *   - chat:       a plain conversational message; just rendered as text.
 *
 * The overlay stays open until the user explicitly closes it with the ×
 * button, the Escape key, or Cmd+K again.
 *
 * @since 0.14.0
 */

import type { DesktopConfig } from './types';

// ---------------------------------------------------------------------------
// SVG icons
// ---------------------------------------------------------------------------

const ICON_SPARKLE = `<svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true" focusable="false" fill="currentColor">
	<path d="M10 2 L11.8 7.8 L17.5 9.5 L11.8 11.2 L10 17 L8.2 11.2 L2.5 9.5 L8.2 7.8 Z"/>
</svg>`;

const ICON_CLOSE = `<svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false">
	<line x1="2" y1="2" x2="12" y2="12"/>
	<line x1="12" y1="2" x2="2" y2="12"/>
</svg>`;

const ICON_RETURN = `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
	<polyline points="14,4 14,10 3,10"/>
	<polyline points="6,7 3,10 6,13"/>
</svg>`;

const ICON_SPINNER = `<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="wp-desktop-ai__spinner-icon">
	<circle cx="10" cy="10" r="7" stroke-opacity="0.25"/>
	<path d="M10 3 A7 7 0 0 1 17 10" stroke-opacity="1"/>
</svg>`;

const ICON_ARROW = `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<polyline points="6,3 11,8 6,13"/>
</svg>`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AiAssistantApi {
	open(): void;
	close(): void;
	toggle(): void;
	readonly isOpen: boolean;
}

type AnswerType = 'entity' | 'navigation' | 'chat';

interface SearchResult {
	answer_type: AnswerType;
	message:     string;
	entity:      EntityDetail | null;
	admin_links: AdminLink[] | null;
	iterations:  number;
	exhausted:   boolean;
	continue:    ContinueHint | null;
}

interface EntityDetail {
	id:          number;
	type:        'post' | 'page' | 'comment';
	title?:      string;
	excerpt?:    string;
	post_title?: string;
	post_url?:   string;
	ai_summary:  string;
	topic:       string;
	url:         string;
	edit_url:    string;
	date?:       string;
	harmful?:    boolean;
	spam?:       boolean;
}

interface AdminLink {
	title:       string;
	url:         string;
	description: string;
	icon:        string;
}

interface ContinueHint {
	tool:        string;
	entity_type: string;
	offset:      number;
	label:       string;
}

// Minimal shape of the window manager we use — avoids pulling full types.
interface WindowManagerLite {
	open( cfg: {
		id?:    string;
		url:    string;
		title:  string;
		icon?:  string;
		native?: boolean;
	} ): unknown;
}

// ---------------------------------------------------------------------------
// Suggested prompts — shown under the input when there's no result yet.
// Kept short so the panel stays compact.
// ---------------------------------------------------------------------------

const SUGGESTED_PROMPTS = [
	'Find my post about…',
	'Where can I see categories?',
	'Do I have any spam comments?',
	'Take me to plugin settings',
];

// ---------------------------------------------------------------------------
// AiAssistant class
// ---------------------------------------------------------------------------

export class AiAssistant implements AiAssistantApi {
	private _el:          HTMLElement;
	private _input:       HTMLInputElement;
	private _submitBtn:   HTMLButtonElement;
	private _closeBtn:    HTMLButtonElement;
	private _resultsEl:   HTMLElement;
	private _isOpen       = false;
	private _isSearching  = false;
	private _previousFocus: Element | null = null;
	private _aiSearchUrl:       string;
	private _aiSearchStreamUrl: string;
	private _restNonce:         string;
	private _currentStream:     EventSource | null = null;

	constructor( config: { aiSearchUrl: string; aiSearchStreamUrl: string; restNonce: string } ) {
		this._aiSearchUrl       = config.aiSearchUrl;
		this._aiSearchStreamUrl = config.aiSearchStreamUrl;
		this._restNonce         = config.restNonce;

		this._el = this._buildDOM();
		document.body.appendChild( this._el );

		this._input     = this._el.querySelector( '.wp-desktop-ai__input' )!;
		this._submitBtn = this._el.querySelector( '.wp-desktop-ai__submit' )!;
		this._closeBtn  = this._el.querySelector( '.wp-desktop-ai__close' )!;
		this._resultsEl = this._el.querySelector( '.wp-desktop-ai__results' )!;

		this._bindEvents();
		this._renderSuggestions();
	}

	// ------------------------------------------------------------------
	// Public API
	// ------------------------------------------------------------------

	open(): void {
		if ( this._isOpen ) {
			this._input.focus();
			this._input.select();
			return;
		}
		this._isOpen = true;
		this._previousFocus = document.activeElement;

		// Reset the input and return the results area to the suggestion
		// chips so every open feels like a fresh conversation — no stale
		// query carrying over from the previous session.
		this._input.value = '';
		this._submitBtn.classList.remove( 'has-value' );
		this._renderSuggestions();

		this._el.removeAttribute( 'hidden' );
		void this._el.offsetHeight;
		this._el.classList.add( 'is-open' );
		this._el.setAttribute( 'aria-hidden', 'false' );

		requestAnimationFrame( () => this._input.focus() );
	}

	close(): void {
		if ( ! this._isOpen ) return;
		this._isOpen = false;
		this._el.classList.remove( 'is-open' );
		this._el.setAttribute( 'aria-hidden', 'true' );
		// Abort any in-flight streaming request so we don't keep an open
		// HTTP connection to the server after the user closes the panel.
		this._closeStream();
		this._isSearching = false;
		this._submitBtn.disabled = false;
		this._input.disabled     = false;

		const onEnd = ( e: TransitionEvent ) => {
			if ( e.target !== this._el || e.propertyName !== 'opacity' ) return;
			this._el.setAttribute( 'hidden', '' );
			this._el.removeEventListener( 'transitionend', onEnd );
			if ( this._previousFocus instanceof HTMLElement ) {
				this._previousFocus.focus();
			}
		};
		this._el.addEventListener( 'transitionend', onEnd );
	}

	toggle(): void {
		this._isOpen ? this.close() : this.open();
	}

	get isOpen(): boolean {
		return this._isOpen;
	}

	// ------------------------------------------------------------------
	// Events
	// ------------------------------------------------------------------

	private _bindEvents(): void {
		// Cmd/Ctrl+K — capture phase so iframes don't swallow it.
		document.addEventListener( 'keydown', ( e: KeyboardEvent ) => {
			if ( ( e.metaKey || e.ctrlKey ) && e.key === 'k' && ! e.shiftKey && ! e.altKey ) {
				e.preventDefault();
				this.toggle();
			}
		}, true );

		// Escape closes.
		this._el.addEventListener( 'keydown', ( e: KeyboardEvent ) => {
			if ( e.key === 'Escape' ) {
				e.stopPropagation();
				this.close();
				return;
			}
		} );

		// Tab focus trap.
		this._el.addEventListener( 'keydown', ( e: KeyboardEvent ) => {
			if ( e.key !== 'Tab' ) return;
			const focusable = [ this._closeBtn, this._input, this._submitBtn ]
				.filter( ( el ) => ! el.disabled );
			const first = focusable[ 0 ];
			const last  = focusable[ focusable.length - 1 ];
			if ( e.shiftKey && document.activeElement === first ) {
				e.preventDefault();
				last.focus();
			} else if ( ! e.shiftKey && document.activeElement === last ) {
				e.preventDefault();
				first.focus();
			}
		} );

		// Admin-bar button signal.
		document.addEventListener( 'wp-desktop-open-ai', () => this.open() );

		// Close button.
		this._closeBtn.addEventListener( 'click', () => this.close() );

		// Submit.
		this._submitBtn.addEventListener( 'click', () => this._onSubmit() );
		this._input.addEventListener( 'keydown', ( e: KeyboardEvent ) => {
			if ( e.key === 'Enter' && ! e.shiftKey ) {
				e.preventDefault();
				this._onSubmit();
			}
		} );

		// Toggle submit arrow based on input content; also re-render
		// suggestions when cleared.
		this._input.addEventListener( 'input', () => {
			const hasValue = this._input.value.trim().length > 0;
			this._submitBtn.classList.toggle( 'has-value', hasValue );
			if ( ! hasValue ) {
				this._renderSuggestions();
			}
		} );
	}

	// ------------------------------------------------------------------
	// Flow
	// ------------------------------------------------------------------

	private async _onSubmit(): Promise<void> {
		const query = this._input.value.trim();
		if ( ! query || this._isSearching ) return;
		await this._runSearch( query, null, 0 );
	}

	private _runSearch(
		query:       string,
		resumeTool:  string | null,
		startOffset: number,
	): void {
		if ( this._isSearching ) return;
		this._isSearching        = true;
		this._submitBtn.disabled = true;
		this._input.disabled     = true;
		this._showThinking( 'Thinking…' );

		// Prefer SSE streaming so the user sees real-time progress ticks
		// ("Looking through your posts…"). Falls back to a plain fetch
		// against the REST endpoint if EventSource is unavailable or the
		// stream URL wasn't provisioned by PHP.
		if ( typeof EventSource !== 'undefined' && this._aiSearchStreamUrl ) {
			this._runSearchStream( query, resumeTool, startOffset );
		} else {
			this._runSearchFetch( query, resumeTool, startOffset );
		}
	}

	/**
	 * EventSource-based streaming — the preferred path. Shows real-time
	 * progress messages as the agent picks tools and runs them.
	 */
	private _runSearchStream(
		query:       string,
		resumeTool:  string | null,
		startOffset: number,
	): void {
		const url = new URL( this._aiSearchStreamUrl, window.location.origin );
		url.searchParams.set( 'nonce', this._restNonce );
		url.searchParams.set( 'query', query );
		if ( resumeTool ) {
			url.searchParams.set( 'resume_tool', resumeTool );
			url.searchParams.set( 'start_offset', String( startOffset ) );
		}

		this._closeStream();
		const es = new EventSource( url.toString() );
		this._currentStream = es;

		const finish = () => {
			es.close();
			this._currentStream = null;
			this._isSearching        = false;
			this._submitBtn.disabled = false;
			this._input.disabled     = false;
			this._input.focus();
		};

		es.onmessage = ( ev ) => {
			let data: { event?: string; message?: string; result?: SearchResult };
			try {
				data = JSON.parse( ev.data );
			} catch {
				return;
			}
			if ( ! data || typeof data !== 'object' ) return;

			switch ( data.event ) {
				case 'open':
					// Connection established — keep the initial "Thinking…".
					break;
				case 'progress':
					if ( typeof data.message === 'string' ) {
						this._showThinking( data.message );
					}
					break;
				case 'done':
					if ( data.result ) {
						this._showResult( query, data.result );
					}
					finish();
					break;
				case 'error':
					this._showError( data.message ?? 'Something went wrong.' );
					finish();
					break;
			}
		};

		es.onerror = () => {
			// Connection dropped mid-stream. If we never received 'done'
			// we need to show a user-visible error, otherwise the user
			// would stare at a stale "Thinking…".
			if ( this._currentStream === es ) {
				this._showError( 'Lost connection to the assistant. Please try again.' );
				finish();
			}
		};
	}

	/**
	 * Legacy fetch path — used when EventSource is not available.
	 */
	private async _runSearchFetch(
		query:       string,
		resumeTool:  string | null,
		startOffset: number,
	): Promise<void> {
		try {
			const body: Record<string, unknown> = { query };
			if ( resumeTool ) {
				body.resume_tool  = resumeTool;
				body.start_offset = startOffset;
			}

			const res = await fetch( this._aiSearchUrl, {
				method:  'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-WP-Nonce':  this._restNonce,
				},
				body: JSON.stringify( body ),
			} );

			if ( ! res.ok ) {
				const err = await res.json().catch( () => ( {} ) );
				this._showError( ( err as { message?: string } ).message ?? `Server returned ${ res.status }` );
				return;
			}

			this._showResult( query, await res.json() as SearchResult );
		} catch {
			this._showError( 'Network error — please check your connection and try again.' );
		} finally {
			this._isSearching        = false;
			this._submitBtn.disabled = false;
			this._input.disabled     = false;
			this._input.focus();
		}
	}

	private _closeStream(): void {
		if ( this._currentStream ) {
			this._currentStream.close();
			this._currentStream = null;
		}
	}

	// ------------------------------------------------------------------
	// Open helpers — everything opens as a legacy iframe window, not a
	// new browser tab, so the admin experience stays inside the desktop.
	// ------------------------------------------------------------------

	private _getWindowManager(): WindowManagerLite | null {
		const wm = ( window as unknown as {
			wp?: { desktop?: { windowManager?: WindowManagerLite } };
		} ).wp?.desktop?.windowManager;
		return wm ?? null;
	}

	private _openInLegacyWindow( url: string, title: string, icon?: string ): void {
		const wm = this._getWindowManager();
		if ( ! wm ) {
			// Graceful fallback — if the shell isn't initialised yet,
			// just open in a new tab rather than silently doing nothing.
			window.open( url, '_blank', 'noopener' );
			return;
		}
		wm.open( { url, title, icon: icon ?? 'dashicons-admin-generic' } );
		this.close();
	}

	// ------------------------------------------------------------------
	// Rendering
	// ------------------------------------------------------------------

	private _renderSuggestions(): void {
		this._resultsEl.hidden   = false;
		this._resultsEl.innerHTML = `
			<div class="wp-desktop-ai__suggestions">
				<p class="wp-desktop-ai__suggestions-label">${ this._esc( 'Try asking' ) }</p>
				<div class="wp-desktop-ai__suggestions-list">
					${ SUGGESTED_PROMPTS.map(
						( p ) => `<button type="button" class="wp-desktop-ai__suggestion" data-prompt="${ this._esc( p ) }">
							${ this._esc( p ) }
						</button>`,
					).join( '' ) }
				</div>
			</div>
		`;

		// Wire suggestion clicks — fill the input and submit.
		this._resultsEl
			.querySelectorAll<HTMLButtonElement>( '.wp-desktop-ai__suggestion' )
			.forEach( ( btn ) => {
				btn.addEventListener( 'click', () => {
					const prompt = btn.dataset.prompt ?? '';
					this._input.value = prompt;
					this._submitBtn.classList.add( 'has-value' );
					this._input.focus();
				} );
			} );
	}

	private _showThinking( message: string = 'Thinking…' ): void {
		this._resultsEl.hidden    = false;
		this._resultsEl.innerHTML = `
			<div class="wp-desktop-ai__state wp-desktop-ai__state--thinking">
				${ ICON_SPINNER }
				<span>${ this._esc( message ) }</span>
			</div>
		`;
	}

	private _showError( message: string ): void {
		this._resultsEl.hidden    = false;
		this._resultsEl.innerHTML = `
			<div class="wp-desktop-ai__state wp-desktop-ai__state--error">
				<span>${ this._esc( message ) }</span>
			</div>
		`;
	}

	private _showResult( query: string, data: SearchResult ): void {
		this._resultsEl.hidden = false;

		// Assistant-styled message bubble appears at the top of every
		// answer regardless of answer_type — so the UX always feels like
		// a reply from the assistant.
		const messageHtml = `
			<div class="wp-desktop-ai__bubble">
				<span class="wp-desktop-ai__bubble-icon">${ ICON_SPARKLE }</span>
				<p class="wp-desktop-ai__bubble-text">${ this._esc( data.message || '' ) }</p>
			</div>
		`;

		let bodyHtml = '';
		if ( data.answer_type === 'entity' && data.entity ) {
			bodyHtml = this._renderEntityCard( data.entity );
		} else if ( data.answer_type === 'navigation' && data.admin_links && data.admin_links.length > 0 ) {
			bodyHtml = this._renderAdminLinks( data.admin_links );
		}

		// Continue-search hint (only appears after budget exhaustion).
		if ( data.continue ) {
			bodyHtml += `
				<button type="button" class="wp-desktop-ai__continue-btn"
					data-tool="${ this._esc( data.continue.tool ) }"
					data-offset="${ data.continue.offset }"
					data-query="${ this._esc( query ) }">
					${ this._esc( data.continue.label ) }
				</button>
			`;
		}

		this._resultsEl.innerHTML = messageHtml + bodyHtml;

		// Wire entity "Open" button.
		this._resultsEl.querySelectorAll<HTMLButtonElement>(
			'.wp-desktop-ai__entity-open',
		).forEach( ( btn ) => {
			btn.addEventListener( 'click', () => {
				const url   = btn.dataset.url ?? '';
				const title = btn.dataset.title ?? '';
				const icon  = btn.dataset.icon ?? 'dashicons-admin-generic';
				if ( url ) this._openInLegacyWindow( url, title, icon );
			} );
		} );

		// Wire admin-link clicks.
		this._resultsEl.querySelectorAll<HTMLButtonElement>(
			'.wp-desktop-ai__admin-link',
		).forEach( ( btn ) => {
			btn.addEventListener( 'click', () => {
				const url   = btn.dataset.url ?? '';
				const title = btn.dataset.title ?? '';
				const icon  = btn.dataset.icon ?? 'dashicons-admin-generic';
				if ( url ) this._openInLegacyWindow( url, title, icon );
			} );
		} );

		// Wire continue button.
		const cont = this._resultsEl.querySelector<HTMLButtonElement>( '.wp-desktop-ai__continue-btn' );
		if ( cont ) {
			cont.addEventListener( 'click', () => {
				const tool   = cont.dataset.tool ?? null;
				const offset = parseInt( cont.dataset.offset ?? '0', 10 );
				const q      = cont.dataset.query ?? query;
				this._runSearch( q, tool, offset );
			} );
		}
	}

	private _renderEntityCard( e: EntityDetail ): string {
		const isComment  = e.type === 'comment';
		const title      = isComment
			? `Comment on “${ this._esc( e.post_title ?? 'post' ) }”`
			: this._esc( e.title ?? 'Untitled' );
		const summary    = this._esc( e.ai_summary || e.excerpt || '' );
		const typeLabel  = e.type.charAt( 0 ).toUpperCase() + e.type.slice( 1 );
		const topicChip  = e.topic ? `<span class="wp-desktop-ai__entity-topic">${ this._esc( e.topic ) }</span>` : '';

		// Pick a Dashicon for the window icon based on entity type.
		const icon = isComment ? 'dashicons-admin-comments'
			: e.type === 'page' ? 'dashicons-admin-page'
			: 'dashicons-admin-post';

		return `
			<div class="wp-desktop-ai__entity">
				<div class="wp-desktop-ai__entity-header">
					${ topicChip }
					<span class="wp-desktop-ai__entity-type">${ this._esc( typeLabel ) }</span>
				</div>
				<h3 class="wp-desktop-ai__entity-title">${ title }</h3>
				<p class="wp-desktop-ai__entity-summary">${ summary }</p>
				<button type="button"
					class="wp-desktop-ai__entity-open"
					data-url="${ this._esc( e.edit_url ) }"
					data-title="${ this._esc( e.title ?? e.post_title ?? typeLabel ) }"
					data-icon="${ icon }">
					<span>${ this._esc( `Open ${ typeLabel.toLowerCase() } in desktop` ) }</span>
					${ ICON_ARROW }
				</button>
			</div>
		`;
	}

	private _renderAdminLinks( links: AdminLink[] ): string {
		const items = links.map( ( link ) => `
			<button type="button"
				class="wp-desktop-ai__admin-link"
				data-url="${ this._esc( link.url ) }"
				data-title="${ this._esc( link.title ) }"
				data-icon="${ this._esc( link.icon ) }">
				<span class="wp-desktop-ai__admin-link-icon dashicons ${ this._esc( link.icon ) }" aria-hidden="true"></span>
				<span class="wp-desktop-ai__admin-link-body">
					<span class="wp-desktop-ai__admin-link-title">${ this._esc( link.title ) }</span>
					<span class="wp-desktop-ai__admin-link-desc">${ this._esc( link.description ) }</span>
				</span>
				<span class="wp-desktop-ai__admin-link-arrow">${ ICON_ARROW }</span>
			</button>
		` ).join( '' );

		return `<div class="wp-desktop-ai__admin-links">${ items }</div>`;
	}

	/** Minimal HTML escaping for text interpolated into innerHTML. */
	private _esc( str: string ): string {
		return str
			.replace( /&/g, '&amp;' )
			.replace( /</g, '&lt;' )
			.replace( />/g, '&gt;' )
			.replace( /"/g, '&quot;' );
	}

	// ------------------------------------------------------------------
	// DOM scaffold
	// ------------------------------------------------------------------

	private _buildDOM(): HTMLElement {
		const el = document.createElement( 'div' );
		el.id = 'wp-desktop-ai-assistant';
		el.className = 'wp-desktop-ai';
		el.setAttribute( 'role', 'dialog' );
		el.setAttribute( 'aria-modal', 'true' );
		el.setAttribute( 'aria-label', 'AI Assistant' );
		el.setAttribute( 'aria-hidden', 'true' );
		el.setAttribute( 'hidden', '' );

		el.innerHTML = `
			<div class="wp-desktop-ai__backdrop" aria-hidden="true"></div>
			<div class="wp-desktop-ai__panel">
				<div class="wp-desktop-ai__header">
					<span class="wp-desktop-ai__header-icon">${ ICON_SPARKLE }</span>
					<span class="wp-desktop-ai__header-label">AI Assistant</span>
					<button type="button" class="wp-desktop-ai__close" aria-label="Close">
						${ ICON_CLOSE }
					</button>
				</div>
				<div class="wp-desktop-ai__input-wrap">
					<span class="wp-desktop-ai__input-icon">${ ICON_SPARKLE }</span>
					<input
						class="wp-desktop-ai__input"
						type="text"
						placeholder="How can I help?"
						autocomplete="off"
						spellcheck="false"
						aria-label="Ask the AI assistant"
					/>
					<button type="button" class="wp-desktop-ai__submit" aria-label="Send">
						${ ICON_RETURN }
					</button>
				</div>
				<div class="wp-desktop-ai__results" hidden></div>
				<div class="wp-desktop-ai__footer">
					<span class="wp-desktop-ai__footer-hint">
						Your assistant for finding content and navigating wp-admin
					</span>
					<span class="wp-desktop-ai__footer-keys" aria-hidden="true">
						<kbd>&#8629;</kbd> ask
					</span>
				</div>
			</div>
		`;

		return el;
	}
}
