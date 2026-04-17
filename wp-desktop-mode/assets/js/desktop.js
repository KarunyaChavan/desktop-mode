/******/ (() => { // webpackBootstrap
/******/ 	"use strict";

;// ./src/utils.ts
/**
 * Desktop Mode — Shared Utilities.
 *
 * @since 6.9.0
 */
/**
 * Derive a window ID from an admin page URL.
 *
 * Strips the admin base URL and special characters to produce
 * a clean slug suitable for use as a DOM id attribute.
 *
 * @param url      The full admin page URL.
 * @param adminUrl The base admin URL (e.g., 'http://localhost/wp-admin/').
 * @return A sanitized window ID string.
 */
function deriveWindowId(url, adminUrl) {
    let path = url.replace(adminUrl, '');
    // Remove leading slash.
    if (path.startsWith('/')) {
        path = path.substring(1);
    }
    // Replace special chars with dashes for a clean DOM id.
    return path
        .replace(/\.php/g, '-php')
        .replace(/[?&=]/g, '-')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'index';
}
/**
 * Sanitize a string for safe use as a CSS class name.
 *
 * Strips any characters that are not alphanumeric, hyphens, or underscores.
 *
 * @param value The raw class name value.
 * @return The sanitized class name.
 */
function sanitizeClassName(value) {
    return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

;// ./src/window.ts
/**
 * Desktop Mode — Window.
 *
 * A single desktop window: title bar, iframe content, drag, resize, state management.
 *
 * @since 6.9.0
 */

/** Minimum distance from viewport edges when dragging. */
const EDGE_MARGIN = 8;
/**
 * Returns the URL with the chromeless query parameter set, so the iframe
 * keeps rendering without the admin shell. Returns null for cross-origin
 * URLs so the caller can refuse the navigation.
 */
function withChromelessParam(url) {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin !== window.location.origin) {
        return null;
    }
    parsed.searchParams.set('wp_desktop', '1');
    return parsed.toString();
}
/**
 * Returns a comparable key for two URLs so the active tab can be detected
 * regardless of the chromeless flag or trailing slashes.
 */
function urlMatchKey(url) {
    try {
        const parsed = new URL(url, window.location.origin);
        parsed.searchParams.delete('wp_desktop');
        return parsed.pathname.replace(/\/+$/, '') + '?' + parsed.searchParams.toString();
    }
    catch {
        return url;
    }
}
/**
 * Build a title-bar control button with an inline SVG icon.
 *
 * Using inline SVG (rather than a dashicon font glyph) keeps icons crisp
 * at any size and lets them inherit `currentColor` so they adapt to the
 * focused / unfocused title-bar state without separate CSS rules.
 */
function createControlButton(variant, label, svgInner) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `wp-desktop-window__btn wp-desktop-window__btn--${variant}`;
    btn.setAttribute('aria-label', label);
    btn.innerHTML = `<svg class="wp-desktop-window__btn-icon" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">${svgInner}</svg>`;
    return btn;
}
/**
 * Creates the DOM structure for a desktop window.
 */
function createWindowElement(config) {
    const el = document.createElement('div');
    el.className = 'wp-desktop-window';
    el.id = `wp-window-${config.id}`;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-labelledby', `wp-window-title-${config.id}`);
    el.style.left = `${config.x}px`;
    el.style.top = `${config.y}px`;
    el.style.width = `${config.width}px`;
    el.style.height = `${config.height}px`;
    const titleBar = document.createElement('div');
    titleBar.className = 'wp-desktop-window__titlebar';
    const iconEl = document.createElement('span');
    iconEl.className = `wp-desktop-window__icon dashicons ${sanitizeClassName(config.icon)}`;
    iconEl.setAttribute('aria-hidden', 'true');
    const titleEl = document.createElement('span');
    titleEl.className = 'wp-desktop-window__title';
    titleEl.id = `wp-window-title-${config.id}`;
    titleEl.textContent = config.title;
    const controls = document.createElement('div');
    controls.className = 'wp-desktop-window__controls';
    const btnMin = createControlButton('minimize', 'Minimize', '<path d="M3 6h6" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>');
    const btnMax = createControlButton('maximize', 'Maximize', '<rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.25" fill="none"/>');
    const btnFocus = createControlButton('focus', 'Enter fullscreen', '<path d="M4.5 2H2v2.5M10 4.5V2H7.5M4.5 10H2V7.5M10 7.5V10H7.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" fill="none"/>');
    const btnClose = createControlButton('close', 'Close', '<path d="M3.25 3.25l5.5 5.5M3.25 8.75l5.5-5.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>');
    controls.appendChild(btnMin);
    controls.appendChild(btnMax);
    controls.appendChild(btnFocus);
    controls.appendChild(btnClose);
    // Screen meta buttons container (populated when iframe reports available panels).
    const screenMeta = document.createElement('div');
    screenMeta.className = 'wp-desktop-window__screen-meta';
    titleBar.appendChild(iconEl);
    titleBar.appendChild(titleEl);
    titleBar.appendChild(screenMeta);
    titleBar.appendChild(controls);
    const body = document.createElement('div');
    body.className = 'wp-desktop-window__body';
    const iframe = document.createElement('iframe');
    iframe.className = 'wp-desktop-window__iframe';
    iframe.setAttribute('name', `wp-desktop-frame-${config.id}`);
    const chromelessSrc = withChromelessParam(config.url);
    iframe.src = chromelessSrc ?? 'about:blank';
    body.appendChild(iframe);
    // Resize handle.
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'wp-desktop-window__resize-handle';
    el.appendChild(titleBar);
    // Tab strip — submenu items navigate the iframe within the same window.
    if (config.submenu && config.submenu.length > 0) {
        const tabs = document.createElement('nav');
        tabs.className = 'wp-desktop-window__tabs';
        tabs.setAttribute('role', 'tablist');
        tabs.setAttribute('aria-label', `${config.title} sub-pages`);
        const initialKey = urlMatchKey(config.url);
        for (const sub of config.submenu) {
            const tab = document.createElement('button');
            tab.className = 'wp-desktop-window__tab';
            tab.setAttribute('type', 'button');
            tab.setAttribute('role', 'tab');
            tab.dataset.url = sub.url;
            tab.textContent = sub.title;
            if (urlMatchKey(sub.url) === initialKey) {
                tab.classList.add('wp-desktop-window__tab--active');
                tab.setAttribute('aria-selected', 'true');
            }
            else {
                tab.setAttribute('aria-selected', 'false');
            }
            tabs.appendChild(tab);
        }
        el.appendChild(tabs);
    }
    el.appendChild(body);
    el.appendChild(resizeHandle);
    return el;
}
/**
 * Desktop Window class.
 *
 * Manages a single window: its DOM element, iframe, drag/resize behavior, and state.
 */
class Window {
    constructor(config) {
        this.state = 'normal';
        this.isDragging = false;
        this.isResizing = false;
        this.isDestroyed = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        this.resizeStartX = 0;
        this.resizeStartY = 0;
        this.resizeStartW = 0;
        this.resizeStartH = 0;
        /** Stored geometry before maximize/snap, for restore. */
        this.savedGeometry = null;
        /**
         * Snapshot taken before entering fullscreen so we can restore
         * the caller's previous state (normal or maximized) on exit.
         */
        this.savedFullscreenState = null;
        /** Callbacks for external events. */
        this.onFocusRequest = null;
        this.onClose = null;
        this.onMinimize = null;
        this.id = config.id;
        this.config = config;
        this.element = createWindowElement(config);
        this.iframe = this.element.querySelector('.wp-desktop-window__iframe');
        this.titleBar = this.element.querySelector('.wp-desktop-window__titlebar');
        this.titleEl = this.element.querySelector('.wp-desktop-window__title');
        this.boundOnMessage = this.onMessage.bind(this);
        this.bindEvents();
        // Play the opening animation, then remove the class.
        this.element.classList.add('wp-desktop-window--opening');
        this.element.addEventListener('animationend', () => {
            this.element.classList.remove('wp-desktop-window--opening');
        }, { once: true });
    }
    /**
     * Bind all DOM event handlers.
     */
    bindEvents() {
        // Focus on click anywhere in the window.
        this.element.addEventListener('pointerdown', () => {
            this.onFocusRequest?.(this);
        });
        // Title bar drag.
        this.titleBar.addEventListener('pointerdown', this.onDragStart.bind(this));
        // Resize handle.
        const resizeHandle = this.element.querySelector('.wp-desktop-window__resize-handle');
        resizeHandle.addEventListener('pointerdown', this.onResizeStart.bind(this));
        // Window control buttons.
        const btnMin = this.element.querySelector('.wp-desktop-window__btn--minimize');
        const btnMax = this.element.querySelector('.wp-desktop-window__btn--maximize');
        const btnFocus = this.element.querySelector('.wp-desktop-window__btn--focus');
        const btnClose = this.element.querySelector('.wp-desktop-window__btn--close');
        btnMin.addEventListener('click', (e) => {
            e.stopPropagation();
            this.minimize();
        });
        btnMax.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMaximize();
        });
        btnFocus.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleFullscreen();
        });
        btnClose.addEventListener('click', (e) => {
            e.stopPropagation();
            this.close();
        });
        // Double-click title bar to toggle maximize.
        this.titleBar.addEventListener('dblclick', () => {
            this.toggleMaximize();
        });
        // Tab strip — clicks navigate the iframe in place.
        const tabs = this.element.querySelector('.wp-desktop-window__tabs');
        if (tabs) {
            tabs.addEventListener('click', (e) => {
                const target = e.target.closest('.wp-desktop-window__tab');
                if (!target || !target.dataset.url) {
                    return;
                }
                e.stopPropagation();
                const next = withChromelessParam(target.dataset.url);
                if (next) {
                    this.iframe.src = next;
                }
            });
        }
        // Sync the active tab whenever the iframe finishes a navigation.
        // Reading iframe.contentWindow.location is safe because we only
        // allow same-origin URLs; cross-origin would have thrown earlier.
        this.iframe.addEventListener('load', () => {
            try {
                const href = this.iframe.contentWindow?.location.href;
                if (href) {
                    this.syncActiveTab(href);
                }
            }
            catch {
                /* Cross-origin or detached frame — ignore. */
            }
        });
        // Listen for postMessage from iframe.
        window.addEventListener('message', this.boundOnMessage);
    }
    /**
     * Update the active tab to whichever submenu URL matches the iframe's
     * current location. Called after every iframe navigation.
     */
    syncActiveTab(currentUrl) {
        const tabs = this.element.querySelectorAll('.wp-desktop-window__tab');
        if (!tabs.length) {
            return;
        }
        const activeKey = urlMatchKey(currentUrl);
        for (const tab of tabs) {
            const tabUrl = tab.dataset.url;
            const isActive = !!tabUrl && urlMatchKey(tabUrl) === activeKey;
            tab.classList.toggle('wp-desktop-window__tab--active', isActive);
            tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        }
    }
    /**
     * Handle postMessage events from the iframe.
     */
    onMessage(event) {
        // Only accept same-origin messages from our own iframe.
        if (event.origin !== window.location.origin) {
            return;
        }
        if (event.source !== this.iframe.contentWindow) {
            return;
        }
        const data = event.data;
        if (!data || typeof data.type !== 'string') {
            return;
        }
        if (data.type === 'wp-desktop-title-change' && typeof data.title === 'string') {
            this.setTitle(data.title);
        }
        if (data.type === 'wp-desktop-screen-meta' && Array.isArray(data.panels)) {
            this.addScreenMetaButtons(data.panels);
        }
        if (data.type === 'wp-desktop-screen-meta-state') {
            this.setActiveScreenMetaPanel(typeof data.open === 'string' ? data.open : null);
        }
    }
    /**
     * Add Screen Options / Help buttons to the title bar.
     *
     * Called when the iframe reports which screen-meta panels are available.
     * Repopulates on every call — the iframe re-announces on each navigation,
     * and different pages expose different panels.
     */
    addScreenMetaButtons(panels) {
        const container = this.element.querySelector('.wp-desktop-window__screen-meta');
        if (!container) {
            return;
        }
        container.innerHTML = '';
        const panelConfig = {
            'screen-options': { icon: 'dashicons-admin-generic', label: 'Screen Options' },
            'help': { icon: 'dashicons-editor-help', label: 'Help' },
        };
        for (const panel of panels) {
            const cfg = panelConfig[panel];
            if (!cfg) {
                continue;
            }
            const btn = document.createElement('button');
            btn.className = 'wp-desktop-window__meta-btn';
            btn.setAttribute('type', 'button');
            btn.setAttribute('aria-label', cfg.label);
            btn.setAttribute('aria-pressed', 'false');
            btn.dataset.panel = panel;
            btn.innerHTML = `<span class="dashicons ${cfg.icon}" aria-hidden="true"></span>`;
            // The iframe owns panel state. We request a toggle and wait
            // for the authoritative state message back before updating
            // the button's --active class.
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.iframe.contentWindow?.postMessage({ type: 'wp-desktop-toggle-panel', panel }, window.location.origin);
            });
            container.appendChild(btn);
        }
    }
    /**
     * Reflect the iframe's authoritative screen-meta state on the
     * title-bar buttons. At most one button is active at a time.
     */
    setActiveScreenMetaPanel(panel) {
        const container = this.element.querySelector('.wp-desktop-window__screen-meta');
        if (!container) {
            return;
        }
        container.querySelectorAll('.wp-desktop-window__meta-btn').forEach((btn) => {
            const isActive = btn.dataset.panel === panel;
            btn.classList.toggle('wp-desktop-window__meta-btn--active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }
    /**
     * Start dragging the window.
     */
    onDragStart(e) {
        // Only drag from the title bar background, not from any buttons.
        const target = e.target;
        if (target.closest('.wp-desktop-window__controls') || target.closest('.wp-desktop-window__screen-meta')) {
            return;
        }
        if (this.state === 'maximized') {
            return;
        }
        this.isDragging = true;
        this.dragOffsetX = e.clientX - this.element.offsetLeft;
        this.dragOffsetY = e.clientY - this.element.offsetTop;
        this.titleBar.setPointerCapture(e.pointerId);
        // Add an overlay to prevent iframe from eating pointer events during drag.
        this.element.classList.add('wp-desktop-window--dragging');
        const onDragMove = (ev) => {
            if (!this.isDragging) {
                return;
            }
            let x = ev.clientX - this.dragOffsetX;
            let y = ev.clientY - this.dragOffsetY;
            // Constrain to desktop bounds.
            const desktop = this.element.parentElement;
            if (desktop) {
                x = Math.max(EDGE_MARGIN, Math.min(x, desktop.clientWidth - EDGE_MARGIN));
                y = Math.max(EDGE_MARGIN, Math.min(y, desktop.clientHeight - EDGE_MARGIN));
            }
            this.element.style.left = `${x}px`;
            this.element.style.top = `${y}px`;
        };
        const onDragEnd = () => {
            if (!this.isDragging) {
                return;
            }
            this.isDragging = false;
            this.element.classList.remove('wp-desktop-window--dragging');
            this.titleBar.removeEventListener('pointermove', onDragMove);
            this.titleBar.removeEventListener('pointerup', onDragEnd);
            this.titleBar.removeEventListener('pointercancel', onDragEnd);
            this.titleBar.removeEventListener('lostpointercapture', onDragEnd);
        };
        this.titleBar.addEventListener('pointermove', onDragMove);
        this.titleBar.addEventListener('pointerup', onDragEnd);
        this.titleBar.addEventListener('pointercancel', onDragEnd);
        this.titleBar.addEventListener('lostpointercapture', onDragEnd);
    }
    /**
     * Start resizing the window.
     */
    onResizeStart(e) {
        if (this.state === 'maximized') {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        this.isResizing = true;
        this.resizeStartX = e.clientX;
        this.resizeStartY = e.clientY;
        this.resizeStartW = this.element.offsetWidth;
        this.resizeStartH = this.element.offsetHeight;
        e.target.setPointerCapture(e.pointerId);
        this.element.classList.add('wp-desktop-window--resizing');
        const onResizeMove = (ev) => {
            if (!this.isResizing) {
                return;
            }
            const newW = Math.max(this.config.minWidth, this.resizeStartW + (ev.clientX - this.resizeStartX));
            const newH = Math.max(this.config.minHeight, this.resizeStartH + (ev.clientY - this.resizeStartY));
            this.element.style.width = `${newW}px`;
            this.element.style.height = `${newH}px`;
        };
        const onResizeEnd = () => {
            if (!this.isResizing) {
                return;
            }
            this.isResizing = false;
            this.element.classList.remove('wp-desktop-window--resizing');
            const handle = this.element.querySelector('.wp-desktop-window__resize-handle');
            handle.removeEventListener('pointermove', onResizeMove);
            handle.removeEventListener('pointerup', onResizeEnd);
            handle.removeEventListener('pointercancel', onResizeEnd);
            handle.removeEventListener('lostpointercapture', onResizeEnd);
        };
        const handle = e.target;
        handle.addEventListener('pointermove', onResizeMove);
        handle.addEventListener('pointerup', onResizeEnd);
        handle.addEventListener('pointercancel', onResizeEnd);
        handle.addEventListener('lostpointercapture', onResizeEnd);
    }
    /**
     * Set the z-index of this window.
     */
    setZIndex(z) {
        this.element.style.zIndex = String(z);
    }
    /**
     * Mark this window as focused or unfocused.
     */
    setFocused(focused) {
        this.element.classList.toggle('wp-desktop-window--focused', focused);
    }
    /**
     * Update the window title.
     */
    setTitle(title) {
        this.titleEl.textContent = title;
    }
    /**
     * Minimize the window.
     */
    minimize() {
        this.state = 'minimized';
        this.element.classList.add('wp-desktop-window--minimized');
        // After the transition completes, hide the iframe to save resources.
        this.element.addEventListener('transitionend', (e) => {
            if (e.propertyName === 'opacity' && this.state === 'minimized') {
                this.iframe.style.visibility = 'hidden';
            }
        }, { once: true });
        this.onMinimize?.(this);
    }
    /**
     * Restore the window from minimized state.
     */
    restore() {
        // Restore iframe visibility before the animation starts.
        this.iframe.style.visibility = '';
        this.element.classList.remove('wp-desktop-window--minimized');
        if (this.state === 'minimized') {
            this.state = 'normal';
        }
        this.onFocusRequest?.(this);
    }
    /**
     * Toggle between maximized and normal states.
     */
    toggleMaximize() {
        const parent = this.element.parentElement;
        if (!parent) {
            return;
        }
        if (this.state === 'maximized') {
            // Restore to saved geometry. The maximized class is removed *after*
            // the next frame so the class-driven border-radius animates in sync.
            this.element.classList.remove('wp-desktop-window--maximized');
            if (this.savedGeometry) {
                this.element.style.left = `${this.savedGeometry.x}px`;
                this.element.style.top = `${this.savedGeometry.y}px`;
                this.element.style.width = `${this.savedGeometry.width}px`;
                this.element.style.height = `${this.savedGeometry.height}px`;
            }
            this.state = 'normal';
        }
        else {
            // Save current geometry, then animate to the desktop area's bounds.
            this.savedGeometry = {
                x: this.element.offsetLeft,
                y: this.element.offsetTop,
                width: this.element.offsetWidth,
                height: this.element.offsetHeight,
            };
            this.element.classList.add('wp-desktop-window--maximized');
            this.element.style.left = '0px';
            this.element.style.top = '0px';
            this.element.style.width = `${parent.clientWidth}px`;
            this.element.style.height = `${parent.clientHeight}px`;
            this.state = 'maximized';
        }
    }
    /**
     * Toggle fullscreen ("focus") mode — the window covers the entire
     * viewport, hiding the admin bar, dock, and taskbar behind it.
     *
     * This is the equivalent of macOS's green zoom-to-fullscreen: an
     * immersive mode distinct from maximize (which only fills the
     * desktop area between dock and taskbar).
     */
    toggleFullscreen() {
        if (this.state === 'fullscreen') {
            // Restore whichever state the window was in before fullscreen.
            this.element.classList.remove('wp-desktop-window--fullscreen');
            if (this.savedFullscreenState) {
                const s = this.savedFullscreenState;
                this.element.style.left = `${s.x}px`;
                this.element.style.top = `${s.y}px`;
                this.element.style.width = `${s.width}px`;
                this.element.style.height = `${s.height}px`;
                this.element.classList.toggle('wp-desktop-window--maximized', s.state === 'maximized');
                this.state = s.state;
                this.savedFullscreenState = null;
            }
            else {
                this.state = 'normal';
            }
        }
        else {
            this.savedFullscreenState = {
                state: this.state,
                x: this.element.offsetLeft,
                y: this.element.offsetTop,
                width: this.element.offsetWidth,
                height: this.element.offsetHeight,
            };
            this.element.classList.add('wp-desktop-window--fullscreen');
            this.state = 'fullscreen';
        }
        this.updateFocusButtonState();
    }
    /**
     * Reflect fullscreen state on the focus-mode button (active class,
     * aria-pressed, and label).
     */
    updateFocusButtonState() {
        const btn = this.element.querySelector('.wp-desktop-window__btn--focus');
        if (!btn) {
            return;
        }
        const isFullscreen = this.state === 'fullscreen';
        btn.classList.toggle('wp-desktop-window__btn--active', isFullscreen);
        btn.setAttribute('aria-pressed', isFullscreen ? 'true' : 'false');
        btn.setAttribute('aria-label', isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen');
    }
    /**
     * Close and destroy the window.
     *
     * Plays a subtle closing animation before removing the element.
     */
    close() {
        if (this.isDestroyed) {
            return;
        }
        this.isDestroyed = true;
        // Fire the callback immediately so the window manager updates its stack.
        this.onClose?.(this);
        this.element.classList.add('wp-desktop-window--closing');
        let removed = false;
        const onDone = () => {
            if (removed) {
                return;
            }
            removed = true;
            window.removeEventListener('message', this.boundOnMessage);
            this.element.remove();
        };
        const onTransitionEnd = (e) => {
            if (e.propertyName === 'opacity') {
                this.element.removeEventListener('transitionend', onTransitionEnd);
                onDone();
            }
        };
        this.element.addEventListener('transitionend', onTransitionEnd);
        // Safety net: if transitionend never fires (e.g. reduced-motion or no transition),
        // remove after a generous timeout so the element doesn't linger.
        setTimeout(onDone, 300);
    }
    /**
     * Get a snapshot of the window state for persistence.
     */
    getSnapshot() {
        return {
            id: this.id,
            x: this.element.offsetLeft,
            y: this.element.offsetTop,
            width: this.element.offsetWidth,
            height: this.element.offsetHeight,
            state: this.state,
        };
    }
}

;// ./src/window-manager.ts
/**
 * Desktop Mode — Window Manager.
 *
 * Manages the lifecycle, z-order, and focus of all desktop windows.
 *
 * @since 6.9.0
 */

/** Base z-index for desktop windows. */
const BASE_Z_INDEX = 100;
/** Cascade offset for new windows (pixels). */
const CASCADE_OFFSET = 30;
/**
 * Window Manager class.
 *
 * Controls the window stack: opening, closing, focusing, z-ordering.
 */
class WindowManager {
    constructor(desktop) {
        /** All open windows, in z-order (last = topmost). */
        this.stack = [];
        /** Counter for cascade positioning. */
        this.cascadeIndex = 0;
        this.desktop = desktop;
    }
    /**
     * Open a new window or focus an existing one for the given page.
     */
    open(config) {
        // If a window for this page already exists, focus it.
        const existing = this.getById(config.id);
        if (existing) {
            this.focus(existing);
            if (existing.state === 'minimized') {
                existing.restore();
            }
            return existing;
        }
        // Calculate default position and size.
        const desktopRect = this.desktop.getBoundingClientRect();
        const defaultWidth = Math.min(Math.round(desktopRect.width * 0.8), 1200);
        const defaultHeight = Math.min(Math.round(desktopRect.height * 0.8), 800);
        const cascadeX = 40 + (this.cascadeIndex % 8) * CASCADE_OFFSET;
        const cascadeY = 40 + (this.cascadeIndex % 8) * CASCADE_OFFSET;
        const fullConfig = {
            icon: config.icon || 'dashicons-admin-generic',
            x: config.x ?? cascadeX,
            y: config.y ?? cascadeY,
            width: config.width ?? defaultWidth,
            height: config.height ?? defaultHeight,
            minWidth: config.minWidth ?? 320,
            minHeight: config.minHeight ?? 200,
            ...config,
        };
        this.cascadeIndex++;
        const win = new Window(fullConfig);
        // Wire up callbacks.
        win.onFocusRequest = (w) => this.focus(w);
        win.onClose = (w) => this.remove(w);
        win.onMinimize = () => {
            // Focus the next window in the stack.
            const visible = this.stack.filter((w) => w.state !== 'minimized');
            if (visible.length > 0) {
                this.focus(visible[visible.length - 1]);
            }
        };
        // Add to stack and DOM.
        this.stack.push(win);
        this.desktop.appendChild(win.element);
        this.focus(win);
        // Dispatch custom event.
        document.dispatchEvent(new CustomEvent('wp-desktop-window-opened', {
            detail: { windowId: win.id, page: config.url, title: config.title },
        }));
        return win;
    }
    /**
     * Focus a window: bring it to top of z-stack.
     */
    focus(win) {
        // Remove from current position and push to top.
        const idx = this.stack.indexOf(win);
        if (idx > -1) {
            this.stack.splice(idx, 1);
        }
        this.stack.push(win);
        // Update z-indices and focused state.
        this.stack.forEach((w, i) => {
            w.setZIndex(BASE_Z_INDEX + i);
            w.setFocused(i === this.stack.length - 1);
        });
        // Dispatch custom event.
        document.dispatchEvent(new CustomEvent('wp-desktop-window-focused', {
            detail: { windowId: win.id },
        }));
    }
    /**
     * Remove a window from the stack and DOM.
     */
    remove(win) {
        const idx = this.stack.indexOf(win);
        if (idx > -1) {
            this.stack.splice(idx, 1);
        }
        // Focus the next topmost window.
        if (this.stack.length > 0) {
            this.focus(this.stack[this.stack.length - 1]);
        }
        // Dispatch custom event.
        document.dispatchEvent(new CustomEvent('wp-desktop-window-closed', {
            detail: { windowId: win.id },
        }));
    }
    /**
     * Get a window by its ID.
     */
    getById(id) {
        return this.stack.find((w) => w.id === id);
    }
    /**
     * Get all open windows.
     */
    getAll() {
        return [...this.stack];
    }
    /**
     * Get the currently focused (topmost) window.
     */
    getFocused() {
        return this.stack.length > 0 ? this.stack[this.stack.length - 1] : undefined;
    }
}

;// ./src/dock.ts
/**
 * Desktop Mode — Dock.
 *
 * Renders the icon-only dock on the left edge of the desktop.
 * Icons come from the admin menu data passed via wpDesktopConfig.dockItems.
 * The dock always starts with a WordPress logo "Show Desktop" button
 * that minimizes all open windows.
 *
 * @since 6.9.0
 */

/**
 * Dock class.
 *
 * Manages the dock element, its icons, tooltips, and interaction with the window manager.
 */
class Dock {
    constructor(container, windowManager, items, adminUrl) {
        this.itemElements = new Map();
        this.container = container;
        this.windowManager = windowManager;
        this.items = items;
        this.adminUrl = adminUrl;
        // Create tooltip element (shared across all items).
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'wp-desktop-dock__tooltip';
        this.tooltip.setAttribute('role', 'tooltip');
        document.body.appendChild(this.tooltip);
        this.render();
        this.bindWindowEvents();
    }
    /**
     * Render the dock contents.
     */
    render() {
        this.container.innerHTML = '';
        // Dock items from the admin menu.
        for (const item of this.items) {
            const btn = this.createItemButton(item);
            this.itemElements.set(item.id, btn);
            this.container.appendChild(btn);
        }
    }
    /**
     * Create a single dock icon button.
     */
    createItemButton(item) {
        const btn = document.createElement('button');
        btn.className = 'wp-desktop-dock__item';
        btn.setAttribute('type', 'button');
        btn.setAttribute('aria-label', item.title);
        btn.dataset.menuSlug = item.id;
        // Icon.
        const iconEl = this.createIcon(item.icon);
        btn.appendChild(iconEl);
        // Badge.
        if (item.badge > 0) {
            const badge = document.createElement('span');
            badge.className = 'wp-desktop-dock__badge';
            badge.textContent = String(item.badge);
            badge.setAttribute('aria-label', `${item.badge} updates`);
            btn.appendChild(badge);
        }
        // Click → open or focus window.
        btn.addEventListener('click', () => {
            this.openPage(item);
        });
        // Tooltip.
        this.bindTooltip(btn, item.title);
        return btn;
    }
    /**
     * Create the icon element based on the icon type.
     */
    createIcon(icon) {
        if (icon.startsWith('dashicons-')) {
            // Dashicon.
            const el = document.createElement('span');
            el.className = `dashicons ${icon}`;
            el.setAttribute('aria-hidden', 'true');
            return el;
        }
        if (icon.startsWith('data:image/svg+xml;base64,')) {
            // Inline SVG data URI — render as a CSS background.
            // Validate that the base64 payload contains only valid characters.
            const base64Part = icon.slice('data:image/svg+xml;base64,'.length);
            if (/^[A-Za-z0-9+/=]+$/.test(base64Part)) {
                const el = document.createElement('span');
                el.className = 'wp-desktop-dock__item-svg';
                el.style.backgroundImage = `url("${icon}")`;
                el.style.backgroundSize = 'contain';
                el.style.backgroundRepeat = 'no-repeat';
                el.style.backgroundPosition = 'center';
                el.setAttribute('aria-hidden', 'true');
                return el;
            }
            // Invalid base64 — fall through to generic icon.
        }
        if (icon && icon !== 'none' && icon !== 'div') {
            // URL to an image.
            const img = document.createElement('img');
            img.className = 'wp-desktop-dock__item-img';
            img.src = icon;
            img.alt = '';
            img.setAttribute('aria-hidden', 'true');
            return img;
        }
        // Fallback: generic admin icon.
        const el = document.createElement('span');
        el.className = 'dashicons dashicons-admin-generic';
        el.setAttribute('aria-hidden', 'true');
        return el;
    }
    /**
     * Bind tooltip show/hide on hover.
     */
    bindTooltip(el, text) {
        el.addEventListener('pointerenter', () => {
            const rect = el.getBoundingClientRect();
            this.tooltip.textContent = text;
            this.tooltip.style.top = `${rect.top + rect.height / 2 - 14}px`;
            this.tooltip.classList.add('wp-desktop-dock__tooltip--visible');
        });
        el.addEventListener('pointerleave', () => {
            this.tooltip.classList.remove('wp-desktop-dock__tooltip--visible');
        });
    }
    /**
     * Open an admin page in a window (or focus if already open).
     */
    openPage(item) {
        // Derive window ID from the menu slug.
        const windowId = this.deriveWindowId(item.url);
        this.windowManager.open({
            id: windowId,
            url: item.url,
            title: item.title,
            icon: item.icon.startsWith('dashicons-') ? item.icon : 'dashicons-admin-generic',
            submenu: item.submenu,
        });
    }
    /**
     * Derive a window ID from an admin page URL.
     */
    deriveWindowId(url) {
        return deriveWindowId(url, this.adminUrl);
    }
    /**
     * Listen to window events to update active/focused indicators on dock items.
     */
    bindWindowEvents() {
        document.addEventListener('wp-desktop-window-opened', ((e) => {
            this.updateActiveStates();
        }));
        document.addEventListener('wp-desktop-window-closed', ((e) => {
            this.updateActiveStates();
        }));
        document.addEventListener('wp-desktop-window-focused', ((e) => {
            this.updateActiveStates();
        }));
    }
    /**
     * Update the active/focused CSS classes on dock items based on open windows.
     */
    updateActiveStates() {
        const openWindows = this.windowManager.getAll();
        const focused = this.windowManager.getFocused();
        // Build a set of open window IDs.
        const openIds = new Set(openWindows.map((w) => w.id));
        for (const item of this.items) {
            const btn = this.itemElements.get(item.id);
            if (!btn) {
                continue;
            }
            const windowId = this.deriveWindowId(item.url);
            const isOpen = openIds.has(windowId);
            const isFocused = focused && focused.id === windowId;
            btn.classList.toggle('wp-desktop-dock__item--active', isOpen);
            btn.classList.toggle('wp-desktop-dock__item--focused', !!isFocused);
        }
    }
}

;// ./src/desktop.ts
/**
 * Desktop Mode — Entry Point.
 *
 * Initializes the desktop shell and opens the current admin page in a window.
 *
 * @since 6.9.0
 */



/**
 * Initialize Desktop Mode.
 */
function init() {
    const config = window.wpDesktopConfig;
    if (!config) {
        return;
    }
    const desktopArea = document.getElementById('wp-desktop-area');
    if (!desktopArea) {
        return;
    }
    const manager = new WindowManager(desktopArea);
    // Initialize the dock.
    const dockEl = document.getElementById('wp-desktop-dock');
    let dock = null;
    if (dockEl && config.dockItems) {
        dock = new Dock(dockEl, manager, config.dockItems, config.adminUrl);
        desktopArea.classList.add('wp-desktop-area--with-dock');
    }
    // Expose on wp.desktop global for plugins.
    window.wp = window.wp || {};
    window.wp.desktop = {
        windowManager: manager,
        dock: dock,
    };
    // Click on the desktop background to minimize all windows (like macOS "Show Desktop").
    desktopArea.addEventListener('click', (e) => {
        // Only trigger on direct clicks on the desktop area itself, not on windows.
        if (e.target === desktopArea) {
            const windows = manager.getAll();
            const allMinimized = windows.length > 0 && windows.every((w) => w.state === 'minimized');
            if (allMinimized) {
                for (const win of windows) {
                    win.restore();
                }
            }
            else {
                for (const win of windows) {
                    if (win.state !== 'minimized') {
                        win.minimize();
                    }
                }
            }
        }
    });
    // Open the current page in a window. Look up the matching dock entry by
    // derived window ID so the auto-opened window also gets its tab strip
    // when the user lands directly on a sub-page (e.g., Categories).
    const windowId = deriveWindowId(config.currentPage, config.adminUrl);
    const matchedDockItem = (config.dockItems || []).find((item) => deriveWindowId(item.url, config.adminUrl) === windowId
        || (item.submenu || []).some((sub) => deriveWindowId(sub.url, config.adminUrl) === windowId));
    manager.open({
        id: windowId,
        url: config.currentPage,
        title: config.currentTitle,
        icon: config.currentIcon,
        submenu: matchedDockItem?.submenu,
    });
    // Dispatch init event.
    document.dispatchEvent(new CustomEvent('wp-desktop-init', {
        detail: { config },
    }));
}
// Initialize when DOM is ready.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
}
else {
    init();
}

/******/ })()
;