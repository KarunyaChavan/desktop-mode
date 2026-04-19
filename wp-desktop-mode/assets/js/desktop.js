var wpDesktop = function(exports) {
  "use strict";
  const IDENTITY_PARAMS = ["post_type", "page", "taxonomy"];
  function slugify(path) {
    return path.replace(/\.php/g, "-php").replace(/[?&=]/g, "-").replace(/[^a-zA-Z0-9_-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "") || "index";
  }
  function deriveWindowId(url, adminUrl) {
    let parsed = null;
    try {
      parsed = new URL(url, adminUrl);
    } catch (err) {
      parsed = null;
    }
    if (parsed) {
      const basePath = new URL(adminUrl).pathname;
      const filename = parsed.pathname.replace(basePath, "").replace(/^\/+/, "");
      const significant = new URLSearchParams();
      for (const key of IDENTITY_PARAMS) {
        const value = parsed.searchParams.get(key);
        if (value) {
          significant.set(key, value);
        }
      }
      const query = significant.toString();
      return slugify(query ? `${filename}?${query}` : filename);
    }
    let path = url.replace(adminUrl, "");
    if (path.startsWith("/")) {
      path = path.substring(1);
    }
    return slugify(path);
  }
  function sanitizeClassName(value) {
    return value.replace(/[^a-zA-Z0-9_-]/g, "");
  }
  function urlMatchKey(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      parsed.searchParams.delete("wp_desktop");
      parsed.searchParams.delete("wp_desktop_portal");
      return parsed.pathname.replace(/\/+$/, "") + "?" + parsed.searchParams.toString();
    } catch {
      return url;
    }
  }
  function getWpHooks() {
    const hooks = window.wp?.hooks;
    if (!hooks) {
      throw new Error(
        "[wp-desktop-mode] `window.wp.hooks` is not available. The plugin declares `wp-hooks` as a script dependency; if you are seeing this error, verify the enqueue order."
      );
    }
    return hooks;
  }
  function addAction(hookName, namespace, callback, priority) {
    getWpHooks().addAction(
      hookName,
      namespace,
      callback,
      priority
    );
  }
  function applyFilters(hookName, value, ...args) {
    return getWpHooks().applyFilters(hookName, value, ...args);
  }
  function doAction(hookName, ...args) {
    getWpHooks().doAction(hookName, ...args);
  }
  function didAction(hookName) {
    return getWpHooks().didAction(hookName);
  }
  function rawHooks() {
    return getWpHooks();
  }
  const HOOKS = {
    /** Action, fires once after shell boot; plugins register here. */
    INIT: "wp-desktop.init",
    /** Filter, receives the wallpaper registry array. */
    WALLPAPERS: "wp-desktop.wallpapers",
    /** Action before a canvas wallpaper mounts. */
    WALLPAPER_MOUNTING: "wp-desktop.wallpaper.mounting",
    /** Action after a canvas wallpaper mounts successfully. */
    WALLPAPER_MOUNTED: "wp-desktop.wallpaper.mounted",
    /** Action before a canvas wallpaper tears down. */
    WALLPAPER_UNMOUNTING: "wp-desktop.wallpaper.unmounting",
    /** Action when a canvas wallpaper's mount throws / rejects. */
    WALLPAPER_MOUNT_FAILED: "wp-desktop.wallpaper.mount-failed",
    /** Action mirroring document.visibilitychange for active canvas wallpapers. */
    WALLPAPER_VISIBILITY: "wp-desktop.wallpaper.visibility",
    // ------------------------------------------------------------------
    // Window lifecycle actions. All payloads share a `windowId: string`
    // field; additional fields are documented per-hook in the JS
    // reference. These mirror the existing `wp-desktop-window-*`
    // CustomEvents but ship under the hook bus so plugins can use one
    // idiomatic API for everything the shell emits.
    // ------------------------------------------------------------------
    /** Action, fires when a window is added to the stack. */
    WINDOW_OPENED: "wp-desktop.window.opened",
    /** Action, fires when a window is removed from the stack. */
    WINDOW_CLOSED: "wp-desktop.window.closed",
    /** Action, fires when focus changes to a different window. */
    WINDOW_FOCUSED: "wp-desktop.window.focused",
    /** Action, fires when a window is minimized. */
    WINDOW_MINIMIZED: "wp-desktop.window.minimized",
    /** Action, fires when a window is restored from minimized. */
    WINDOW_RESTORED: "wp-desktop.window.restored",
    /** Action, fires when a window is maximized (fills desktop area). */
    WINDOW_MAXIMIZED: "wp-desktop.window.maximized",
    /** Action, fires when a window exits maximized state. */
    WINDOW_UNMAXIMIZED: "wp-desktop.window.unmaximized",
    /** Action, fires when a window enters fullscreen / focus mode. */
    WINDOW_FULLSCREEN_ENTERED: "wp-desktop.window.fullscreen-entered",
    /** Action, fires when a window exits fullscreen / focus mode. */
    WINDOW_FULLSCREEN_EXITED: "wp-desktop.window.fullscreen-exited",
    /** Action, fires at drag-end with the final `{ x, y }` position. */
    WINDOW_MOVED: "wp-desktop.window.moved",
    /** Action, fires at resize-end with the final `{ width, height }`. */
    WINDOW_RESIZED: "wp-desktop.window.resized",
    /** Action, fires when title-bar drag begins. */
    WINDOW_DRAG_START: "wp-desktop.window.drag-start",
    /** Action, fires when title-bar drag ends. Payload mirrors WINDOW_MOVED. */
    WINDOW_DRAG_END: "wp-desktop.window.drag-end",
    /** Action, fires when the resize handle is first pressed. */
    WINDOW_RESIZE_START: "wp-desktop.window.resize-start",
    /** Action, fires when resize completes. Payload mirrors WINDOW_RESIZED. */
    WINDOW_RESIZE_END: "wp-desktop.window.resize-end",
    /** Action, fires when the user "detaches" a window to a classic tab. */
    WINDOW_DETACHED: "wp-desktop.window.detached",
    /** Action, fires when iframe title updates change the window title. */
    WINDOW_TITLE_CHANGED: "wp-desktop.window.title-changed",
    // ------------------------------------------------------------------
    // Overview / Arrange lifecycle actions.
    //
    // The "Arrange" admin-bar menu drives two layout algorithms —
    // Cascade (instantly reposition every window in a staggered
    // stack) and Overview (zoom-out grid view with click-to-focus).
    // These hooks surface the state transitions so plugins can
    // instrument analytics, apply custom transitions, override
    // thumbnail decorations, etc. All actions; a filter for
    // mutating the overview layout may be added later if plugins
    // want to reorder or group thumbnails.
    // ------------------------------------------------------------------
    /** Action, fires before the overview enter animation starts. */
    OVERVIEW_ENTERING: "wp-desktop.overview.entering",
    /** Action, fires once the overview enter animation has completed. */
    OVERVIEW_ENTERED: "wp-desktop.overview.entered",
    /**
     * Action, fires at the start of the overview-exit animation.
     * Payload: `{ windowId?: string, reason: 'select' | 'cancel' }` —
     * `windowId` set when the user clicked a thumbnail (reason
     * 'select'); omitted when the user pressed Escape or clicked
     * the backdrop (reason 'cancel').
     */
    OVERVIEW_EXITING: "wp-desktop.overview.exiting",
    /** Action, fires once the overview-exit animation has settled. */
    OVERVIEW_EXITED: "wp-desktop.overview.exited",
    /** Action, fires when the cursor enters a thumbnail. Payload `{ windowId }`. */
    OVERVIEW_WINDOW_HOVER: "wp-desktop.overview.window-hover",
    /** Action, fires when the cursor leaves a thumbnail. Payload `{ windowId }`. */
    OVERVIEW_WINDOW_UNHOVER: "wp-desktop.overview.window-unhover",
    /** Action, fires the instant a thumbnail click is registered (before exit + maximize kick in). Payload `{ windowId }`. */
    OVERVIEW_WINDOW_CLICK: "wp-desktop.overview.window-click",
    /** Action, fires before cascade computes + applies new positions. Payload `{ windowCount }`. */
    ARRANGE_CASCADE_STARTING: "wp-desktop.arrange.cascade.starting",
    /** Action, fires after cascade has positioned every window. Payload `{ windowCount }`. */
    ARRANGE_CASCADE_APPLIED: "wp-desktop.arrange.cascade.applied",
    /** Action, fires before tile computes + applies new positions. Payload `{ windowCount, cols, rows }`. */
    ARRANGE_TILE_STARTING: "wp-desktop.arrange.tile.starting",
    /** Action, fires after tile has positioned every window. Payload `{ windowCount, cols, rows }`. */
    ARRANGE_TILE_APPLIED: "wp-desktop.arrange.tile.applied",
    /**
     * Filter on the tile-grid dimensions chosen by the built-in
     * algorithm. Receives `{ cols, rows }` plus a context arg
     * `{ windowCount, areaWidth, areaHeight }`. Plugins can return
     * a different `{ cols, rows }` to enforce a custom layout
     * (fixed-column newsroom, golden-ratio cells, etc.). Returned
     * values are validated — non-positive integers, or a product
     * smaller than `windowCount`, fall back to the original.
     */
    ARRANGE_TILE_DIMENSIONS: "wp-desktop.arrange.tile.dimensions",
    /** Action, fires when snap-to-grid is toggled. Payload `{ enabled }`. */
    ARRANGE_SNAP_CHANGED: "wp-desktop.arrange.snap.changed",
    /**
     * Filter on the snap-grid cell size. Receives
     * `{ cellWidth, cellHeight }` plus a context arg
     * `{ areaWidth, areaHeight }`. Plugins can return different
     * dimensions to enforce a Tetris-style fixed grid, a musical
     * staff aspect, etc. Non-positive returns fall back to the
     * original.
     */
    ARRANGE_SNAP_CELL_SIZE: "wp-desktop.arrange.snap.cell-size",
    // ------------------------------------------------------------------
    // Widgets — the right-side column. Widgets paint above the
    // wallpaper but beneath windows. Lifecycle mirrors canvas
    // wallpapers: register via filter, mount/unmount actions bracket
    // each paint, mount-failed fires on sync throws / async rejects.
    // ------------------------------------------------------------------
    /** Filter, receives the widget registry array. */
    WIDGETS: "wp-desktop.widgets",
    /** Action before a widget mounts. Payload `{ id, container, ctx }`. */
    WIDGET_MOUNTING: "wp-desktop.widget.mounting",
    /** Action after a widget mounts successfully. Payload `{ id, container, ctx }`. */
    WIDGET_MOUNTED: "wp-desktop.widget.mounted",
    /** Action before a widget tears down. Payload `{ id }`. */
    WIDGET_UNMOUNTING: "wp-desktop.widget.unmounting",
    /** Action when a widget's mount throws / rejects. Payload `{ id, error }`. */
    WIDGET_MOUNT_FAILED: "wp-desktop.widget.mount-failed",
    /** Action when the user adds a widget via the picker. Payload `{ id }`. */
    WIDGET_ADDED: "wp-desktop.widget.added",
    /** Action when the user removes a widget via the card's × button. Payload `{ id }`. */
    WIDGET_REMOVED: "wp-desktop.widget.removed",
    // ------------------------------------------------------------------
    // Virtual-desktop ("Spaces") lifecycle actions.
    //
    // Spaces let users group windows into separate workspaces and flip
    // between them from the overview top bar. These hooks expose every
    // state change so plugins can persist per-space state, sync custom
    // indicators, or react to the user's workspace context.
    // ------------------------------------------------------------------
    /** Action, fires when a new desktop is created. Payload `{ desktopId }`. */
    DESKTOP_CREATED: "wp-desktop.desktop.created",
    /** Action, fires when a desktop is closed. Payload `{ desktopId, migratedTo }`. */
    DESKTOP_CLOSED: "wp-desktop.desktop.closed",
    /** Action, fires when the active desktop changes. Payload `{ from, to }`. */
    DESKTOP_SWITCHED: "wp-desktop.desktop.switched",
    // ------------------------------------------------------------------
    // Shell-level lifecycle actions.
    // ------------------------------------------------------------------
    /**
     * Action, fires (debounced) after the browser viewport stops
     * resizing. Payload `{ width, height }` describes the shell's
     * bounding rect — plugins that render canvas-driven UIs hook here
     * to adjust their render surface.
     */
    SHELL_RESIZED: "wp-desktop.shell.resized",
    /**
     * Action mirroring `document.visibilitychange` for the shell as a
     * whole. Payload `{ state: 'visible' | 'hidden' }`. Different from
     * the wallpaper-specific visibility action in that it fires
     * regardless of which wallpaper (if any) is active.
     */
    SHELL_VISIBILITY: "wp-desktop.shell.visibility"
  };
  function whenReady(cb) {
    if (didAction(HOOKS.INIT) > 0) {
      Promise.resolve().then(cb);
      return;
    }
    addAction(HOOKS.INIT, "wp-desktop-mode/when-ready", cb);
  }
  const TEXT_DOMAIN = "wp-desktop-mode";
  function i18n() {
    return window.wp?.i18n;
  }
  function __(text, domain = TEXT_DOMAIN) {
    return i18n()?.__(text, domain) ?? text;
  }
  function _n(single, plural, number, domain = TEXT_DOMAIN) {
    return i18n()?._n(single, plural, number, domain) ?? (number === 1 ? single : plural);
  }
  function sprintf(format, ...args) {
    const impl = i18n()?.sprintf;
    if (impl) {
      return impl(format, ...args);
    }
    let i = 0;
    return format.replace(/%[sd]/g, () => String(args[i++] ?? ""));
  }
  const CONTAINER_CLASS = "wp-desktop-toast-container";
  const DEFAULT_DURATION_MS = 4e3;
  const FADE_OUT_MS = 200;
  function showToast(options) {
    const container = ensureContainer();
    const toast = document.createElement("div");
    toast.className = "wp-desktop-toast";
    toast.setAttribute("role", "status");
    const label = document.createElement("span");
    label.className = "wp-desktop-toast__label";
    label.textContent = options.message;
    toast.appendChild(label);
    if (options.action) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wp-desktop-toast__action";
      btn.textContent = options.action.label;
      btn.addEventListener("click", () => {
        options.action?.onClick();
        dismiss();
      });
      toast.appendChild(btn);
    }
    container.appendChild(toast);
    let dismissed = false;
    let dismissTimer = null;
    const dismiss = () => {
      if (dismissed) {
        return;
      }
      dismissed = true;
      if (dismissTimer !== null) {
        window.clearTimeout(dismissTimer);
        dismissTimer = null;
      }
      toast.classList.add("wp-desktop-toast--out");
      window.setTimeout(() => {
        toast.remove();
      }, FADE_OUT_MS);
    };
    requestAnimationFrame(() => {
      toast.classList.add("wp-desktop-toast--in");
    });
    dismissTimer = window.setTimeout(
      dismiss,
      options.duration ?? DEFAULT_DURATION_MS
    );
    return dismiss;
  }
  function ensureContainer() {
    const existing = document.querySelector(
      `.${CONTAINER_CLASS}`
    );
    if (existing) {
      return existing;
    }
    const el = document.createElement("div");
    el.className = CONTAINER_CLASS;
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
    return el;
  }
  const EDGE_MARGIN = 8;
  const EXTERNAL_IFRAME_READY_TIMEOUT_MS = 3e3;
  function withChromelessParam(url) {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin !== window.location.origin) {
      return null;
    }
    parsed.searchParams.set("wp_desktop", "1");
    return parsed.toString();
  }
  function updateFullscreenBodyClass() {
    const hasFullscreen = document.querySelectorAll(".wp-desktop-window--fullscreen").length > 0;
    document.body.classList.toggle("wp-desktop-has-fullscreen-window", hasFullscreen);
  }
  function createControlButton(variant, label, svgInner) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `wp-desktop-window__btn wp-desktop-window__btn--${variant}`;
    btn.setAttribute("aria-label", label);
    btn.innerHTML = `<svg class="wp-desktop-window__btn-icon" width="14" height="14" viewBox="0 0 12 12" aria-hidden="true" focusable="false">${svgInner}</svg>`;
    return btn;
  }
  function createWindowElement(config) {
    const el = document.createElement("div");
    el.className = "wp-desktop-window";
    if (config.native) {
      el.classList.add("wp-desktop-window--native");
    }
    el.id = `wp-window-${config.id}`;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-labelledby", `wp-window-title-${config.id}`);
    el.style.left = `${config.x}px`;
    el.style.top = `${config.y}px`;
    el.style.width = `${config.width}px`;
    el.style.height = `${config.height}px`;
    const titleBar = document.createElement("div");
    titleBar.className = "wp-desktop-window__titlebar";
    let menuBtn = null;
    let menuPanel = null;
    if (!config.native) {
      menuBtn = document.createElement("button");
      menuBtn.type = "button";
      menuBtn.className = "wp-desktop-window__btn wp-desktop-window__menu-btn";
      menuBtn.setAttribute("aria-label", __("Window actions"));
      menuBtn.setAttribute("aria-haspopup", "menu");
      menuBtn.setAttribute("aria-expanded", "false");
      menuBtn.innerHTML = '<svg class="wp-desktop-window__btn-icon" width="14" height="14" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><circle cx="3" cy="6" r="1.2" fill="currentColor"/><circle cx="6" cy="6" r="1.2" fill="currentColor"/><circle cx="9" cy="6" r="1.2" fill="currentColor"/></svg>';
      menuPanel = document.createElement("div");
      menuPanel.className = "wp-desktop-window__menu-panel";
      menuPanel.setAttribute("role", "menu");
      menuPanel.hidden = true;
      const startup = document.createElement("button");
      startup.type = "button";
      startup.className = "wp-desktop-window__menu-item wp-desktop-window__menu-item--startup";
      startup.setAttribute("role", "menuitemcheckbox");
      startup.setAttribute("aria-checked", "false");
      const startupCheck = document.createElement("span");
      startupCheck.className = "wp-desktop-window__menu-check";
      startupCheck.setAttribute("aria-hidden", "true");
      const startupLabel = document.createElement("span");
      startupLabel.className = "wp-desktop-window__menu-label";
      startupLabel.textContent = __("Open on startup");
      startup.appendChild(startupCheck);
      startup.appendChild(startupLabel);
      menuPanel.appendChild(startup);
      if (config.multi) {
        const openAnother = document.createElement("button");
        openAnother.type = "button";
        openAnother.className = "wp-desktop-window__menu-item wp-desktop-window__menu-item--open-another";
        openAnother.setAttribute("role", "menuitem");
        const oaIcon = document.createElement("span");
        oaIcon.className = "wp-desktop-window__menu-icon dashicons dashicons-plus-alt2";
        oaIcon.setAttribute("aria-hidden", "true");
        const oaLabel = document.createElement("span");
        oaLabel.className = "wp-desktop-window__menu-label";
        oaLabel.textContent = sprintf(
          // translators: %s is the window's admin-page name (e.g., "Posts")
          __("Open another %s"),
          config.title
        );
        openAnother.appendChild(oaIcon);
        openAnother.appendChild(oaLabel);
        menuPanel.appendChild(openAnother);
      }
    }
    const iconEl = document.createElement("span");
    iconEl.className = `wp-desktop-window__icon dashicons ${sanitizeClassName(config.icon)}`;
    iconEl.setAttribute("aria-hidden", "true");
    const titleEl = document.createElement("span");
    titleEl.className = "wp-desktop-window__title";
    titleEl.id = `wp-window-title-${config.id}`;
    titleEl.textContent = config.title;
    const controls = document.createElement("div");
    controls.className = "wp-desktop-window__controls";
    const btnMin = createControlButton(
      "minimize",
      __("Minimize"),
      '<path d="M3 6h6" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>'
    );
    const btnMax = createControlButton(
      "maximize",
      __("Maximize"),
      '<rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.25" fill="none"/>'
    );
    const btnFocus = createControlButton(
      "focus",
      __("Enter fullscreen"),
      '<path d="M4.5 2H2v2.5M10 4.5V2H7.5M4.5 10H2V7.5M10 7.5V10H7.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
    );
    const btnDetach = createControlButton(
      "detach",
      __("Detach to new tab"),
      '<path d="M5 2H2.5v7.5H10V7M6.5 2H10v3.5M10 2L5.5 6.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
    );
    const btnClose = createControlButton(
      "close",
      __("Close"),
      '<path d="M3.25 3.25l5.5 5.5M3.25 8.75l5.5-5.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>'
    );
    controls.appendChild(btnMin);
    controls.appendChild(btnMax);
    controls.appendChild(btnFocus);
    if (!config.native) {
      controls.appendChild(btnDetach);
    }
    controls.appendChild(btnClose);
    const screenMeta = document.createElement("div");
    screenMeta.className = "wp-desktop-window__screen-meta";
    titleBar.appendChild(iconEl);
    titleBar.appendChild(titleEl);
    titleBar.appendChild(screenMeta);
    if (menuBtn && menuPanel && menuPanel.children.length > 0) {
      titleBar.appendChild(menuBtn);
      titleBar.appendChild(menuPanel);
    }
    titleBar.appendChild(controls);
    const body = document.createElement("div");
    body.className = "wp-desktop-window__body";
    if (!config.native) {
      const iframe = document.createElement("iframe");
      iframe.className = "wp-desktop-window__iframe";
      iframe.setAttribute("name", `wp-desktop-frame-${config.id}`);
      const chromelessSrc = withChromelessParam(config.url);
      iframe.src = chromelessSrc ?? "about:blank";
      body.appendChild(iframe);
    } else {
      body.classList.add("wp-desktop-window__body--native");
    }
    const resizeHandle = document.createElement("div");
    resizeHandle.className = "wp-desktop-window__resize-handle";
    el.appendChild(titleBar);
    if (!config.native) {
      const tabs = document.createElement("nav");
      tabs.className = "wp-desktop-window__tabs";
      tabs.setAttribute("role", "tablist");
      tabs.setAttribute("aria-label", sprintf(__("%s sub-pages"), config.title));
      if (config.submenu && config.submenu.length > 0) {
        const initialKey = urlMatchKey(config.url);
        for (const sub of config.submenu) {
          const tab = document.createElement("button");
          tab.className = "wp-desktop-window__tab";
          tab.dataset.kind = "submenu";
          tab.setAttribute("type", "button");
          tab.setAttribute("role", "tab");
          tab.dataset.url = sub.url;
          tab.textContent = sub.title;
          if (urlMatchKey(sub.url) === initialKey) {
            tab.classList.add("wp-desktop-window__tab--active");
            tab.setAttribute("aria-selected", "true");
          } else {
            tab.setAttribute("aria-selected", "false");
          }
          tabs.appendChild(tab);
        }
      }
      el.appendChild(tabs);
    }
    el.appendChild(body);
    el.appendChild(resizeHandle);
    return el;
  }
  class Window {
    constructor(config) {
      this.state = "normal";
      this.isDragging = false;
      this.isResizing = false;
      this.isDestroyed = false;
      this.dragOffsetX = 0;
      this.dragOffsetY = 0;
      this.resizeStartX = 0;
      this.resizeStartY = 0;
      this.resizeStartW = 0;
      this.resizeStartH = 0;
      this.savedGeometry = null;
      this.savedFullscreenState = null;
      this.externalTabs = /* @__PURE__ */ new Map();
      this.externalTabSeq = 0;
      this.activeTabId = "primary";
      this.onFocusRequest = null;
      this.onClose = null;
      this.onMinimize = null;
      this.onOpenAnother = null;
      this.onToggleStartup = null;
      this.snapConfigProvider = null;
      this.boundOnDocumentPointerDown = null;
      this.id = config.id;
      this.config = config;
      this.element = createWindowElement(config);
      this.iframe = config.native ? null : this.element.querySelector(".wp-desktop-window__iframe");
      this.titleBar = this.element.querySelector(".wp-desktop-window__titlebar");
      this.titleEl = this.element.querySelector(".wp-desktop-window__title");
      this.boundOnMessage = this.onMessage.bind(this);
      this.bindEvents();
      if (config.native && config.render) {
        const body = this.element.querySelector(
          ".wp-desktop-window__body"
        );
        if (body) {
          config.render(body);
        }
      }
      if (config.initialState === "minimized") {
        this.state = "minimized";
        this.element.classList.add("wp-desktop-window--minimized");
        if (this.iframe) {
          this.iframe.style.visibility = "hidden";
        }
        return;
      }
      this.element.classList.add("wp-desktop-window--opening");
      this.element.addEventListener("animationend", () => {
        this.element.classList.remove("wp-desktop-window--opening");
      }, { once: true });
      if (config.initialState && config.initialState !== "normal") {
        requestAnimationFrame(() => this.applyInitialState(config.initialState));
      }
    }
    /**
     * Apply a state restored from the session. Called once, after construction.
     */
    applyInitialState(state) {
      if (state === "minimized") {
        this.minimize();
      } else if (state === "maximized") {
        this.toggleMaximize();
      } else if (state === "fullscreen") {
        this.toggleFullscreen();
      }
    }
    /**
     * Dispatch a `wp-desktop-window-changed` event so the session-save
     * path can schedule a debounced write. Called after any state change
     * that should end up persisted: drag end, resize end, minimize,
     * restore, maximize toggle, fullscreen toggle.
     */
    emitChange(reason) {
      document.dispatchEvent(
        new CustomEvent("wp-desktop-window-changed", {
          detail: { windowId: this.id, reason, state: this.state }
        })
      );
    }
    /**
     * Round an `{ x, y, width, height }` rect onto the live snap grid
     * when snap-to-grid is enabled, otherwise return it unchanged.
     *
     * Used by both the un-maximize restore (so geometry saved while
     * snap was off doesn't leave the window off-grid when snap is on)
     * and any other code path that wants "the current geometry, but
     * grid-aligned." Width/height are floored to whole cells to avoid
     * crossing the EDGE_MARGIN constraint after rounding up.
     */
    snapGeometry(g) {
      const snap = this.snapConfigProvider?.();
      if (!snap || !snap.enabled) {
        return g;
      }
      const width = Math.max(
        this.config.minWidth,
        Math.round(g.width / snap.cellWidth) * snap.cellWidth
      );
      const height = Math.max(
        this.config.minHeight,
        Math.round(g.height / snap.cellHeight) * snap.cellHeight
      );
      return {
        x: Math.round(g.x / snap.cellWidth) * snap.cellWidth,
        y: Math.round(g.y / snap.cellHeight) * snap.cellHeight,
        width,
        height
      };
    }
    /**
     * Returns the current resolved URL of the iframe — preferring the
     * content window's location (reflects in-window navigation) and
     * falling back to the iframe's src attribute for cases where the
     * content document isn't yet reachable (cross-origin edge, early
     * load).
     */
    getCurrentUrl() {
      if (!this.iframe) {
        return this.config.url;
      }
      try {
        const href = this.iframe.contentWindow?.location.href;
        if (href && href !== "about:blank") {
          return href;
        }
      } catch {
      }
      return this.iframe.src;
    }
    /**
     * Bind all DOM event handlers.
     */
    bindEvents() {
      this.element.addEventListener("pointerdown", () => {
        if (this.element.classList.contains("wp-desktop-window--overview")) {
          return;
        }
        this.onFocusRequest?.(this);
      });
      this.titleBar.addEventListener("pointerdown", this.onDragStart.bind(this));
      const resizeHandle = this.element.querySelector(".wp-desktop-window__resize-handle");
      resizeHandle.addEventListener("pointerdown", this.onResizeStart.bind(this));
      const btnMin = this.element.querySelector(".wp-desktop-window__btn--minimize");
      const btnMax = this.element.querySelector(".wp-desktop-window__btn--maximize");
      const btnFocus = this.element.querySelector(".wp-desktop-window__btn--focus");
      const btnDetach = this.element.querySelector(
        ".wp-desktop-window__btn--detach"
      );
      const btnClose = this.element.querySelector(".wp-desktop-window__btn--close");
      const menuBtn = this.element.querySelector(
        ".wp-desktop-window__menu-btn"
      );
      const menuPanel = this.element.querySelector(
        ".wp-desktop-window__menu-panel"
      );
      if (menuBtn && menuPanel) {
        menuBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.toggleActionsMenu();
        });
        const openAnother = menuPanel.querySelector(
          ".wp-desktop-window__menu-item--open-another"
        );
        if (openAnother) {
          openAnother.addEventListener("click", (e) => {
            e.stopPropagation();
            this.closeActionsMenu();
            this.onOpenAnother?.(this);
          });
        }
        const startup = menuPanel.querySelector(
          ".wp-desktop-window__menu-item--startup"
        );
        if (startup) {
          this.refreshStartupCheckState(startup);
          startup.addEventListener("click", (e) => {
            e.stopPropagation();
            this.flipStartupCheckOptimistically(startup);
            this.onToggleStartup?.(this);
          });
          document.addEventListener(
            "wp-desktop-default-window-changed",
            () => {
              this.refreshStartupCheckState(startup);
            }
          );
        }
        menuPanel.addEventListener("keydown", (e) => {
          const kev = e;
          if (kev.key === "Escape") {
            e.stopPropagation();
            this.closeActionsMenu();
            menuBtn.focus();
          }
        });
      }
      btnMin.addEventListener("click", (e) => {
        e.stopPropagation();
        this.minimize();
      });
      btnMax.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleMaximize();
      });
      btnFocus.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleFullscreen();
      });
      btnDetach?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.detach();
      });
      btnClose.addEventListener("click", (e) => {
        e.stopPropagation();
        this.close();
      });
      this.titleBar.addEventListener("dblclick", () => {
        this.toggleMaximize();
      });
      if (this.iframe) {
        const iframe = this.iframe;
        const tabs = this.element.querySelector(".wp-desktop-window__tabs");
        if (tabs) {
          tabs.addEventListener("click", (e) => {
            const target = e.target;
            const chip = target.closest("[data-tab-action]");
            if (chip) {
              e.stopPropagation();
              const action = chip.dataset.tabAction;
              const tabId2 = chip.dataset.tabId;
              if (!tabId2) {
                return;
              }
              if (action === "close") {
                this.closeExternalTab(tabId2);
              } else if (action === "detach") {
                this.detachExternalTab(tabId2);
              }
              return;
            }
            const tab = target.closest(".wp-desktop-window__tab");
            if (!tab) {
              return;
            }
            e.stopPropagation();
            const kind = tab.dataset.kind;
            const tabId = tab.dataset.tabId;
            if (kind === "external" && tabId) {
              this.switchToTab(tabId);
              return;
            }
            if (kind === "main") {
              this.switchToTab("primary");
              return;
            }
            if (tab.dataset.url) {
              const next = withChromelessParam(tab.dataset.url);
              if (next) {
                iframe.src = next;
              }
              this.switchToTab("primary");
            }
          });
        }
        iframe.addEventListener("load", () => {
          try {
            const href = iframe.contentWindow?.location.href;
            if (href) {
              this.syncActiveTab(href);
            }
          } catch {
          }
        });
        window.addEventListener("message", this.boundOnMessage);
      }
    }
    /**
     * Update the active tab to whichever submenu URL matches the iframe's
     * current location. Called after every iframe navigation.
     *
     * Only submenu tabs participate in URL-based matching. External
     * sub-tabs and the injected "main" tab manage their own active
     * state through `switchToTab`, since their notion of "active"
     * isn't a URL comparison — it's which iframe is foregrounded.
     */
    syncActiveTab(currentUrl) {
      const submenuTabs = this.element.querySelectorAll(
        '.wp-desktop-window__tab[data-kind="submenu"]'
      );
      if (!submenuTabs.length) {
        return;
      }
      if (this.activeTabId !== "primary") {
        for (const tab of submenuTabs) {
          tab.classList.remove("wp-desktop-window__tab--active");
          tab.setAttribute("aria-selected", "false");
        }
        return;
      }
      const activeKey = urlMatchKey(currentUrl);
      for (const tab of submenuTabs) {
        const tabUrl = tab.dataset.url;
        const isActive = !!tabUrl && urlMatchKey(tabUrl) === activeKey;
        tab.classList.toggle("wp-desktop-window__tab--active", isActive);
        tab.setAttribute("aria-selected", isActive ? "true" : "false");
      }
    }
    /**
     * Add a closeable+detachable sub-tab hosting an external URL.
     *
     * Flow:
     *   1. Lazily create a "Main" tab if this is the first external
     *      tab on a window that has no submenu (otherwise the user
     *      would have no way to get back to the admin page).
     *   2. Create an iframe for the external URL, hidden by default.
     *   3. Append a tab to the strip with label + detach + close chips.
     *   4. Switch to the new tab.
     *   5. Start a 2s readiness probe — if the iframe's `load` event
     *      doesn't fire in that window (network failure, hard block),
     *      auto-dismiss the tab and open the URL in a real browser
     *      tab with an explanatory toast. For subtler blocks
     *      (X-Frame-Options showing the browser's error page *inside*
     *      the iframe, which does fire `load`), the user sees the
     *      error and can hit the detach button themselves.
     */
    addExternalTab(url, label) {
      if (!this.iframe) {
        return;
      }
      const tabStrip = this.element.querySelector(
        ".wp-desktop-window__tabs"
      );
      const body = this.element.querySelector(
        ".wp-desktop-window__body"
      );
      if (!tabStrip || !body) {
        return;
      }
      this.ensureMainTab(tabStrip);
      const tabId = `ext-${++this.externalTabSeq}`;
      const tabEl = document.createElement("button");
      tabEl.className = "wp-desktop-window__tab wp-desktop-window__tab--external";
      tabEl.dataset.kind = "external";
      tabEl.dataset.tabId = tabId;
      tabEl.setAttribute("type", "button");
      tabEl.setAttribute("role", "tab");
      tabEl.setAttribute("aria-selected", "false");
      tabEl.title = url;
      const labelEl = document.createElement("span");
      labelEl.className = "wp-desktop-window__tab-label";
      labelEl.textContent = label;
      tabEl.appendChild(labelEl);
      const detachBtn = document.createElement("span");
      detachBtn.className = "wp-desktop-window__tab-chip wp-desktop-window__tab-chip--detach";
      detachBtn.dataset.tabAction = "detach";
      detachBtn.dataset.tabId = tabId;
      detachBtn.setAttribute("role", "button");
      detachBtn.setAttribute("aria-label", __("Open in a new browser tab"));
      detachBtn.title = __("Open in a new browser tab");
      detachBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M5 2H2.5v7.5H10V7M6.5 2H10v3.5M10 2L5.5 6.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
      tabEl.appendChild(detachBtn);
      const closeBtn = document.createElement("span");
      closeBtn.className = "wp-desktop-window__tab-chip wp-desktop-window__tab-chip--close";
      closeBtn.dataset.tabAction = "close";
      closeBtn.dataset.tabId = tabId;
      closeBtn.setAttribute("role", "button");
      closeBtn.setAttribute("aria-label", __("Close tab"));
      closeBtn.title = __("Close tab");
      closeBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M3.25 3.25l5.5 5.5M3.25 8.75l5.5-5.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/></svg>';
      tabEl.appendChild(closeBtn);
      tabStrip.appendChild(tabEl);
      const iframe = document.createElement("iframe");
      iframe.className = "wp-desktop-window__iframe wp-desktop-window__iframe--external";
      iframe.dataset.tabId = tabId;
      iframe.style.display = "none";
      iframe.src = url;
      body.appendChild(iframe);
      let loaded = false;
      const onLoad = () => {
        loaded = true;
      };
      iframe.addEventListener("load", onLoad, { once: true });
      const probeTimer = window.setTimeout(() => {
        if (loaded) {
          return;
        }
        iframe.removeEventListener("load", onLoad);
        this.fallbackToBrowserTab(tabId);
      }, EXTERNAL_IFRAME_READY_TIMEOUT_MS);
      const cancelProbe = () => {
        iframe.removeEventListener("load", onLoad);
        window.clearTimeout(probeTimer);
      };
      this.externalTabs.set(tabId, {
        tabEl,
        iframe,
        url,
        label,
        cancelProbe
      });
      this.switchToTab(tabId);
      tabEl.scrollIntoView({ behavior: "smooth", inline: "end", block: "nearest" });
      this.emitChange("state");
    }
    /**
     * Injects a "Main" tab at the start of the strip once external
     * tabs exist. For windows that already have a submenu, no main
     * tab is injected — submenu tabs already act as the return path
     * to primary content. Idempotent.
     */
    ensureMainTab(tabStrip) {
      if (tabStrip.querySelector('[data-kind="main"]')) {
        return;
      }
      if (tabStrip.querySelector('[data-kind="submenu"]')) {
        return;
      }
      const main = document.createElement("button");
      main.className = "wp-desktop-window__tab wp-desktop-window__tab--main wp-desktop-window__tab--active";
      main.dataset.kind = "main";
      main.setAttribute("type", "button");
      main.setAttribute("role", "tab");
      main.setAttribute("aria-selected", "true");
      main.textContent = this.config.title || "Main";
      tabStrip.prepend(main);
    }
    /**
     * Foreground a tab — either the primary iframe (tabId='primary')
     * or one of the external sub-tabs. Updates visibility across all
     * iframes and active state across all tabs.
     */
    switchToTab(tabId) {
      if (this.activeTabId === tabId) {
        return;
      }
      this.activeTabId = tabId;
      if (this.iframe) {
        this.iframe.style.display = tabId === "primary" ? "" : "none";
      }
      for (const [id, entry] of this.externalTabs) {
        entry.iframe.style.display = tabId === id ? "" : "none";
      }
      const tabEls = this.element.querySelectorAll(
        ".wp-desktop-window__tab"
      );
      tabEls.forEach((t) => {
        let isActive;
        if (t.dataset.kind === "main") {
          isActive = tabId === "primary";
        } else if (t.dataset.kind === "external") {
          isActive = t.dataset.tabId === tabId;
        } else {
          isActive = tabId === "primary" && t.classList.contains(
            "wp-desktop-window__tab--active"
          );
        }
        t.classList.toggle("wp-desktop-window__tab--active", isActive);
        t.setAttribute("aria-selected", isActive ? "true" : "false");
      });
    }
    /** Remove an external sub-tab + its iframe. */
    closeExternalTab(tabId) {
      const entry = this.externalTabs.get(tabId);
      if (!entry) {
        return;
      }
      entry.cancelProbe();
      entry.tabEl.remove();
      entry.iframe.remove();
      this.externalTabs.delete(tabId);
      if (this.activeTabId === tabId) {
        this.switchToTab("primary");
      }
      if (this.externalTabs.size === 0) {
        const main = this.element.querySelector(
          ".wp-desktop-window__tab--main"
        );
        main?.remove();
      }
      this.emitChange("state");
    }
    /**
     * Open an external sub-tab's current URL in a real browser tab and
     * close the sub-tab. The iframe's `contentWindow.location` may have
     * navigated beyond the original URL; we prefer that live URL so a
     * user who drilled 3 pages deep into an external site gets taken
     * to the right spot.
     */
    detachExternalTab(tabId) {
      const entry = this.externalTabs.get(tabId);
      if (!entry) {
        return;
      }
      let url = entry.url;
      try {
        const href = entry.iframe.contentWindow?.location.href;
        if (href && href !== "about:blank") {
          url = href;
        }
      } catch {
      }
      window.open(url, "_blank", "noopener");
      this.closeExternalTab(tabId);
    }
    /**
     * Fallback for sub-tabs that fail to load within the probe window.
     * Dismisses the sub-tab, opens the URL as a real browser tab, and
     * flashes a toast explaining why the shell gave up on embedding.
     */
    fallbackToBrowserTab(tabId) {
      const entry = this.externalTabs.get(tabId);
      if (!entry) {
        return;
      }
      const { url, label } = entry;
      this.closeExternalTab(tabId);
      showToast({
        message: sprintf(
          // translators: %s is the external site's title or URL.
          __(
            `Opened "%s" in a new browser tab — this site doesn't allow embedding.`
          ),
          label
        ),
        action: {
          label: __("Open"),
          onClick: () => {
            window.open(url, "_blank", "noopener");
          }
        }
      });
      window.open(url, "_blank", "noopener");
    }
    /**
     * Handle postMessage events from the iframe.
     */
    onMessage(event) {
      if (event.origin !== window.location.origin) {
        return;
      }
      if (!this.iframe || event.source !== this.iframe.contentWindow) {
        return;
      }
      const data = event.data;
      if (!data || typeof data.type !== "string") {
        return;
      }
      if (data.type === "wp-desktop-title-change" && typeof data.title === "string") {
        this.setTitle(data.title);
      }
      if (data.type === "wp-desktop-screen-meta" && Array.isArray(data.panels)) {
        this.addScreenMetaButtons(data.panels);
      }
      if (data.type === "wp-desktop-screen-meta-state") {
        this.setActiveScreenMetaPanel(
          typeof data.open === "string" ? data.open : null
        );
      }
      if (data.type === "wp-desktop-external-link" && typeof data.url === "string" && data.url !== "") {
        const label = typeof data.label === "string" && data.label !== "" ? data.label : data.url;
        this.addExternalTab(data.url, label);
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
      const container = this.element.querySelector(".wp-desktop-window__screen-meta");
      if (!container) {
        return;
      }
      container.innerHTML = "";
      const panelConfig = {
        "screen-options": { icon: "dashicons-admin-generic", label: "Screen Options" },
        help: { icon: "dashicons-editor-help", label: "Help" }
      };
      for (const panel of panels) {
        const cfg = panelConfig[panel];
        if (!cfg) {
          continue;
        }
        const btn = document.createElement("button");
        btn.className = "wp-desktop-window__meta-btn";
        btn.setAttribute("type", "button");
        btn.setAttribute("aria-label", cfg.label);
        btn.setAttribute("aria-pressed", "false");
        btn.dataset.panel = panel;
        btn.innerHTML = `<span class="dashicons ${cfg.icon}" aria-hidden="true"></span>`;
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.iframe?.contentWindow?.postMessage(
            { type: "wp-desktop-toggle-panel", panel },
            window.location.origin
          );
        });
        container.appendChild(btn);
      }
    }
    /**
     * Reflect the iframe's authoritative screen-meta state on the
     * title-bar buttons. At most one button is active at a time.
     */
    setActiveScreenMetaPanel(panel) {
      const container = this.element.querySelector(".wp-desktop-window__screen-meta");
      if (!container) {
        return;
      }
      container.querySelectorAll(".wp-desktop-window__meta-btn").forEach((btn) => {
        const isActive = btn.dataset.panel === panel;
        btn.classList.toggle("wp-desktop-window__meta-btn--active", isActive);
        btn.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    }
    /**
     * Start dragging the window.
     */
    onDragStart(e) {
      const target = e.target;
      if (target.closest(".wp-desktop-window__controls") || target.closest(".wp-desktop-window__screen-meta") || target.closest(".wp-desktop-window__menu-btn") || target.closest(".wp-desktop-window__menu-panel")) {
        return;
      }
      if (this.state === "maximized") {
        const titleRect = this.titleBar.getBoundingClientRect();
        const cursorRatioX = titleRect.width > 0 ? (e.clientX - titleRect.left) / titleRect.width : 0.5;
        this.element.classList.remove("wp-desktop-window--maximized");
        const w = this.savedGeometry?.width ?? this.element.offsetWidth;
        const h = this.savedGeometry?.height ?? this.element.offsetHeight;
        this.element.style.width = `${w}px`;
        this.element.style.height = `${h}px`;
        const left = Math.round(e.clientX - w * cursorRatioX);
        const top = Math.round(e.clientY - titleRect.height / 2);
        this.element.style.left = `${left}px`;
        this.element.style.top = `${top}px`;
        this.state = "normal";
        this.emitChange("state");
        doAction(HOOKS.WINDOW_UNMAXIMIZED, { windowId: this.id });
      }
      this.isDragging = true;
      this.dragOffsetX = e.clientX - this.element.offsetLeft;
      this.dragOffsetY = e.clientY - this.element.offsetTop;
      this.titleBar.setPointerCapture(e.pointerId);
      this.element.classList.add("wp-desktop-window--dragging");
      doAction(HOOKS.WINDOW_DRAG_START, { windowId: this.id });
      const snap = this.snapConfigProvider?.() ?? { enabled: false, cellWidth: 0, cellHeight: 0 };
      if (snap.enabled) {
        this.element.classList.add("wp-desktop-window--snap-drag");
      }
      const onDragMove = (ev) => {
        if (!this.isDragging) {
          return;
        }
        let x = ev.clientX - this.dragOffsetX;
        let y = ev.clientY - this.dragOffsetY;
        const desktop = this.element.parentElement;
        if (desktop) {
          x = Math.max(EDGE_MARGIN, Math.min(x, desktop.clientWidth - EDGE_MARGIN));
          y = Math.max(EDGE_MARGIN, Math.min(y, desktop.clientHeight - EDGE_MARGIN));
        }
        if (snap.enabled) {
          x = Math.round(x / snap.cellWidth) * snap.cellWidth;
          y = Math.round(y / snap.cellHeight) * snap.cellHeight;
        }
        this.element.style.left = `${x}px`;
        this.element.style.top = `${y}px`;
      };
      const onDragEnd = () => {
        if (!this.isDragging) {
          return;
        }
        this.isDragging = false;
        this.element.classList.remove("wp-desktop-window--dragging");
        this.element.classList.remove("wp-desktop-window--snap-drag");
        this.titleBar.removeEventListener("pointermove", onDragMove);
        this.titleBar.removeEventListener("pointerup", onDragEnd);
        this.titleBar.removeEventListener("pointercancel", onDragEnd);
        this.titleBar.removeEventListener("lostpointercapture", onDragEnd);
        this.emitChange("moved");
        const payload = {
          windowId: this.id,
          x: this.element.offsetLeft,
          y: this.element.offsetTop
        };
        doAction(HOOKS.WINDOW_DRAG_END, payload);
        doAction(HOOKS.WINDOW_MOVED, payload);
      };
      this.titleBar.addEventListener("pointermove", onDragMove);
      this.titleBar.addEventListener("pointerup", onDragEnd);
      this.titleBar.addEventListener("pointercancel", onDragEnd);
      this.titleBar.addEventListener("lostpointercapture", onDragEnd);
    }
    /**
     * Start resizing the window.
     */
    onResizeStart(e) {
      if (this.state === "maximized") {
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
      this.element.classList.add("wp-desktop-window--resizing");
      doAction(HOOKS.WINDOW_RESIZE_START, { windowId: this.id });
      const snap = this.snapConfigProvider?.() ?? { enabled: false, cellWidth: 0, cellHeight: 0 };
      if (snap.enabled) {
        this.element.classList.add("wp-desktop-window--snap-drag");
      }
      const onResizeMove = (ev) => {
        if (!this.isResizing) {
          return;
        }
        let newW = Math.max(this.config.minWidth, this.resizeStartW + (ev.clientX - this.resizeStartX));
        let newH = Math.max(this.config.minHeight, this.resizeStartH + (ev.clientY - this.resizeStartY));
        if (snap.enabled) {
          newW = Math.max(
            this.config.minWidth,
            Math.round(newW / snap.cellWidth) * snap.cellWidth
          );
          newH = Math.max(
            this.config.minHeight,
            Math.round(newH / snap.cellHeight) * snap.cellHeight
          );
        }
        this.element.style.width = `${newW}px`;
        this.element.style.height = `${newH}px`;
      };
      const onResizeEnd = () => {
        if (!this.isResizing) {
          return;
        }
        this.isResizing = false;
        this.element.classList.remove("wp-desktop-window--resizing");
        this.element.classList.remove("wp-desktop-window--snap-drag");
        const handle2 = this.element.querySelector(".wp-desktop-window__resize-handle");
        handle2.removeEventListener("pointermove", onResizeMove);
        handle2.removeEventListener("pointerup", onResizeEnd);
        handle2.removeEventListener("pointercancel", onResizeEnd);
        handle2.removeEventListener("lostpointercapture", onResizeEnd);
        this.emitChange("resized");
        const payload = {
          windowId: this.id,
          width: this.element.offsetWidth,
          height: this.element.offsetHeight
        };
        doAction(HOOKS.WINDOW_RESIZE_END, payload);
        doAction(HOOKS.WINDOW_RESIZED, payload);
      };
      const handle = e.target;
      handle.addEventListener("pointermove", onResizeMove);
      handle.addEventListener("pointerup", onResizeEnd);
      handle.addEventListener("pointercancel", onResizeEnd);
      handle.addEventListener("lostpointercapture", onResizeEnd);
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
      this.element.classList.toggle("wp-desktop-window--focused", focused);
    }
    /**
     * Update the window title.
     */
    setTitle(title) {
      this.titleEl.textContent = title;
      doAction(HOOKS.WINDOW_TITLE_CHANGED, { windowId: this.id, title });
    }
    /**
     * Minimize the window.
     */
    minimize() {
      this.state = "minimized";
      this.element.classList.add("wp-desktop-window--minimized");
      if (this.iframe) {
        const iframe = this.iframe;
        this.element.addEventListener("transitionend", (e) => {
          if (e.propertyName === "opacity" && this.state === "minimized") {
            iframe.style.visibility = "hidden";
          }
        }, { once: true });
      }
      this.onMinimize?.(this);
      this.emitChange("state");
      doAction(HOOKS.WINDOW_MINIMIZED, { windowId: this.id });
    }
    /**
     * Restore the window from minimized state.
     */
    restore() {
      if (this.iframe) {
        this.iframe.style.visibility = "";
      }
      const wasMinimized = this.state === "minimized";
      this.element.classList.remove("wp-desktop-window--minimized");
      if (wasMinimized) {
        this.state = "normal";
      }
      this.onFocusRequest?.(this);
      this.emitChange("state");
      if (wasMinimized) {
        doAction(HOOKS.WINDOW_RESTORED, { windowId: this.id });
      }
    }
    /**
     * Enter maximized state idempotently.
     *
     * Different from `toggleMaximize` in that it's a one-way: a
     * caller that wants the window maximized can call this without
     * worrying about the current state. No-op if already maximized.
     *
     * Used by the Overview-exit path so clicking a thumbnail can
     * animate directly from the grid position to maximized in one
     * co-animation, rather than the two chained animations a
     * `toggleMaximize` call would produce (first back-to-normal,
     * then normal-to-maximized).
     */
    maximize() {
      if (this.state === "maximized") {
        return;
      }
      const parent = this.element.parentElement;
      if (!parent) {
        return;
      }
      this.savedGeometry = {
        x: this.element.offsetLeft,
        y: this.element.offsetTop,
        width: this.element.offsetWidth,
        height: this.element.offsetHeight
      };
      this.element.classList.add("wp-desktop-window--maximized");
      this.element.style.left = "0px";
      this.element.style.top = "0px";
      this.element.style.width = `${parent.clientWidth}px`;
      this.element.style.height = `${parent.clientHeight}px`;
      this.state = "maximized";
      this.emitChange("state");
      doAction(HOOKS.WINDOW_MAXIMIZED, { windowId: this.id });
    }
    /**
     * Toggle between maximized and normal states.
     */
    toggleMaximize() {
      const parent = this.element.parentElement;
      if (!parent) {
        return;
      }
      if (this.state === "maximized") {
        this.element.classList.remove("wp-desktop-window--maximized");
        if (this.savedGeometry) {
          const restored = this.snapGeometry(this.savedGeometry);
          this.element.style.left = `${restored.x}px`;
          this.element.style.top = `${restored.y}px`;
          this.element.style.width = `${restored.width}px`;
          this.element.style.height = `${restored.height}px`;
          this.savedGeometry = restored;
        }
        this.state = "normal";
        this.emitChange("state");
        doAction(HOOKS.WINDOW_UNMAXIMIZED, { windowId: this.id });
      } else {
        this.savedGeometry = {
          x: this.element.offsetLeft,
          y: this.element.offsetTop,
          width: this.element.offsetWidth,
          height: this.element.offsetHeight
        };
        this.element.classList.add("wp-desktop-window--maximized");
        this.element.style.left = "0px";
        this.element.style.top = "0px";
        this.element.style.width = `${parent.clientWidth}px`;
        this.element.style.height = `${parent.clientHeight}px`;
        this.state = "maximized";
        this.emitChange("state");
        doAction(HOOKS.WINDOW_MAXIMIZED, { windowId: this.id });
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
      if (this.state === "fullscreen") {
        this.element.classList.remove("wp-desktop-window--fullscreen");
        if (this.savedFullscreenState) {
          const s = this.savedFullscreenState;
          this.element.style.left = `${s.x}px`;
          this.element.style.top = `${s.y}px`;
          this.element.style.width = `${s.width}px`;
          this.element.style.height = `${s.height}px`;
          this.element.classList.toggle(
            "wp-desktop-window--maximized",
            s.state === "maximized"
          );
          this.state = s.state;
          this.savedFullscreenState = null;
        } else {
          this.state = "normal";
        }
      } else {
        this.savedFullscreenState = {
          state: this.state,
          x: this.element.offsetLeft,
          y: this.element.offsetTop,
          width: this.element.offsetWidth,
          height: this.element.offsetHeight
        };
        this.element.classList.add("wp-desktop-window--fullscreen");
        this.state = "fullscreen";
      }
      updateFullscreenBodyClass();
      this.updateFocusButtonState();
      this.emitChange("state");
      doAction(
        this.state === "fullscreen" ? HOOKS.WINDOW_FULLSCREEN_ENTERED : HOOKS.WINDOW_FULLSCREEN_EXITED,
        { windowId: this.id }
      );
    }
    /**
     * Reflect fullscreen state on the focus-mode button (active class,
     * aria-pressed, and label).
     */
    updateFocusButtonState() {
      const btn = this.element.querySelector(
        ".wp-desktop-window__btn--focus"
      );
      if (!btn) {
        return;
      }
      const isFullscreen = this.state === "fullscreen";
      btn.classList.toggle("wp-desktop-window__btn--active", isFullscreen);
      btn.setAttribute("aria-pressed", isFullscreen ? "true" : "false");
      btn.setAttribute(
        "aria-label",
        isFullscreen ? __("Exit fullscreen") : __("Enter fullscreen")
      );
    }
    /**
     * Open the window's current URL in a new browser tab as classic
     * wp-admin.
     *
     * Strips the chromeless `wp_desktop` flag and the transient
     * `wp_desktop_portal` flag, and tags the URL with
     * `wp_desktop_classic=1` so the server-side admin_init redirect
     * (which otherwise forwards plain admin URLs to `/wp-desktop/`)
     * lets the request through. The tag only has to survive the first
     * request; once the browser renders the page, the user's in-tab
     * navigation returns to normal admin flow.
     *
     * The desktop window itself stays open — detach is a branch, not
     * a move. If the user wants to close it afterwards, they can.
     */
    detach() {
      const current = this.getCurrentUrl();
      let url;
      try {
        url = new URL(current, window.location.origin);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) {
        return;
      }
      url.searchParams.delete("wp_desktop");
      url.searchParams.delete("wp_desktop_portal");
      url.searchParams.set("wp_desktop_classic", "1");
      window.open(url.toString(), "_blank", "noopener");
      doAction(HOOKS.WINDOW_DETACHED, { windowId: this.id, url: url.toString() });
    }
    /**
     * Toggle the title-bar actions menu.
     */
    /**
     * Flip the "Open on startup" check state immediately on click so
     * the user sees instant feedback — the REST round-trip confirms
     * shortly after via the `wp-desktop-default-window-changed` event,
     * which calls `refreshStartupCheckState` with the canonical state.
     * If the REST fails the optimistic flip stays (wrong) until the
     * next menu open, where the canonical check takes over.
     */
    flipStartupCheckOptimistically(button) {
      const isChecked = button.getAttribute("aria-checked") === "true";
      const next = !isChecked;
      button.setAttribute("aria-checked", next ? "true" : "false");
      button.classList.toggle("wp-desktop-window__menu-item--checked", next);
    }
    /**
     * Compare this window's current URL against the user's saved
     * default-window preference and paint the "Open on startup" menu
     * item's checked state accordingly. Called when the menu is built
     * and every time the public preference changes.
     */
    refreshStartupCheckState(button) {
      const pref = window.wp?.desktop?.config?.defaultWindow;
      let isDefault = false;
      if (pref && pref.enabled && typeof pref.url === "string") {
        try {
          const currentKey = urlMatchKey(this.getCurrentUrl());
          const prefKey = urlMatchKey(pref.url);
          isDefault = currentKey === prefKey;
        } catch {
          isDefault = false;
        }
      }
      button.setAttribute("aria-checked", isDefault ? "true" : "false");
      button.classList.toggle(
        "wp-desktop-window__menu-item--checked",
        isDefault
      );
    }
    toggleActionsMenu() {
      const panel = this.element.querySelector(
        ".wp-desktop-window__menu-panel"
      );
      if (!panel) {
        return;
      }
      if (panel.hidden) {
        this.openActionsMenu();
      } else {
        this.closeActionsMenu();
      }
    }
    /**
     * Open the title-bar actions menu and wire an outside-click listener
     * that dismisses it. The listener uses pointerdown (capture phase) so
     * it fires before any click handler on the clicked target, which keeps
     * dock/icon clicks outside the menu from opening-then-immediately-
     * closing anything.
     */
    openActionsMenu() {
      const panel = this.element.querySelector(
        ".wp-desktop-window__menu-panel"
      );
      const btn = this.element.querySelector(
        ".wp-desktop-window__menu-btn"
      );
      if (!panel || !btn) {
        return;
      }
      panel.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      const startup = panel.querySelector(
        ".wp-desktop-window__menu-item--startup"
      );
      if (startup) {
        this.refreshStartupCheckState(startup);
      }
      if (!this.boundOnDocumentPointerDown) {
        this.boundOnDocumentPointerDown = (e) => {
          const target = e.target;
          if (!target) {
            return;
          }
          if (panel.contains(target) || btn.contains(target)) {
            return;
          }
          this.closeActionsMenu();
        };
      }
      setTimeout(() => {
        if (this.boundOnDocumentPointerDown) {
          document.addEventListener(
            "pointerdown",
            this.boundOnDocumentPointerDown,
            true
          );
        }
      }, 0);
      const firstItem = panel.querySelector(
        '[role="menuitem"]'
      );
      firstItem?.focus();
    }
    /**
     * Close the title-bar actions menu.
     */
    closeActionsMenu() {
      const panel = this.element.querySelector(
        ".wp-desktop-window__menu-panel"
      );
      const btn = this.element.querySelector(
        ".wp-desktop-window__menu-btn"
      );
      if (panel) {
        panel.hidden = true;
      }
      if (btn) {
        btn.setAttribute("aria-expanded", "false");
      }
      if (this.boundOnDocumentPointerDown) {
        document.removeEventListener(
          "pointerdown",
          this.boundOnDocumentPointerDown,
          true
        );
      }
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
      this.onClose?.(this);
      this.element.classList.add("wp-desktop-window--closing");
      let removed = false;
      const onDone = () => {
        if (removed) {
          return;
        }
        removed = true;
        window.removeEventListener("message", this.boundOnMessage);
        if (this.boundOnDocumentPointerDown) {
          document.removeEventListener(
            "pointerdown",
            this.boundOnDocumentPointerDown,
            true
          );
        }
        this.element.remove();
        updateFullscreenBodyClass();
      };
      const onTransitionEnd = (e) => {
        if (e.propertyName === "opacity") {
          this.element.removeEventListener("transitionend", onTransitionEnd);
          onDone();
        }
      };
      this.element.addEventListener("transitionend", onTransitionEnd);
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
        state: this.state
      };
    }
    /**
     * Number of external sub-tabs currently open on this window.
     * Zero for windows that haven't had any external-link clicks.
     * Exposed publicly (rather than via the snapshot) so callers
     * like the Overview label renderer can decorate thumbnails
     * without paying the cost of a full serialization pass.
     */
    getExternalTabCount() {
      return this.externalTabs.size;
    }
    /**
     * Serializable snapshot of this window's external sub-tabs.
     * Iteration order follows the `Map`'s insertion order, which
     * matches the tab strip's left-to-right order — so restoring
     * preserves the visual layout.
     */
    getExternalTabsSnapshot() {
      const out = [];
      for (const entry of this.externalTabs.values()) {
        let url = entry.url;
        try {
          const href = entry.iframe.contentWindow?.location.href;
          if (href && href !== "about:blank") {
            url = href;
          }
        } catch {
        }
        out.push({ url, label: entry.label });
      }
      return out;
    }
  }
  const BASE_Z_INDEX = 100;
  const CASCADE_OFFSET = 30;
  const _WindowManager = class _WindowManager {
    constructor(desktop) {
      this.stack = [];
      this.cascadeIndex = 0;
      this.desktops = [
        // translators: default desktop name — "Desktop 1"
        { id: "desktop-1", label: __("Desktop 1") }
      ];
      this.activeDesktopId = "desktop-1";
      this.desktopSeq = 1;
      this.onToggleStartupRequested = null;
      this.desktopResizeObserver = null;
      this.snapEnabled = (() => {
        try {
          return window.localStorage.getItem(
            _WindowManager.SNAP_STORAGE_KEY
          ) === "1";
        } catch {
          return false;
        }
      })();
      this.overviewActive = false;
      this.overviewSnapshot = /* @__PURE__ */ new Map();
      this.overviewLabels = /* @__PURE__ */ new Map();
      this.overviewPointerDownHandler = null;
      this.overviewPointerUpHandler = null;
      this.overviewKeyHandler = null;
      this.overviewPressTarget = null;
      this.overviewClickBlocker = null;
      this.overviewTopBar = null;
      this.overviewMouseHandler = null;
      this.lastOverviewHoverId = null;
      this.desktop = desktop;
      if (typeof ResizeObserver !== "undefined") {
        this.desktopResizeObserver = new ResizeObserver(
          () => this.reflowMaximizedWindows()
        );
        this.desktopResizeObserver.observe(desktop);
      }
    }
    /**
     * Re-apply maximize bounds to any window currently in
     * `state === 'maximized'`. Called from the desktop-area
     * ResizeObserver so the user can shrink the browser window
     * without the maximized content refusing to follow.
     *
     * Skipped during overview mode: there, windows carry CSS
     * transforms for the thumbnail layout, and touching their
     * inline geometry would desync the live transform math.
     * Overview exit re-applies maximize correctly via its own path.
     *
     * Fullscreen windows aren't touched either — they're
     * `position: fixed; inset: 0` in CSS, so the viewport naturally
     * sizes them without JS involvement.
     */
    reflowMaximizedWindows() {
      if (this.overviewActive) {
        return;
      }
      for (const w of this.stack) {
        if (w.state !== "maximized") {
          continue;
        }
        const parent = w.element.parentElement;
        if (!parent) {
          continue;
        }
        w.element.style.width = `${parent.clientWidth}px`;
        w.element.style.height = `${parent.clientHeight}px`;
      }
    }
    /**
     * Open a new window — or focus an existing one — for the given page.
     *
     * Matches any existing window sharing the same `baseId` (defaulting to
     * the config's `id`). For singleton pages (Settings, Dashboard, …)
     * `baseId === id`, so this behaves exactly like strict id matching.
     * For multi pages, clicking the dock icon while a window is already
     * open focuses the most-recent instance rather than creating a twin.
     *
     * To force a brand-new instance alongside an existing one, use
     * {@link openNew}.
     */
    open(config) {
      const baseId = config.baseId || config.id;
      const existing = this.getByBaseId(baseId);
      if (existing) {
        this.focus(existing);
        if (existing.state === "minimized") {
          existing.restore();
        }
        return existing;
      }
      return this.createWindow({ ...config, baseId });
    }
    /**
     * Open a brand-new window even if one is already open for this page.
     *
     * Only makes sense for pages flagged `multi` — invoked by the dock's
     * "+" chip and the window title-bar's "Open another" action. The new
     * instance gets a suffixed id (`${baseId}-2`, `${baseId}-3`, …) while
     * keeping the same baseId so the dock still groups it with siblings.
     *
     * Finds the lowest unused suffix, so closing an intermediate instance
     * and opening another won't reuse its id while it's still in-flight.
     */
    openNew(config) {
      const baseId = config.baseId || config.id;
      const nextId = this.nextInstanceId(baseId);
      return this.createWindow({ ...config, id: nextId, baseId });
    }
    /**
     * Build and mount a window element. Common tail shared by open() and
     * openNew() — everything that happens once the id has been resolved.
     */
    createWindow(config) {
      const desktopRect = this.desktop.getBoundingClientRect();
      const defaultWidth = Math.min(Math.round(desktopRect.width * 0.8), 1200);
      const defaultHeight = Math.min(Math.round(desktopRect.height * 0.8), 800);
      const cascadeX = 40 + this.cascadeIndex % 8 * CASCADE_OFFSET;
      const cascadeY = 40 + this.cascadeIndex % 8 * CASCADE_OFFSET;
      const fullConfig = {
        icon: config.icon || "dashicons-admin-generic",
        x: config.x ?? cascadeX,
        y: config.y ?? cascadeY,
        width: config.width ?? defaultWidth,
        height: config.height ?? defaultHeight,
        minWidth: config.minWidth ?? 320,
        minHeight: config.minHeight ?? 200,
        ...config,
        baseId: config.baseId || config.id,
        // New windows always join the active desktop. A caller can
        // pre-seed `desktopId` (e.g. session restore) by passing it
        // in `config`, which the spread above preserves.
        desktopId: config.desktopId || this.activeDesktopId
      };
      this.cascadeIndex++;
      const win = new Window(fullConfig);
      win.onFocusRequest = (w) => this.focus(w);
      win.onClose = (w) => this.remove(w);
      win.onMinimize = () => {
        const visible = this.stack.filter((w) => w.state !== "minimized");
        if (visible.length > 0) {
          this.focus(visible[visible.length - 1]);
        }
      };
      win.onOpenAnother = (w) => {
        this.openNew({
          id: w.config.baseId || w.id,
          baseId: w.config.baseId || w.id,
          url: w.config.url,
          title: w.config.title,
          icon: w.config.icon,
          submenu: w.config.submenu,
          multi: true
        });
      };
      win.onToggleStartup = (w) => {
        this.onToggleStartupRequested?.(w);
      };
      win.snapConfigProvider = () => this.getSnapConfig();
      this.stack.push(win);
      this.desktop.appendChild(win.element);
      this.applyDesktopVisibility(win);
      this.focus(win);
      const openedDetail = {
        windowId: win.id,
        page: config.url,
        title: config.title,
        url: config.url
      };
      document.dispatchEvent(
        new CustomEvent("wp-desktop-window-opened", { detail: openedDetail })
      );
      doAction(HOOKS.WINDOW_OPENED, openedDetail);
      return win;
    }
    /**
     * Find the next unused suffixed id for a given baseId. Prefers the
     * bare baseId itself if free (user closed the original), then walks
     * `-2`, `-3`, … until it lands on one not currently in the stack.
     */
    nextInstanceId(baseId) {
      const taken = new Set(this.stack.map((w) => w.id));
      if (!taken.has(baseId)) {
        return baseId;
      }
      let n = 2;
      while (taken.has(`${baseId}-${n}`)) {
        n++;
      }
      return `${baseId}-${n}`;
    }
    /**
     * Focus a window: bring it to top of z-stack.
     */
    focus(win) {
      const idx = this.stack.indexOf(win);
      if (idx > -1) {
        this.stack.splice(idx, 1);
      }
      this.stack.push(win);
      this.stack.forEach((w, i) => {
        w.setZIndex(BASE_Z_INDEX + i);
        w.setFocused(i === this.stack.length - 1);
      });
      const focusedDetail = { windowId: win.id };
      document.dispatchEvent(
        new CustomEvent("wp-desktop-window-focused", { detail: focusedDetail })
      );
      doAction(HOOKS.WINDOW_FOCUSED, focusedDetail);
    }
    /**
     * Remove a window from the stack and DOM.
     */
    remove(win) {
      const idx = this.stack.indexOf(win);
      if (idx > -1) {
        this.stack.splice(idx, 1);
      }
      if (this.stack.length > 0) {
        this.focus(this.stack[this.stack.length - 1]);
      }
      const closedDetail = { windowId: win.id };
      document.dispatchEvent(
        new CustomEvent("wp-desktop-window-closed", { detail: closedDetail })
      );
      doAction(HOOKS.WINDOW_CLOSED, closedDetail);
    }
    /**
     * Get a window by its ID.
     */
    getById(id) {
      return this.stack.find((w) => w.id === id);
    }
    /**
     * Get the most-recently-focused window for a given baseId.
     *
     * Multi-instance windows share a baseId; the stack is ordered bottom
     * to top by focus, so iterating from the end finds the best candidate
     * to bring forward when the user re-clicks the dock icon.
     */
    getByBaseId(baseId) {
      for (let i = this.stack.length - 1; i >= 0; i--) {
        const w = this.stack[i];
        if ((w.config.baseId || w.id) === baseId) {
          return w;
        }
      }
      return void 0;
    }
    /**
     * Get every open window sharing the given baseId, ordered by
     * instance slot (bare baseId first, then `-2`, `-3`, …) rather than
     * z-order — so the dock's instance rail keeps a stable left-to-right
     * order even as the user focuses between windows.
     */
    getAllByBaseId(baseId) {
      const instanceSlot = (id) => {
        if (id === baseId) {
          return 1;
        }
        const prefix = `${baseId}-`;
        if (id.startsWith(prefix)) {
          const n = parseInt(id.slice(prefix.length), 10);
          return Number.isFinite(n) ? n : 999;
        }
        return 999;
      };
      return this.stack.filter((w) => (w.config.baseId || w.id) === baseId).sort((a, b) => instanceSlot(a.id) - instanceSlot(b.id));
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
      return this.stack.length > 0 ? this.stack[this.stack.length - 1] : void 0;
    }
    // ==========================================================
    // Virtual desktops ("Spaces")
    //
    // Each desktop owns its own set of windows. Switching desktops
    // hides the previous group and shows the new one without
    // destroying anything — iframe state, scroll position, in-page
    // JS state all survive a switch. Only one desktop is active at
    // any time.
    // ==========================================================
    /** Snapshot of the desktop list (display order). */
    getDesktops() {
      return [...this.desktops];
    }
    /**
     * Currently active desktop. Always defined — there is always at
     * least one desktop in the registry.
     */
    getActiveDesktop() {
      const found = this.desktops.find(
        (d) => d.id === this.activeDesktopId
      );
      return found ?? this.desktops[0];
    }
    /** Convenience wrapper used by snapshot serialisation. */
    getActiveDesktopId() {
      return this.getActiveDesktop().id;
    }
    /**
     * Show / hide a single window based on whether its desktop matches
     * the active one. Centralises the "windows on inactive desktops
     * are display:none" rule so any future tweak (e.g. opacity-fade
     * instead of hard hide) lives in one place.
     *
     * Native windows ride along with their desktop just like iframe
     * windows — there's no reason "OS Settings opened on Desktop 2"
     * should leak into Desktop 1.
     */
    applyDesktopVisibility(win) {
      const visible = win.config.desktopId === this.activeDesktopId;
      win.element.style.display = visible ? "" : "none";
    }
    /**
     * Re-evaluate visibility for every window. Called after the active
     * desktop changes or after a window is reassigned to a different
     * desktop (e.g. when its previous desktop was closed and its
     * windows were migrated to the survivor).
     */
    refreshDesktopVisibility() {
      for (const w of this.stack) {
        this.applyDesktopVisibility(w);
      }
    }
    /**
     * Append a brand-new desktop and return it. The new desktop's
     * label is auto-numbered (`Desktop 2`, `Desktop 3`, …) using the
     * monotonic seq counter so closing + reopening doesn't reuse the
     * same id mid-session.
     */
    createDesktop() {
      this.desktopSeq++;
      const desktop = {
        id: `desktop-${this.desktopSeq}`,
        // translators: %d is the desktop number (e.g., "Desktop 2")
        label: sprintf(__("Desktop %d"), this.desktopSeq)
      };
      this.desktops.push(desktop);
      doAction(HOOKS.DESKTOP_CREATED, { desktopId: desktop.id });
      return desktop;
    }
    /**
     * Switch the active desktop. No-op if `id` is already active or
     * doesn't exist. Fires `wp-desktop.desktop.switched` with both
     * the leaving and entering desktop ids so plugins can sync per-
     * desktop state (active-desktop-aware indicators, custom widgets,
     * etc.).
     */
    switchDesktop(id) {
      if (id === this.activeDesktopId) {
        return;
      }
      if (!this.desktops.some((d) => d.id === id)) {
        return;
      }
      const previousId = this.activeDesktopId;
      this.activeDesktopId = id;
      this.refreshDesktopVisibility();
      const topOnNew = [...this.stack].reverse().find((w) => w.config.desktopId === id && w.state !== "minimized");
      if (topOnNew) {
        this.focus(topOnNew);
      }
      doAction(HOOKS.DESKTOP_SWITCHED, {
        from: previousId,
        to: id
      });
    }
    /**
     * Close a desktop. Refuses to close the last remaining desktop —
     * the shell needs at least one. Windows on the closed desktop
     * migrate to the surviving desktop the user lands on (the one to
     * the left in the bar, falling back to the first), so the user
     * never silently loses work to a misclick.
     */
    closeDesktop(id) {
      if (this.desktops.length <= 1) {
        return;
      }
      const idx = this.desktops.findIndex((d) => d.id === id);
      if (idx === -1) {
        return;
      }
      const survivorIdx = idx > 0 ? idx - 1 : 1;
      const survivor = this.desktops[survivorIdx];
      for (const w of this.stack) {
        if (w.config.desktopId === id) {
          w.config.desktopId = survivor.id;
        }
      }
      this.desktops.splice(idx, 1);
      const wasActive = this.activeDesktopId === id;
      if (wasActive) {
        this.activeDesktopId = survivor.id;
        this.refreshDesktopVisibility();
      } else {
        this.refreshDesktopVisibility();
      }
      doAction(HOOKS.DESKTOP_CLOSED, {
        desktopId: id,
        migratedTo: survivor.id
      });
    }
    // ==========================================================
    // Window-arrangement layouts
    // ==========================================================
    /**
     * Cascade-lay-out every eligible window from the top-left of the
     * desktop area, each offset so previous windows' title bars stay
     * visible. Mirrors the classic Windows/macOS "cascade windows"
     * behavior; resets any fullscreen/maximized/minimized state
     * first so the cascade actually takes effect.
     *
     * Eligibility:
     *   - Not native (OS Settings etc. are pinned)
     *   - Will be restored from minimized so all windows are visible
     *
     * Sizing: uniform — 70% of the desktop area's minor axes, capped
     * so a 4K screen doesn't produce absurdly large windows. Offset
     * wraps back to the start after enough steps fit — a 20-window
     * cascade on a 1080p screen reuses the top-left after ~8 steps.
     */
    cascade() {
      const eligible = this.stack.filter(
        (w) => !w.config.native && w.config.desktopId === this.activeDesktopId
      );
      if (eligible.length === 0) {
        return;
      }
      doAction(HOOKS.ARRANGE_CASCADE_STARTING, {
        windowCount: eligible.length
      });
      for (const w of eligible) {
        if (w.state === "fullscreen") {
          w.toggleFullscreen();
        }
        if (w.state === "maximized") {
          w.toggleMaximize();
        }
        if (w.state === "minimized") {
          w.restore();
        }
      }
      const rect = this.desktop.getBoundingClientRect();
      const padding = 30;
      const offset = 30;
      const targetWidth = Math.min(Math.round(rect.width * 0.7), 1100);
      const targetHeight = Math.min(Math.round(rect.height * 0.75), 750);
      const maxStepsX = Math.max(
        1,
        Math.floor((rect.width - targetWidth - padding) / offset)
      );
      const maxStepsY = Math.max(
        1,
        Math.floor((rect.height - targetHeight - padding) / offset)
      );
      const maxSteps = Math.min(maxStepsX, maxStepsY);
      eligible.forEach((w, i) => {
        const step2 = i % Math.max(1, maxSteps);
        w.element.style.left = `${padding + step2 * offset}px`;
        w.element.style.top = `${padding + step2 * offset}px`;
        w.element.style.width = `${targetWidth}px`;
        w.element.style.height = `${targetHeight}px`;
      });
      const focused = this.getFocused();
      if (focused && !focused.config.native) {
        this.focus(focused);
      }
      document.dispatchEvent(
        new CustomEvent("wp-desktop-window-changed", {
          detail: { reason: "cascade" }
        })
      );
      doAction(HOOKS.ARRANGE_CASCADE_APPLIED, {
        windowCount: eligible.length
      });
    }
    /**
     * Tile every eligible window into a uniform grid that covers the
     * desktop area — "Show all windows," macOS-style. The grid
     * dimensions (cols × rows) are picked to maximise individual
     * window size while still fitting all of them, by matching the
     * cell aspect ratio to the desktop area's aspect ratio.
     *
     * Algorithm: among every (cols, rows) pair where `cols * rows ≥ N`,
     * pick the one whose cell aspect ratio (areaWidth/cols : areaHeight/rows)
     * is closest to the area's aspect ratio. Ties broken by fewer empty
     * cells. Capped at 6 cols / 6 rows so a runaway window count
     * doesn't produce postage-stamp tiles.
     */
    tile() {
      const eligible = this.stack.filter(
        (w) => !w.config.native && w.config.desktopId === this.activeDesktopId
      );
      if (eligible.length === 0) {
        return;
      }
      for (const w of eligible) {
        if (w.state === "fullscreen") {
          w.toggleFullscreen();
        }
        if (w.state === "maximized") {
          w.toggleMaximize();
        }
        if (w.state === "minimized") {
          w.restore();
        }
      }
      const rect = this.desktop.getBoundingClientRect();
      const auto = pickGridDimensions(
        eligible.length,
        rect.width,
        rect.height
      );
      const filtered = applyFilters(
        HOOKS.ARRANGE_TILE_DIMENSIONS,
        auto,
        {
          windowCount: eligible.length,
          areaWidth: rect.width,
          areaHeight: rect.height
        }
      );
      const { cols, rows } = isValidGrid(filtered, eligible.length) ? { cols: Math.floor(filtered.cols), rows: Math.floor(filtered.rows) } : auto;
      doAction(HOOKS.ARRANGE_TILE_STARTING, {
        windowCount: eligible.length,
        cols,
        rows
      });
      const padding = 16;
      const gap = 12;
      const cellWidth = Math.floor(
        (rect.width - padding * 2 - gap * (cols - 1)) / cols
      );
      const cellHeight = Math.floor(
        (rect.height - padding * 2 - gap * (rows - 1)) / rows
      );
      eligible.forEach((w, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        w.element.style.left = `${padding + col * (cellWidth + gap)}px`;
        w.element.style.top = `${padding + row * (cellHeight + gap)}px`;
        w.element.style.width = `${cellWidth}px`;
        w.element.style.height = `${cellHeight}px`;
      });
      const focused = this.getFocused();
      if (focused && !focused.config.native) {
        this.focus(focused);
      }
      document.dispatchEvent(
        new CustomEvent("wp-desktop-window-changed", {
          detail: { reason: "tile" }
        })
      );
      doAction(HOOKS.ARRANGE_TILE_APPLIED, {
        windowCount: eligible.length,
        cols,
        rows
      });
    }
    /** Public read for UI (admin-bar checkbox initial state). */
    isSnapEnabled() {
      return this.snapEnabled;
    }
    /**
     * Toggle (or set) the snap-to-grid preference. Persisted via
     * localStorage and broadcast through {@link HOOKS.ARRANGE_SNAP_CHANGED}
     * so any external UI mirroring the state stays in sync.
     */
    setSnapEnabled(enabled) {
      if (this.snapEnabled === enabled) {
        return;
      }
      this.snapEnabled = enabled;
      try {
        window.localStorage.setItem(
          _WindowManager.SNAP_STORAGE_KEY,
          enabled ? "1" : "0"
        );
      } catch {
      }
      doAction(HOOKS.ARRANGE_SNAP_CHANGED, { enabled });
    }
    /**
     * Resolve the live snap config for a window's drag/resize loop.
     * Cell sizes scale with the desktop area so a small viewport gets
     * a smaller grid (~12 cols × 8 rows) and a 4K monitor gets a
     * proportionally finer one.
     *
     * Each call hits `getBoundingClientRect`, so callers should cache
     * the result for the duration of a single drag rather than calling
     * once per pointermove.
     */
    getSnapConfig() {
      if (!this.snapEnabled) {
        return { enabled: false, cellWidth: 0, cellHeight: 0 };
      }
      const rect = this.desktop.getBoundingClientRect();
      const targetCols = rect.width >= rect.height ? 12 : 8;
      const auto = {
        cellWidth: Math.max(
          40,
          Math.round(rect.width / targetCols)
        ),
        cellHeight: Math.max(
          40,
          Math.round(rect.height / Math.round(targetCols * 0.66))
        )
      };
      const filtered = applyFilters(
        HOOKS.ARRANGE_SNAP_CELL_SIZE,
        auto,
        { areaWidth: rect.width, areaHeight: rect.height }
      );
      const { cellWidth, cellHeight } = isValidCellSize(filtered) ? filtered : auto;
      return { enabled: true, cellWidth, cellHeight };
    }
    /**
     * Enter overview mode — animate every eligible window to a
     * grid thumbnail layout. Clicking a thumbnail exits overview
     * and fullscreens the clicked window. Pressing Escape or
     * clicking the backdrop exits without selection.
     */
    enterOverview() {
      if (this.overviewActive) {
        return;
      }
      const eligible = this.stack.filter(
        (w) => !w.config.native && w.state !== "minimized" && w.config.desktopId === this.activeDesktopId
      );
      this.overviewActive = true;
      doAction(HOOKS.OVERVIEW_ENTERING, {});
      this.overviewSnapshot.clear();
      for (const w of eligible) {
        this.overviewSnapshot.set(w.id, {
          transform: w.element.style.transform || "",
          transition: w.element.style.transition || ""
        });
      }
      for (const w of eligible) {
        if (w.state === "fullscreen") {
          w.toggleFullscreen();
        }
      }
      const dockEl = document.getElementById("wp-desktop-dock");
      const dockWidth = dockEl ? dockEl.offsetWidth : 0;
      const currentRect = this.desktop.getBoundingClientRect();
      const targetRect = new DOMRect(
        currentRect.left - dockWidth,
        currentRect.top,
        currentRect.width + dockWidth,
        currentRect.height
      );
      this.desktop.classList.add("wp-desktop-area--overview");
      const shell = document.getElementById("wp-desktop-shell");
      shell?.classList.add("wp-desktop-shell--overview");
      this.overviewTopBar = this.buildOverviewTopBar();
      this.desktop.appendChild(this.overviewTopBar);
      const layout = computeOverviewLayout(
        eligible,
        targetRect,
        _WindowManager.OVERVIEW_TOP_BAR_RESERVE
      );
      this.overviewLabels.clear();
      for (const item of layout) {
        const el = item.win.element;
        el.classList.add("wp-desktop-window--overview");
        const dx = item.x - el.offsetLeft;
        const dy = item.y - el.offsetTop;
        el.style.transform = `translate(${dx}px, ${dy}px) scale(${item.scale})`;
        const label = this.createOverviewLabel(item);
        el.insertAdjacentElement("afterend", label);
        this.overviewLabels.set(item.win.id, label);
      }
      const pressTargetForEvent = (e) => {
        const target = e.target;
        const winEl = target?.closest(
          ".wp-desktop-window--overview"
        );
        if (winEl) {
          return {
            id: winEl.id.replace(/^wp-window-/, ""),
            element: winEl
          };
        }
        if (target === this.desktop) {
          return { id: "backdrop", element: this.desktop };
        }
        return null;
      };
      this.overviewPointerDownHandler = (e) => {
        if (e.button !== 0) {
          this.overviewPressTarget = null;
          return;
        }
        this.overviewPressTarget = pressTargetForEvent(e);
        if (this.overviewPressTarget) {
          e.preventDefault();
          e.stopPropagation();
        }
      };
      this.overviewPointerUpHandler = (e) => {
        if (e.button !== 0) {
          return;
        }
        const pressed = this.overviewPressTarget;
        this.overviewPressTarget = null;
        if (!pressed) {
          return;
        }
        const rect = pressed.element.getBoundingClientRect();
        const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
        if (!inside) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (pressed.id === "backdrop") {
          this.exitOverview();
          return;
        }
        const selected = this.getById(pressed.id);
        doAction(HOOKS.OVERVIEW_WINDOW_CLICK, { windowId: pressed.id });
        this.exitOverview(selected, true);
      };
      this.overviewKeyHandler = (e) => {
        if (e.key === "Escape") {
          this.exitOverview();
        }
      };
      this.desktop.addEventListener(
        "pointerdown",
        this.overviewPointerDownHandler,
        true
      );
      this.desktop.addEventListener(
        "pointerup",
        this.overviewPointerUpHandler,
        true
      );
      this.overviewClickBlocker = (e) => {
        const target = e.target;
        if (target?.closest(".wp-desktop-overview-top-bar")) {
          return;
        }
        e.stopPropagation();
        e.preventDefault();
      };
      this.desktop.addEventListener(
        "click",
        this.overviewClickBlocker,
        true
      );
      document.addEventListener("keydown", this.overviewKeyHandler);
      this.lastOverviewHoverId = null;
      this.overviewMouseHandler = (e) => {
        const target = e.target;
        const winEl = target?.closest(
          ".wp-desktop-window--overview"
        );
        const newId = winEl ? winEl.id.replace(/^wp-window-/, "") : null;
        if (newId === this.lastOverviewHoverId) {
          return;
        }
        if (this.lastOverviewHoverId) {
          doAction(HOOKS.OVERVIEW_WINDOW_UNHOVER, {
            windowId: this.lastOverviewHoverId
          });
        }
        if (newId) {
          doAction(HOOKS.OVERVIEW_WINDOW_HOVER, { windowId: newId });
        }
        this.lastOverviewHoverId = newId;
      };
      this.desktop.addEventListener("mouseover", this.overviewMouseHandler);
      window.setTimeout(() => {
        if (this.overviewActive) {
          doAction(HOOKS.OVERVIEW_ENTERED, {});
        }
      }, 300);
    }
    /**
     * Build the floating caption that sits above an overview
     * thumbnail. Carries the window's icon + title, plus a secondary
     * line with the external-tab count when the window has any — so
     * users can tell at a glance "oh this one has 3 sub-tabs open"
     * without expanding a thumbnail.
     *
     * Label sits OUTSIDE the window's transform (as a sibling in the
     * desktop area), so scaling the thumbnail has no effect on its
     * text size.
     */
    /**
     * Build the overview top bar — a tile per virtual desktop plus a
     * trailing "+" tile that creates a new one. Each tile carries:
     *
     *  - the desktop's label
     *  - a window-count meta line ("3 windows")
     *  - an active-state border when the desktop is the current one
     *  - a per-tile close button (X) revealed on hover, hidden when
     *    only one desktop exists (you can't close the last one)
     *
     * Tile click → switch + exit overview onto that desktop. The plus
     * tile creates a new desktop, switches to it, and exits. The X on
     * a tile closes that desktop (without exiting overview, so the
     * user can keep reorganising).
     */
    buildOverviewTopBar() {
      const bar = document.createElement("div");
      bar.className = "wp-desktop-overview-top-bar";
      const list = document.createElement("div");
      list.className = "wp-desktop-overview-top-bar__list";
      bar.appendChild(list);
      for (const d of this.desktops) {
        list.appendChild(this.buildDesktopTile(d));
      }
      const addTile = document.createElement("button");
      addTile.type = "button";
      addTile.className = "wp-desktop-overview-top-bar__tile wp-desktop-overview-top-bar__tile--add";
      addTile.setAttribute("aria-label", __("Add new desktop"));
      addTile.innerHTML = '<span class="wp-desktop-overview-top-bar__tile-plus" aria-hidden="true">+</span>';
      addTile.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const created = this.createDesktop();
        this.exitOverviewToDesktop(created.id);
      });
      list.appendChild(addTile);
      return bar;
    }
    /** Build a single desktop tile for the overview top bar. */
    buildDesktopTile(d) {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "wp-desktop-overview-top-bar__tile";
      tile.dataset.desktopId = d.id;
      if (d.id === this.activeDesktopId) {
        tile.classList.add(
          "wp-desktop-overview-top-bar__tile--active"
        );
      }
      tile.setAttribute("aria-label", sprintf(__("Switch to %s"), d.label));
      const preview = document.createElement("span");
      preview.className = "wp-desktop-overview-top-bar__tile-preview";
      const count = this.stack.filter(
        (w) => w.config.desktopId === d.id && !w.config.native
      ).length;
      if (count > 0) {
        const badge = document.createElement("span");
        badge.className = "wp-desktop-overview-top-bar__tile-count";
        badge.textContent = String(count);
        preview.appendChild(badge);
      }
      tile.appendChild(preview);
      const label = document.createElement("span");
      label.className = "wp-desktop-overview-top-bar__tile-label";
      label.textContent = d.label;
      tile.appendChild(label);
      const closeBtn = document.createElement("span");
      closeBtn.className = "wp-desktop-overview-top-bar__tile-close";
      closeBtn.setAttribute("role", "button");
      closeBtn.setAttribute("tabindex", "0");
      closeBtn.setAttribute("aria-label", sprintf(__("Close %s"), d.label));
      closeBtn.innerHTML = '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
      closeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.closeDesktop(d.id);
        this.refreshOverviewTopBar();
      });
      tile.appendChild(closeBtn);
      tile.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.exitOverviewToDesktop(d.id);
      });
      return tile;
    }
    /**
     * Re-render the top bar in place. Called after any operation that
     * mutates the desktop list (create, close) so the bar reflects
     * the new state without a full overview exit/re-enter cycle.
     */
    refreshOverviewTopBar() {
      if (!this.overviewTopBar) {
        return;
      }
      const fresh = this.buildOverviewTopBar();
      this.overviewTopBar.replaceWith(fresh);
      this.overviewTopBar = fresh;
    }
    /**
     * Switch to the given desktop, then exit overview without a
     * specific window selection. Used by top-bar tile clicks and the
     * post-create flow.
     */
    exitOverviewToDesktop(desktopId) {
      this.switchDesktop(desktopId);
      this.exitOverview();
    }
    createOverviewLabel(item) {
      const label = document.createElement("div");
      label.className = "wp-desktop-overview-label";
      label.dataset.windowId = item.win.id;
      const thumbW = item.win.element.offsetWidth * item.scale;
      label.style.left = `${item.x}px`;
      label.style.top = `${item.y - 34}px`;
      label.style.width = `${thumbW}px`;
      const iconClass = item.win.config.icon || "dashicons-admin-generic";
      const icon = document.createElement("span");
      icon.className = `wp-desktop-overview-label__icon dashicons ${iconClass}`;
      icon.setAttribute("aria-hidden", "true");
      label.appendChild(icon);
      const title = document.createElement("span");
      title.className = "wp-desktop-overview-label__title";
      title.textContent = item.win.config.title;
      label.appendChild(title);
      const tabCount = item.win.getExternalTabCount();
      if (tabCount > 0) {
        const meta = document.createElement("span");
        meta.className = "wp-desktop-overview-label__meta";
        meta.textContent = sprintf(
          // translators: %d is the number of external sub-tabs open on this window.
          _n("· %d open tab", "· %d open tabs", tabCount),
          tabCount
        );
        label.appendChild(meta);
      }
      return label;
    }
    /**
     * Exit overview mode. When `selected` is given and `maximize` is
     * true, the clicked window animates directly from its grid
     * thumbnail position to maximized bounds — one smooth pass,
     * no back-to-original-then-forward-to-maximized round trip.
     *
     * The trick: the overview transforms are cleared for every
     * window (transform → ''), which starts a transition on transform.
     * For the selected window we ALSO call `maximize()` in the same
     * frame, which changes `left/top/width/height` to cover the
     * desktop area. Because the base window CSS transitions both
     * `transform` AND those four geometry properties, the two
     * transitions run as one composite 280 ms animation: the window
     * lerps from scaled-grid-position straight to maximized-bounds.
     */
    exitOverview(selected, maximize = false) {
      if (!this.overviewActive) {
        return;
      }
      this.overviewActive = false;
      doAction(HOOKS.OVERVIEW_EXITING, {
        windowId: selected && maximize ? selected.id : void 0,
        reason: selected && maximize ? "select" : "cancel"
      });
      this.desktop.classList.remove("wp-desktop-area--overview");
      const shell = document.getElementById("wp-desktop-shell");
      shell?.classList.remove("wp-desktop-shell--overview");
      for (const [id, snap] of this.overviewSnapshot) {
        const w = this.getById(id);
        if (!w) {
          continue;
        }
        w.element.style.transform = snap.transform;
      }
      if (selected && maximize) {
        this.focus(selected);
        selected.maximize();
      }
      for (const label of this.overviewLabels.values()) {
        label.classList.add("wp-desktop-overview-label--out");
      }
      if (this.overviewTopBar) {
        this.overviewTopBar.classList.add(
          "wp-desktop-overview-top-bar--out"
        );
      }
      const ANIMATION_MS = 280;
      window.setTimeout(() => {
        for (const w of this.stack) {
          w.element.classList.remove("wp-desktop-window--overview");
        }
        for (const label of this.overviewLabels.values()) {
          label.remove();
        }
        this.overviewLabels.clear();
        this.overviewSnapshot.clear();
        if (this.overviewTopBar) {
          this.overviewTopBar.remove();
          this.overviewTopBar = null;
        }
        if (this.overviewClickBlocker) {
          this.desktop.removeEventListener(
            "click",
            this.overviewClickBlocker,
            true
          );
          this.overviewClickBlocker = null;
        }
        doAction(HOOKS.OVERVIEW_EXITED, {
          windowId: selected && maximize ? selected.id : void 0,
          reason: selected && maximize ? "select" : "cancel"
        });
      }, ANIMATION_MS);
      if (this.overviewPointerDownHandler) {
        this.desktop.removeEventListener(
          "pointerdown",
          this.overviewPointerDownHandler,
          true
        );
        this.overviewPointerDownHandler = null;
      }
      if (this.overviewPointerUpHandler) {
        this.desktop.removeEventListener(
          "pointerup",
          this.overviewPointerUpHandler,
          true
        );
        this.overviewPointerUpHandler = null;
      }
      this.overviewPressTarget = null;
      if (this.overviewKeyHandler) {
        document.removeEventListener("keydown", this.overviewKeyHandler);
        this.overviewKeyHandler = null;
      }
      if (this.overviewMouseHandler) {
        this.desktop.removeEventListener(
          "mouseover",
          this.overviewMouseHandler
        );
        this.overviewMouseHandler = null;
      }
      if (this.lastOverviewHoverId) {
        doAction(HOOKS.OVERVIEW_WINDOW_UNHOVER, {
          windowId: this.lastOverviewHoverId
        });
        this.lastOverviewHoverId = null;
      }
    }
    /**
     * Serialize the current window stack for session persistence.
     *
     * Order in the returned `windows` array mirrors z-order (earliest
     * opened / lowest-z first, focused last) so restoring preserves the
     * stacking the user left behind.
     */
    snapshot() {
      const focused = this.getFocused();
      const persistable = this.stack.filter((w) => !w.config.native);
      const windows = persistable.map((w) => {
        const snap = w.getSnapshot();
        const externalTabs = w.getExternalTabsSnapshot();
        return {
          id: w.id,
          baseId: w.config.baseId || w.id,
          desktopId: w.config.desktopId || this.activeDesktopId,
          url: w.getCurrentUrl(),
          title: w.config.title,
          icon: w.config.icon,
          state: snap.state,
          x: snap.x,
          y: snap.y,
          width: snap.width,
          height: snap.height,
          ...externalTabs.length > 0 ? { externalTabs } : {}
        };
      });
      const focusedId = focused && !focused.config.native ? focused.id : "";
      return {
        windows,
        desktops: this.getDesktops(),
        activeDesktop: this.activeDesktopId,
        focused: focusedId,
        updated: Math.floor(Date.now() / 1e3)
      };
    }
    /**
     * Replace the in-memory desktops list with a server-restored
     * snapshot. Called once during shell boot, BEFORE any windows are
     * recreated, so the per-window `desktopId` assignments line up
     * with desktop ids that actually exist.
     *
     * Defends against an empty list — the shell can't function with
     * zero desktops, so an empty payload falls back to the default.
     * The seq counter advances past the highest numeric suffix in
     * the restored list so newly created desktops don't collide.
     */
    seedDesktops(desktops, activeDesktopId) {
      if (desktops.length === 0) {
        return;
      }
      this.desktops = desktops.map((d) => ({ ...d }));
      this.activeDesktopId = desktops.some((d) => d.id === activeDesktopId) ? activeDesktopId : desktops[0].id;
      let highest = 0;
      for (const d of desktops) {
        const match = d.id.match(/^desktop-(\d+)$/);
        if (match) {
          const n = parseInt(match[1], 10);
          if (Number.isFinite(n) && n > highest) {
            highest = n;
          }
        }
      }
      this.desktopSeq = Math.max(this.desktopSeq, highest);
    }
  };
  _WindowManager.SNAP_STORAGE_KEY = "wp-desktop-snap-to-grid";
  _WindowManager.OVERVIEW_TOP_BAR_RESERVE = 120;
  let WindowManager = _WindowManager;
  function isValidGrid(candidate, windowCount) {
    if (!candidate || typeof candidate !== "object") {
      return false;
    }
    const c = candidate.cols;
    const r = candidate.rows;
    if (typeof c !== "number" || typeof r !== "number") {
      return false;
    }
    if (!Number.isFinite(c) || !Number.isFinite(r)) {
      return false;
    }
    if (c < 1 || r < 1) {
      return false;
    }
    return Math.floor(c) * Math.floor(r) >= windowCount;
  }
  function isValidCellSize(candidate) {
    if (!candidate || typeof candidate !== "object") {
      return false;
    }
    const w = candidate.cellWidth;
    const h = candidate.cellHeight;
    if (typeof w !== "number" || typeof h !== "number") {
      return false;
    }
    if (!Number.isFinite(w) || !Number.isFinite(h)) {
      return false;
    }
    return w > 0 && h > 0;
  }
  function pickGridDimensions(n, width, height) {
    if (n <= 1) {
      return { cols: 1, rows: 1 };
    }
    const areaAspect = width / Math.max(1, height);
    const max = 6;
    let best = { cols: n, rows: 1, score: Infinity };
    for (let cols = 1; cols <= Math.min(max, n); cols++) {
      const rows = Math.min(max, Math.ceil(n / cols));
      if (cols * rows < n) {
        continue;
      }
      const cellAspect = width / cols / Math.max(1, height / rows);
      const aspectDelta = Math.abs(cellAspect - areaAspect);
      const emptyCells = cols * rows - n;
      const score = aspectDelta + emptyCells * 0.05;
      if (score < best.score) {
        best = { cols, rows, score };
      }
    }
    return { cols: best.cols, rows: best.rows };
  }
  function computeOverviewLayout(windows, rect, topInset = 0) {
    const n = windows.length;
    if (n === 0) {
      return [];
    }
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const padding = 40;
    const gap = 24;
    const labelReserve = 34;
    const cellWidth = (rect.width - padding * 2 - gap * (cols - 1)) / cols;
    const cellHeight = (rect.height - padding * 2 - topInset - gap * (rows - 1)) / rows;
    const thumbCellHeight = Math.max(40, cellHeight - labelReserve);
    return windows.map((win, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cellX = padding + col * (cellWidth + gap);
      const cellY = topInset + padding + row * (cellHeight + gap) + labelReserve;
      const sourceW = win.element.offsetWidth;
      const sourceH = win.element.offsetHeight;
      const scale = Math.min(
        cellWidth / sourceW,
        thumbCellHeight / sourceH
      );
      const scaledW = sourceW * scale;
      const scaledH = sourceH * scale;
      return {
        win,
        x: cellX + (cellWidth - scaledW) / 2,
        y: cellY + (thumbCellHeight - scaledH) / 2,
        scale
      };
    });
  }
  class Dock {
    constructor(container, windowManager, items, adminUrl) {
      this.itemElements = /* @__PURE__ */ new Map();
      this.systemItems = [];
      this.systemItemElements = /* @__PURE__ */ new Map();
      this.systemSeparator = null;
      this.container = container;
      this.windowManager = windowManager;
      this.items = items;
      this.adminUrl = adminUrl;
      this.tooltip = document.createElement("div");
      this.tooltip.className = "wp-desktop-dock__tooltip";
      this.tooltip.setAttribute("role", "tooltip");
      document.body.appendChild(this.tooltip);
      this.render();
      this.bindWindowEvents();
    }
    /**
     * Append a JS-registered system item to the dock.
     *
     * System items render after the menu-derived items, separated by a
     * hairline divider. Use for shell affordances that don't live in
     * the admin menu: OS Settings today, Jorvy and desktop widgets
     * later. Callers supply their own `onOpen` — the dock doesn't
     * assume the item opens a window at all.
     */
    appendSystemItem(item) {
      this.systemItems.push(item);
      if (!this.systemSeparator) {
        this.systemSeparator = document.createElement("div");
        this.systemSeparator.className = "wp-desktop-dock__separator";
        this.systemSeparator.setAttribute("aria-hidden", "true");
        this.container.appendChild(this.systemSeparator);
      }
      const tile = this.createSystemItemButton(item);
      this.systemItemElements.set(item.id, tile);
      this.container.appendChild(tile);
      this.updateActiveStates();
    }
    /**
     * Render the dock contents.
     */
    render() {
      this.container.innerHTML = "";
      for (const item of this.items) {
        const btn = this.createItemButton(item);
        this.itemElements.set(item.id, btn);
        this.container.appendChild(btn);
      }
    }
    /**
     * Create a tile for a JS-registered system item. Structurally simpler
     * than a menu tile — no submenu, no multi-instance rail, no badge —
     * but uses the same base classes so the hover / focus / active
     * styling is shared.
     */
    createSystemItemButton(item) {
      const tile = document.createElement("div");
      tile.className = "wp-desktop-dock__item wp-desktop-dock__item--system";
      tile.dataset.systemId = item.id;
      const primary = document.createElement("button");
      primary.className = "wp-desktop-dock__item-primary";
      primary.setAttribute("type", "button");
      primary.setAttribute("aria-label", item.title);
      primary.appendChild(this.createIcon(item.icon));
      primary.addEventListener("click", () => item.onOpen());
      tile.appendChild(primary);
      this.bindTooltip(tile, item.title);
      return tile;
    }
    /**
     * Create a single dock icon tile.
     *
     * A tile is a vertical stack: the primary icon button, plus — for
     * multi-capable pages — an instance rail rendered below it showing one
     * dot per open window and a trailing "+" to open another. The rail is
     * hydrated by {@link updateActiveStates}; here we only place the empty
     * container so the DOM is stable.
     */
    createItemButton(item) {
      const tile = document.createElement("div");
      tile.className = "wp-desktop-dock__item";
      tile.dataset.menuSlug = item.id;
      if (item.multi) {
        tile.classList.add("wp-desktop-dock__item--multi");
      }
      const primary = document.createElement("button");
      primary.className = "wp-desktop-dock__item-primary";
      primary.setAttribute("type", "button");
      primary.setAttribute("aria-label", item.title);
      const iconEl = this.createIcon(item.icon);
      primary.appendChild(iconEl);
      if (item.badge > 0) {
        const badge = document.createElement("span");
        badge.className = "wp-desktop-dock__badge";
        badge.textContent = String(item.badge);
        badge.setAttribute(
          "aria-label",
          sprintf(
            // translators: %d is the number of pending updates / items.
            _n("%d update", "%d updates", item.badge),
            item.badge
          )
        );
        primary.appendChild(badge);
      }
      primary.addEventListener("click", () => {
        this.openPage(item);
      });
      tile.appendChild(primary);
      if (item.multi) {
        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "wp-desktop-dock__item-new";
        addBtn.hidden = true;
        addBtn.setAttribute(
          "aria-label",
          // translators: %s is the admin-page title (e.g., "Posts")
          sprintf(__("Open another %s"), item.title)
        );
        addBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M6 2v8M2 6h8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>';
        addBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.openNewInstance(item);
        });
        addBtn.addEventListener("pointerenter", () => {
          const rect = addBtn.getBoundingClientRect();
          this.tooltip.textContent = sprintf(__("Open new %s"), item.title);
          this.tooltip.style.top = `${rect.top + rect.height / 2 - 14}px`;
          this.tooltip.classList.add("wp-desktop-dock__tooltip--visible");
        });
        addBtn.addEventListener("pointerleave", (e) => {
          const next = e.relatedTarget;
          if (next && tile.contains(next)) {
            const rect = tile.getBoundingClientRect();
            this.tooltip.textContent = item.title;
            this.tooltip.style.top = `${rect.top + rect.height / 2 - 14}px`;
            return;
          }
          this.tooltip.classList.remove("wp-desktop-dock__tooltip--visible");
        });
        tile.appendChild(addBtn);
      }
      this.bindTooltip(tile, item.title);
      return tile;
    }
    /**
     * Create the icon element based on the icon type.
     */
    createIcon(icon) {
      if (icon.startsWith("dashicons-")) {
        const el2 = document.createElement("span");
        el2.className = `dashicons ${icon}`;
        el2.setAttribute("aria-hidden", "true");
        return el2;
      }
      if (icon.startsWith("data:image/svg+xml;base64,")) {
        const base64Part = icon.slice("data:image/svg+xml;base64,".length);
        if (/^[A-Za-z0-9+/=]+$/.test(base64Part)) {
          const el2 = document.createElement("span");
          el2.className = "wp-desktop-dock__item-svg";
          el2.style.backgroundImage = `url("${icon}")`;
          el2.style.backgroundSize = "contain";
          el2.style.backgroundRepeat = "no-repeat";
          el2.style.backgroundPosition = "center";
          el2.setAttribute("aria-hidden", "true");
          return el2;
        }
      }
      if (icon && icon !== "none" && icon !== "div") {
        const img = document.createElement("img");
        img.className = "wp-desktop-dock__item-img";
        img.src = icon;
        img.alt = "";
        img.setAttribute("aria-hidden", "true");
        return img;
      }
      const el = document.createElement("span");
      el.className = "dashicons dashicons-admin-generic";
      el.setAttribute("aria-hidden", "true");
      return el;
    }
    /**
     * Bind tooltip show/hide on hover.
     */
    bindTooltip(el, text) {
      el.addEventListener("pointerenter", () => {
        const rect = el.getBoundingClientRect();
        this.tooltip.textContent = text;
        this.tooltip.style.top = `${rect.top + rect.height / 2 - 14}px`;
        this.tooltip.classList.add("wp-desktop-dock__tooltip--visible");
      });
      el.addEventListener("pointerleave", () => {
        this.tooltip.classList.remove("wp-desktop-dock__tooltip--visible");
      });
    }
    /**
     * Open an admin page in a window (or focus if already open).
     */
    openPage(item) {
      const baseId = this.deriveWindowId(item.url);
      this.windowManager.open({
        id: baseId,
        baseId,
        url: item.url,
        title: item.title,
        icon: item.icon.startsWith("dashicons-") ? item.icon : "dashicons-admin-generic",
        submenu: item.submenu,
        multi: !!item.multi
      });
    }
    /**
     * Open a brand-new instance of a multi-capable page, even if one is
     * already open. Invoked by the "+" chip on the dock icon.
     */
    openNewInstance(item) {
      const baseId = this.deriveWindowId(item.url);
      this.windowManager.openNew({
        id: baseId,
        baseId,
        url: item.url,
        title: item.title,
        icon: item.icon.startsWith("dashicons-") ? item.icon : "dashicons-admin-generic",
        submenu: item.submenu,
        multi: true
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
     *
     * The event detail isn't used — we just need to re-query the
     * window manager on every change — so the handlers take no
     * argument and the type cast is gone with it.
     */
    bindWindowEvents() {
      const refresh = () => this.updateActiveStates();
      document.addEventListener("wp-desktop-window-opened", refresh);
      document.addEventListener("wp-desktop-window-closed", refresh);
      document.addEventListener("wp-desktop-window-focused", refresh);
    }
    /**
     * Update the active/focused classes and multi-instance rail on every
     * dock item in response to a window lifecycle event.
     *
     * For singletons the rail is absent; "active" means "the one window
     * is open". For multi-capable items, active means "≥1 instance is
     * open" and focused means "the focused window belongs to this item".
     */
    updateActiveStates() {
      const focused = this.windowManager.getFocused();
      const focusedBaseId = focused ? focused.config.baseId || focused.id : null;
      for (const item of this.items) {
        const tile = this.itemElements.get(item.id);
        if (!tile) {
          continue;
        }
        const baseId = this.deriveWindowId(item.url);
        const instances = item.multi ? this.windowManager.getAllByBaseId(baseId) : [];
        const singleOpen = !item.multi && !!this.windowManager.getById(baseId);
        const isOpen = item.multi ? instances.length > 0 : singleOpen;
        const isFocused = focusedBaseId === baseId;
        tile.classList.toggle("wp-desktop-dock__item--active", isOpen);
        tile.classList.toggle("wp-desktop-dock__item--focused", isFocused);
        if (item.multi) {
          const addBtn = tile.querySelector(
            ".wp-desktop-dock__item-new"
          );
          if (addBtn) {
            addBtn.hidden = instances.length === 0;
          }
        }
      }
      for (const sys of this.systemItems) {
        const tile = this.systemItemElements.get(sys.id);
        if (!tile) {
          continue;
        }
        const isOpen = sys.isOpen ? sys.isOpen() : false;
        const isFocused = !!focused && focused.id === sys.id;
        tile.classList.toggle("wp-desktop-dock__item--active", isOpen);
        tile.classList.toggle("wp-desktop-dock__item--focused", isFocused);
      }
    }
  }
  const seed$1 = [];
  function register$1(def) {
    if (!isValidDef$1(def)) {
      if (typeof console !== "undefined") {
        console.warn(
          "[wp-desktop-mode] Ignored invalid wallpaper registration:",
          def
        );
      }
      return;
    }
    const idx = seed$1.findIndex((w) => w.id === def.id);
    if (idx >= 0) {
      seed$1[idx] = def;
    } else {
      seed$1.push(def);
    }
  }
  function unregister(id) {
    const idx = seed$1.findIndex((w) => w.id === id);
    if (idx >= 0) {
      seed$1.splice(idx, 1);
    }
  }
  function all$1() {
    const copy = seed$1.slice();
    const filtered = applyFilters(HOOKS.WALLPAPERS, copy);
    if (!Array.isArray(filtered)) {
      if (typeof console !== "undefined") {
        console.warn(
          "[wp-desktop-mode] `wp-desktop.wallpapers` filter returned a non-array; falling back to seed list."
        );
      }
      return copy;
    }
    return filtered.filter(isValidDef$1);
  }
  function get$1(id) {
    return all$1().find((w) => w.id === id);
  }
  function isValidDef$1(def) {
    if (!def || typeof def !== "object") {
      return false;
    }
    const d = def;
    if (typeof d.id !== "string" || d.id === "") {
      return false;
    }
    if (typeof d.label !== "string" || d.label === "") {
      return false;
    }
    if (typeof d.preview !== "string" || d.preview === "") {
      return false;
    }
    if (d.type === "css") {
      return typeof d.value === "string" || typeof d.resolveValue === "function";
    }
    if (d.type === "canvas") {
      return typeof d.mount === "function";
    }
    return false;
  }
  const STORAGE_KEY$1 = "wp-desktop-os-settings";
  const HD_MIN_WIDTH = 1920;
  const HD_MIN_HEIGHT = 1080;
  const MEDIA_PER_PAGE = 40;
  const SEARCH_DEBOUNCE_MS = 300;
  const CUSTOM_GRADIENT_ID = "custom-gradient";
  const CUSTOM_IMAGE_ID = "custom-image";
  const DEFAULT_WALLPAPER_ID = "dark";
  const ACCENTS = [
    { id: "wp-blue", label: "WordPress Blue", value: "#2271b1" },
    { id: "indigo", label: "Indigo", value: "#3858e9" },
    { id: "teal", label: "Teal", value: "#04a4cc" },
    { id: "emerald", label: "Emerald", value: "#059669" },
    { id: "amber", label: "Amber", value: "#d97706" },
    { id: "rose", label: "Rose", value: "#e11d48" }
  ];
  const DOCK_SIZES = [
    { id: "compact", label: "Compact", width: 48, icon: 18 },
    { id: "default", label: "Default", width: 56, icon: 20 },
    { id: "large", label: "Large", width: 72, icon: 26 }
  ];
  function translateAccentLabel(id, fallback) {
    switch (id) {
      case "wp-blue":
        return __("WordPress Blue");
      case "indigo":
        return __("Indigo");
      case "teal":
        return __("Teal");
      case "emerald":
        return __("Emerald");
      case "amber":
        return __("Amber");
      case "rose":
        return __("Rose");
      default:
        return fallback;
    }
  }
  function translateDockSizeLabel(id, fallback) {
    switch (id) {
      case "compact":
        return __("Compact");
      case "default":
        return __("Default");
      case "large":
        return __("Large");
      default:
        return fallback;
    }
  }
  const DEFAULTS = {
    wallpaper: DEFAULT_WALLPAPER_ID,
    accent: "wp-blue",
    dockSize: "default",
    customGradient: {
      from: "#2271b1",
      to: "#7c3aed",
      angle: 135
    },
    customImage: null,
    libraryHdOnly: true
  };
  class OsSettings {
    constructor(config, layer) {
      this.activeEditorTeardown = null;
      this.config = config;
      this.layer = layer;
      this.state = this.load();
      this.registerCustomGradient();
      this.registerCustomImageIfPresent();
    }
    /**
     * Apply the current state: wallpaper via the layer, accent + dock
     * size as CSS custom properties on the shell.
     *
     * Safe to call repeatedly — calls into `layer.apply` dedupe via
     * generation counter; CSS property writes are idempotent.
     */
    apply() {
      const shell = document.getElementById("wp-desktop-shell");
      if (!shell) {
        return;
      }
      const def = get$1(this.state.wallpaper) || get$1(DEFAULT_WALLPAPER_ID) || all$1()[0];
      if (def) {
        this.layer.apply(def);
      }
      const accent = ACCENTS.find((a) => a.id === this.state.accent) ?? ACCENTS[0];
      const dockSize = DOCK_SIZES.find((d) => d.id === this.state.dockSize) ?? DOCK_SIZES[1];
      const root = document.documentElement;
      root.style.setProperty("--wp-admin-theme-color", accent.value);
      root.style.setProperty("--wp-desktop-dock-width", `${dockSize.width}px`);
      root.style.setProperty("--wp-desktop-dock-icon-size", `${dockSize.icon}px`);
    }
    /**
     * Render the settings panel into the given native-window body.
     *
     * Builds three sections (wallpaper, accent, dock size) and wires
     * each to save/apply on change. The panel is a one-shot build per
     * window open — closing and re-opening renders a fresh tree.
     */
    renderPanel(body) {
      this.teardownEditor();
      body.classList.add("wp-desktop-os-settings");
      body.innerHTML = "";
      const intro = document.createElement("p");
      intro.className = "wp-desktop-os-settings__intro";
      intro.textContent = __(
        "Personalize your desktop. Changes apply instantly and are saved to this browser."
      );
      body.appendChild(intro);
      body.appendChild(this.buildWallpaperSection(body));
      body.appendChild(this.buildAccentSection());
      body.appendChild(this.buildDockSizeSection());
      const footer = document.createElement("div");
      footer.className = "wp-desktop-os-settings__footer";
      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "wp-desktop-os-settings__reset";
      reset.textContent = __("Reset to defaults");
      reset.addEventListener("click", () => {
        const preservedImage = this.state.customImage;
        this.state = { ...DEFAULTS, customImage: preservedImage };
        this.save();
        this.apply();
        this.renderPanel(body);
      });
      footer.appendChild(reset);
      body.appendChild(footer);
    }
    // ------------------------------------------------------------------
    // Built-in dynamic registrations
    // ------------------------------------------------------------------
    /**
     * Register the custom-gradient wallpaper. Its CSS value is computed
     * on every apply from user state (so live edits through the editor
     * repaint without re-registering), and its renderEditor hosts the
     * color + angle controls.
     */
    registerCustomGradient() {
      register$1({
        id: CUSTOM_GRADIENT_ID,
        label: __("Custom gradient"),
        type: "css",
        preview: this.customGradientCss(),
        resolveValue: () => this.customGradientCss(),
        renderEditor: (container) => this.renderCustomGradientEditor(container)
      });
    }
    /**
     * Register or update the custom-image wallpaper based on current
     * state. Called on boot and after every upload/library pick/remove
     * action so the registry entry tracks `state.customImage`.
     */
    registerCustomImageIfPresent() {
      if (!this.state.customImage) {
        unregister(CUSTOM_IMAGE_ID);
        return;
      }
      const safeUrl = encodeURI(this.state.customImage.url);
      const value = `url("${safeUrl}") center/cover no-repeat, #1d2327`;
      register$1({
        id: CUSTOM_IMAGE_ID,
        label: __("Custom image"),
        type: "css",
        value,
        preview: value
      });
    }
    // ------------------------------------------------------------------
    // Wallpaper section — registry-driven grid + editor slot + image UI
    // ------------------------------------------------------------------
    buildWallpaperSection(body) {
      const section = this.buildSection(
        __("Wallpaper"),
        __(
          "The backdrop behind your windows. Pick a preset, mix your own gradient, or drop in an image."
        )
      );
      const grid = document.createElement("div");
      grid.className = "wp-desktop-os-settings__grid wp-desktop-os-settings__grid--wallpapers";
      const editorSlot = document.createElement("div");
      editorSlot.className = "wp-desktop-os-settings__editor-slot";
      editorSlot.dataset.expanded = "false";
      const editorInner = document.createElement("div");
      editorInner.className = "wp-desktop-os-settings__editor-slot-inner";
      editorSlot.appendChild(editorInner);
      const onSelect = (def) => {
        this.selectWallpaper(def.id, body);
        this.syncEditorSlot(editorSlot, editorInner, def);
      };
      for (const def of all$1()) {
        if (def.id === CUSTOM_IMAGE_ID) {
          continue;
        }
        grid.appendChild(this.buildWallpaperSwatch(def, () => onSelect(def)));
      }
      section.appendChild(grid);
      const active2 = get$1(this.state.wallpaper);
      if (active2) {
        this.syncEditorSlot(editorSlot, editorInner, active2);
      }
      section.appendChild(editorSlot);
      section.appendChild(this.buildCustomImageSection(body));
      return section;
    }
    buildWallpaperSwatch(def, onClick) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wp-desktop-os-settings__swatch wp-desktop-os-settings__swatch--wallpaper";
      btn.setAttribute("aria-label", def.label);
      btn.setAttribute("aria-pressed", this.state.wallpaper === def.id ? "true" : "false");
      btn.dataset.wallpaperId = def.id;
      btn.style.background = def.preview;
      const labelEl = document.createElement("span");
      labelEl.className = "wp-desktop-os-settings__swatch-label";
      labelEl.textContent = def.label;
      btn.appendChild(labelEl);
      btn.addEventListener("click", onClick);
      return btn;
    }
    /**
     * Select a wallpaper by id. Updates state, persists, applies to the
     * shell, and refreshes the grid's aria-pressed attributes.
     */
    selectWallpaper(id, body) {
      this.state.wallpaper = id;
      this.save();
      this.apply();
      this.refreshWallpaperPressedState(body);
    }
    refreshWallpaperPressedState(body) {
      body.querySelectorAll("[data-wallpaper-id]").forEach((el) => {
        el.setAttribute(
          "aria-pressed",
          el.dataset.wallpaperId === this.state.wallpaper ? "true" : "false"
        );
      });
    }
    /**
     * Mount the given wallpaper's editor into the editor slot, tearing
     * down any prior editor first. If the wallpaper has no editor, the
     * slot collapses.
     */
    syncEditorSlot(slot, inner, def) {
      this.teardownEditor();
      inner.innerHTML = "";
      if (!def.renderEditor) {
        slot.dataset.expanded = "false";
        return;
      }
      const ctx = {
        id: def.id,
        pluginUrl: "",
        prefersReducedMotion: typeof window.matchMedia === "function" && window.matchMedia("( prefers-reduced-motion: reduce )").matches,
        visible: !document.hidden
      };
      try {
        const result = def.renderEditor(inner, ctx);
        if (isPromise(result)) {
          result.then((teardown) => {
            this.activeEditorTeardown = teardown;
          });
        } else {
          this.activeEditorTeardown = result;
        }
      } catch (err) {
        if (typeof console !== "undefined") {
          console.error(
            `[wp-desktop-mode] Wallpaper "${def.id}" renderEditor threw:`,
            err
          );
        }
      }
      slot.dataset.expanded = "true";
    }
    teardownEditor() {
      if (this.activeEditorTeardown) {
        try {
          this.activeEditorTeardown();
        } catch (err) {
          if (typeof console !== "undefined") {
            console.error(
              "[wp-desktop-mode] Wallpaper editor teardown threw:",
              err
            );
          }
        }
        this.activeEditorTeardown = null;
      }
    }
    // ------------------------------------------------------------------
    // Custom gradient editor — implements `renderEditor` for the
    // built-in custom-gradient wallpaper. Color + angle inputs write
    // to state; every change updates the swatch preview and re-applies.
    // ------------------------------------------------------------------
    renderCustomGradientEditor(container) {
      container.classList.add("wp-desktop-os-settings__gradient-editor-inner");
      container.innerHTML = "";
      const row = document.createElement("div");
      row.className = "wp-desktop-os-settings__gradient-row";
      const buildColorField = (label, initialValue, onInput) => {
        const field = document.createElement("label");
        field.className = "wp-desktop-os-settings__gradient-field";
        const text = document.createElement("span");
        text.className = "wp-desktop-os-settings__gradient-label";
        text.textContent = label;
        field.appendChild(text);
        const input = document.createElement("input");
        input.type = "color";
        input.className = "wp-desktop-os-settings__color-input";
        input.value = initialValue;
        input.addEventListener("input", () => onInput(input.value));
        field.appendChild(input);
        return field;
      };
      const onGradientChange = () => {
        this.save();
        this.apply();
        this.syncGradientPreviewSwatch(container);
      };
      row.appendChild(
        buildColorField(__("From"), this.state.customGradient.from, (value) => {
          this.state.customGradient.from = value;
          onGradientChange();
        })
      );
      row.appendChild(
        buildColorField(__("To"), this.state.customGradient.to, (value) => {
          this.state.customGradient.to = value;
          onGradientChange();
        })
      );
      container.appendChild(row);
      const angleField = document.createElement("label");
      angleField.className = "wp-desktop-os-settings__gradient-angle";
      const angleLabel = document.createElement("span");
      angleLabel.className = "wp-desktop-os-settings__gradient-label";
      angleLabel.textContent = __("Angle");
      angleField.appendChild(angleLabel);
      const angleInput = document.createElement("input");
      angleInput.type = "range";
      angleInput.min = "0";
      angleInput.max = "360";
      angleInput.step = "1";
      angleInput.value = String(this.state.customGradient.angle);
      angleField.appendChild(angleInput);
      const angleValue = document.createElement("span");
      angleValue.className = "wp-desktop-os-settings__gradient-angle-value";
      angleValue.textContent = `${this.state.customGradient.angle}°`;
      angleField.appendChild(angleValue);
      angleInput.addEventListener("input", () => {
        const n = parseInt(angleInput.value, 10);
        if (!Number.isFinite(n)) {
          return;
        }
        this.state.customGradient.angle = n;
        angleValue.textContent = `${n}°`;
        onGradientChange();
      });
      container.appendChild(angleField);
      return () => {
      };
    }
    syncGradientPreviewSwatch(editorEl) {
      const section = editorEl.closest(".wp-desktop-os-settings__section");
      const preview = section?.querySelector(
        `[data-wallpaper-id="${CUSTOM_GRADIENT_ID}"]`
      );
      if (preview) {
        preview.style.background = this.customGradientCss();
      }
    }
    customGradientCss() {
      const { from, to, angle } = this.state.customGradient;
      return `linear-gradient(${angle}deg, ${from}, ${to})`;
    }
    // ------------------------------------------------------------------
    // Custom-image section — upload + library tabs (unchanged from v0.5)
    // ------------------------------------------------------------------
    buildCustomImageSection(body) {
      const wrap = document.createElement("div");
      wrap.className = "wp-desktop-os-settings__uploader";
      const heading = document.createElement("h4");
      heading.className = "wp-desktop-os-settings__uploader-heading";
      heading.textContent = __("Or use your own image");
      wrap.appendChild(heading);
      const tabList = document.createElement("div");
      tabList.className = "wp-desktop-os-settings__tabs";
      tabList.setAttribute("role", "tablist");
      const pane = document.createElement("div");
      pane.className = "wp-desktop-os-settings__tab-pane";
      const tabs = [];
      if (this.config.canUpload) {
        tabs.push({
          key: "upload",
          label: __("Upload new"),
          render: () => this.renderUploadPane(pane, body)
        });
      }
      tabs.push({
        key: "library",
        label: __("Media Library"),
        render: () => this.renderLibraryPane(pane, body)
      });
      const tabButtons = /* @__PURE__ */ new Map();
      let activeTab = tabs[0].key;
      const activateTab = (key) => {
        activeTab = key;
        for (const [k, btn] of tabButtons) {
          const isActive = k === key;
          btn.classList.toggle("wp-desktop-os-settings__tab--active", isActive);
          btn.setAttribute("aria-selected", isActive ? "true" : "false");
          btn.tabIndex = isActive ? 0 : -1;
        }
        const def = tabs.find((t) => t.key === key);
        def?.render();
      };
      for (const tab of tabs) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "wp-desktop-os-settings__tab";
        btn.setAttribute("role", "tab");
        btn.textContent = tab.label;
        btn.addEventListener("click", () => activateTab(tab.key));
        tabButtons.set(tab.key, btn);
        tabList.appendChild(btn);
      }
      if (tabs.length > 1) {
        wrap.appendChild(tabList);
      }
      wrap.appendChild(pane);
      activateTab(activeTab);
      return wrap;
    }
    renderUploadPane(pane, body) {
      pane.innerHTML = "";
      const tile = document.createElement("div");
      tile.className = "wp-desktop-os-settings__upload-tile";
      tile.dataset.wallpaperId = CUSTOM_IMAGE_ID;
      tile.setAttribute(
        "aria-pressed",
        this.state.wallpaper === CUSTOM_IMAGE_ID ? "true" : "false"
      );
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/*";
      fileInput.className = "wp-desktop-os-settings__file-input";
      fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        if (file) {
          void this.handleImageFile(file, tile, body);
        }
        fileInput.value = "";
      });
      pane.appendChild(fileInput);
      this.renderUploadTile(tile, fileInput, body);
      pane.appendChild(tile);
    }
    renderLibraryPane(pane, body) {
      pane.innerHTML = "";
      const library = document.createElement("div");
      library.className = "wp-desktop-os-settings__library";
      const toolbar = document.createElement("div");
      toolbar.className = "wp-desktop-os-settings__library-toolbar";
      const search = document.createElement("input");
      search.type = "search";
      search.placeholder = __("Search your media");
      search.className = "wp-desktop-os-settings__library-search";
      search.setAttribute("aria-label", __("Search media"));
      toolbar.appendChild(search);
      const hdWrap = document.createElement("label");
      hdWrap.className = "wp-desktop-os-settings__library-hd";
      const hdInput = document.createElement("input");
      hdInput.type = "checkbox";
      hdInput.checked = this.state.libraryHdOnly;
      hdWrap.appendChild(hdInput);
      const hdLabel = document.createElement("span");
      hdLabel.textContent = sprintf(
        // translators: %1$d is the HD minimum width in px, %2$d is the minimum height.
        __("Only HD (≥%1$d×%2$d)"),
        HD_MIN_WIDTH,
        HD_MIN_HEIGHT
      );
      hdWrap.appendChild(hdLabel);
      toolbar.appendChild(hdWrap);
      library.appendChild(toolbar);
      const grid = document.createElement("div");
      grid.className = "wp-desktop-os-settings__library-grid";
      library.appendChild(grid);
      const footer = document.createElement("div");
      footer.className = "wp-desktop-os-settings__library-footer";
      const meta = document.createElement("span");
      meta.className = "wp-desktop-os-settings__library-meta";
      footer.appendChild(meta);
      const loadMore = document.createElement("button");
      loadMore.type = "button";
      loadMore.className = "wp-desktop-os-settings__library-load-more";
      loadMore.textContent = __("Load more");
      footer.appendChild(loadMore);
      library.appendChild(footer);
      pane.appendChild(library);
      let query = "";
      let page = 0;
      let totalPages = 0;
      let loaded = [];
      let hiddenByHd = 0;
      let loading = false;
      const updateMeta = () => {
        const visible = this.visibleLibraryItems(loaded).length;
        const parts = [
          // translators: %d is the number of media items currently visible.
          sprintf(__("Showing %d"), visible)
        ];
        if (this.state.libraryHdOnly && hiddenByHd > 0) {
          parts.push(
            // translators: %d is the number of images filtered out by the HD toggle.
            sprintf(__("%d hidden by HD filter"), hiddenByHd)
          );
        }
        meta.textContent = parts.join(" · ");
        loadMore.hidden = page >= totalPages;
        loadMore.disabled = loading;
      };
      const renderGrid = () => {
        grid.innerHTML = "";
        const visible = this.visibleLibraryItems(loaded);
        hiddenByHd = loaded.length - visible.length;
        if (visible.length === 0 && !loading) {
          const empty = document.createElement("p");
          empty.className = "wp-desktop-os-settings__library-empty";
          if (this.state.libraryHdOnly) {
            empty.textContent = __(
              "No HD images found. Try unchecking the filter, or upload a larger image."
            );
          } else {
            empty.textContent = __("No images in your Media Library yet.");
          }
          grid.appendChild(empty);
        } else {
          for (const item of visible) {
            grid.appendChild(this.buildLibraryTile(item, body));
          }
        }
        updateMeta();
      };
      const loadNextPage = async () => {
        if (loading || totalPages > 0 && page >= totalPages) {
          return;
        }
        loading = true;
        updateMeta();
        if (page === 0) {
          grid.innerHTML = "";
          for (let i = 0; i < 8; i++) {
            const sk = document.createElement("div");
            sk.className = "wp-desktop-os-settings__library-tile wp-desktop-os-settings__library-tile--skeleton";
            grid.appendChild(sk);
          }
        }
        try {
          const result = await this.fetchMediaPage(page + 1, query);
          page = page + 1;
          totalPages = result.totalPages;
          loaded = loaded.concat(result.items);
          renderGrid();
        } catch (err) {
          grid.innerHTML = "";
          const errMsg = document.createElement("p");
          errMsg.className = "wp-desktop-os-settings__library-error";
          if (err instanceof Error) {
            errMsg.textContent = sprintf(
              // translators: %s is the browser-supplied error message.
              __("Couldn’t load your media: %s"),
              err.message
            );
          } else {
            errMsg.textContent = __("Couldn’t load your media.");
          }
          grid.appendChild(errMsg);
        } finally {
          loading = false;
          updateMeta();
        }
      };
      const resetAndReload = () => {
        page = 0;
        totalPages = 0;
        loaded = [];
        hiddenByHd = 0;
        void loadNextPage();
      };
      let searchTimer = null;
      search.addEventListener("input", () => {
        if (searchTimer !== null) {
          window.clearTimeout(searchTimer);
        }
        searchTimer = window.setTimeout(() => {
          searchTimer = null;
          query = search.value.trim();
          resetAndReload();
        }, SEARCH_DEBOUNCE_MS);
      });
      hdInput.addEventListener("change", () => {
        this.state.libraryHdOnly = hdInput.checked;
        this.save();
        resetAndReload();
      });
      loadMore.addEventListener("click", () => {
        void loadNextPage();
      });
      void loadNextPage();
    }
    visibleLibraryItems(items) {
      if (!this.state.libraryHdOnly) {
        return items;
      }
      return items.filter(
        (it) => it.media_details.width >= HD_MIN_WIDTH && it.media_details.height >= HD_MIN_HEIGHT
      );
    }
    buildLibraryTile(item, body) {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "wp-desktop-os-settings__library-tile";
      tile.dataset.mediaId = String(item.id);
      const isSelected = this.state.wallpaper === CUSTOM_IMAGE_ID && this.state.customImage?.id === item.id;
      tile.setAttribute("aria-pressed", isSelected ? "true" : "false");
      if (isSelected) {
        tile.classList.add("wp-desktop-os-settings__library-tile--selected");
      }
      const sizes = item.media_details.sizes || {};
      const thumbUrl = sizes.medium?.source_url || sizes.thumbnail?.source_url || sizes.large?.source_url || item.source_url;
      tile.style.backgroundImage = `url("${encodeURI(thumbUrl)}")`;
      const dims = document.createElement("span");
      dims.className = "wp-desktop-os-settings__library-tile-dims";
      dims.textContent = `${item.media_details.width}×${item.media_details.height}`;
      tile.appendChild(dims);
      const altOrTitle = item.alt_text || stripHtml(item.title?.rendered || "") || `Image #${item.id}`;
      tile.setAttribute("aria-label", altOrTitle);
      tile.title = altOrTitle;
      tile.addEventListener("click", () => {
        this.state.customImage = { id: item.id, url: item.source_url };
        this.state.wallpaper = CUSTOM_IMAGE_ID;
        this.registerCustomImageIfPresent();
        this.save();
        this.apply();
        this.refreshWallpaperPressedState(body);
        const grid = tile.parentElement;
        if (grid) {
          grid.querySelectorAll("[data-media-id]").forEach((el) => {
            const selected = el.dataset.mediaId === String(item.id);
            el.setAttribute("aria-pressed", selected ? "true" : "false");
            el.classList.toggle(
              "wp-desktop-os-settings__library-tile--selected",
              selected
            );
          });
        }
      });
      return tile;
    }
    async fetchMediaPage(page, search) {
      const url = new URL(this.config.mediaUrl);
      url.searchParams.set("media_type", "image");
      url.searchParams.set("per_page", String(MEDIA_PER_PAGE));
      url.searchParams.set("page", String(page));
      url.searchParams.set("orderby", "date");
      url.searchParams.set("order", "desc");
      url.searchParams.set(
        "_fields",
        "id,source_url,alt_text,title,media_details"
      );
      if (search) {
        url.searchParams.set("search", search);
      }
      if (this.state.libraryHdOnly) {
        url.searchParams.set("wpdm_min_width", String(HD_MIN_WIDTH));
        url.searchParams.set("wpdm_min_height", String(HD_MIN_HEIGHT));
      }
      const response = await fetch(url.toString(), {
        credentials: "same-origin",
        headers: { "X-WP-Nonce": this.config.restNonce }
      });
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const data = await response.json();
          if (data && typeof data.message === "string") {
            message = data.message;
          }
        } catch {
        }
        throw new Error(message);
      }
      const totalPagesHeader = response.headers.get("X-WP-TotalPages");
      const totalPages = totalPagesHeader ? parseInt(totalPagesHeader, 10) : 1;
      const items = await response.json();
      return { items: items.filter(isUsableImage), totalPages: totalPages || 1 };
    }
    renderUploadTile(tile, fileInput, body) {
      tile.innerHTML = "";
      tile.classList.remove("wp-desktop-os-settings__upload-tile--filled");
      tile.classList.remove("wp-desktop-os-settings__upload-tile--dragover");
      tile.classList.remove("wp-desktop-os-settings__upload-tile--busy");
      tile.removeAttribute("aria-label");
      if (this.state.customImage) {
        tile.classList.add("wp-desktop-os-settings__upload-tile--filled");
        tile.setAttribute("aria-label", __("Custom image wallpaper"));
        tile.style.backgroundImage = `url("${encodeURI(this.state.customImage.url)}")`;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "wp-desktop-os-settings__upload-remove";
        remove.setAttribute("aria-label", __("Remove custom image"));
        remove.textContent = __("Remove");
        remove.addEventListener("click", (e) => {
          e.stopPropagation();
          this.state.customImage = null;
          if (this.state.wallpaper === CUSTOM_IMAGE_ID) {
            this.state.wallpaper = DEFAULT_WALLPAPER_ID;
          }
          this.registerCustomImageIfPresent();
          this.save();
          this.apply();
          this.renderUploadTile(tile, fileInput, body);
          this.refreshWallpaperPressedState(body);
        });
        tile.appendChild(remove);
      } else {
        tile.style.backgroundImage = "";
        const inner = document.createElement("div");
        inner.className = "wp-desktop-os-settings__upload-inner";
        const plus = document.createElement("span");
        plus.className = "wp-desktop-os-settings__upload-plus";
        plus.setAttribute("aria-hidden", "true");
        plus.textContent = "+";
        const prompt = document.createElement("span");
        prompt.className = "wp-desktop-os-settings__upload-prompt";
        prompt.textContent = __("Drop an image here, or click to upload");
        const hint = document.createElement("span");
        hint.className = "wp-desktop-os-settings__upload-hint";
        hint.textContent = __(
          "JPEG, PNG, or WebP · goes straight to your Media Library"
        );
        inner.appendChild(plus);
        inner.appendChild(prompt);
        inner.appendChild(hint);
        tile.appendChild(inner);
        tile.setAttribute("aria-label", __("Upload a wallpaper image"));
      }
      tile.onclick = () => {
        if (tile.classList.contains("wp-desktop-os-settings__upload-tile--busy")) {
          return;
        }
        if (this.state.customImage) {
          this.selectWallpaper(CUSTOM_IMAGE_ID, body);
          return;
        }
        fileInput.click();
      };
      tile.ondragover = (e) => {
        e.preventDefault();
        tile.classList.add("wp-desktop-os-settings__upload-tile--dragover");
      };
      tile.ondragleave = () => {
        tile.classList.remove("wp-desktop-os-settings__upload-tile--dragover");
      };
      tile.ondrop = (e) => {
        e.preventDefault();
        tile.classList.remove("wp-desktop-os-settings__upload-tile--dragover");
        const file = e.dataTransfer?.files?.[0];
        if (file) {
          void this.handleImageFile(file, tile, body);
        }
      };
    }
    async handleImageFile(file, tile, body) {
      if (!file.type.startsWith("image/")) {
        this.showUploadError(tile, __("That file isn’t an image."));
        return;
      }
      tile.classList.add("wp-desktop-os-settings__upload-tile--busy");
      const prevInner = tile.innerHTML;
      tile.innerHTML = "";
      const status = document.createElement("span");
      status.className = "wp-desktop-os-settings__upload-status";
      status.textContent = __("Uploading…");
      tile.appendChild(status);
      try {
        const media = await this.uploadImage(file);
        this.state.customImage = { id: media.id, url: media.url };
        this.state.wallpaper = CUSTOM_IMAGE_ID;
        this.registerCustomImageIfPresent();
        this.save();
        this.apply();
        const fileInput = tile.parentElement?.querySelector(
          ".wp-desktop-os-settings__file-input"
        );
        if (fileInput) {
          this.renderUploadTile(tile, fileInput, body);
        }
        this.refreshWallpaperPressedState(body);
      } catch (err) {
        tile.innerHTML = prevInner;
        tile.classList.remove("wp-desktop-os-settings__upload-tile--busy");
        const message = err instanceof Error ? err.message : __("Upload failed.");
        this.showUploadError(tile, message);
      }
    }
    showUploadError(tile, message) {
      let err = tile.querySelector(".wp-desktop-os-settings__upload-error");
      if (!err) {
        err = document.createElement("span");
        err.className = "wp-desktop-os-settings__upload-error";
        err.setAttribute("role", "status");
        tile.appendChild(err);
      }
      err.textContent = message;
      window.setTimeout(() => {
        err?.remove();
      }, 4e3);
    }
    async uploadImage(file) {
      const response = await fetch(this.config.mediaUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "X-WP-Nonce": this.config.restNonce,
          "Content-Type": file.type,
          "Content-Disposition": `attachment; filename="${sanitizeFilename(file.name)}"`
        },
        body: file
      });
      if (!response.ok) {
        let message = `Upload failed (HTTP ${response.status}).`;
        try {
          const data2 = await response.json();
          if (data2 && typeof data2.message === "string") {
            message = data2.message;
          }
        } catch {
        }
        throw new Error(message);
      }
      const data = await response.json();
      return { id: data.id, url: data.source_url };
    }
    // ------------------------------------------------------------------
    // Accent + dock-size sections (unchanged)
    // ------------------------------------------------------------------
    buildAccentSection() {
      const section = this.buildSection(
        __("Accent color"),
        __("Used in focused window title bars, buttons, and focus rings.")
      );
      const grid = document.createElement("div");
      grid.className = "wp-desktop-os-settings__grid wp-desktop-os-settings__grid--accents";
      for (const accent of ACCENTS) {
        const label = translateAccentLabel(accent.id, accent.label);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "wp-desktop-os-settings__swatch wp-desktop-os-settings__swatch--accent";
        btn.setAttribute("aria-label", label);
        btn.setAttribute(
          "aria-pressed",
          this.state.accent === accent.id ? "true" : "false"
        );
        btn.dataset.id = accent.id;
        btn.style.background = accent.value;
        btn.title = label;
        btn.addEventListener("click", () => {
          this.state.accent = accent.id;
          this.save();
          this.apply();
          this.refreshSelected(grid, accent.id);
        });
        grid.appendChild(btn);
      }
      section.appendChild(grid);
      return section;
    }
    buildDockSizeSection() {
      const section = this.buildSection(
        __("Dock size"),
        __("Width of the dock and size of its icons.")
      );
      const group = document.createElement("div");
      group.className = "wp-desktop-os-settings__segmented";
      group.setAttribute("role", "radiogroup");
      for (const size of DOCK_SIZES) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "wp-desktop-os-settings__segment";
        btn.setAttribute("role", "radio");
        btn.setAttribute(
          "aria-checked",
          this.state.dockSize === size.id ? "true" : "false"
        );
        btn.dataset.id = size.id;
        btn.textContent = translateDockSizeLabel(size.id, size.label);
        btn.addEventListener("click", () => {
          this.state.dockSize = size.id;
          this.save();
          this.apply();
          this.refreshSelected(group, size.id, "aria-checked");
        });
        group.appendChild(btn);
      }
      section.appendChild(group);
      return section;
    }
    buildSection(title, description) {
      const section = document.createElement("section");
      section.className = "wp-desktop-os-settings__section";
      const heading = document.createElement("h3");
      heading.className = "wp-desktop-os-settings__heading";
      heading.textContent = title;
      section.appendChild(heading);
      const desc = document.createElement("p");
      desc.className = "wp-desktop-os-settings__desc";
      desc.textContent = description;
      section.appendChild(desc);
      return section;
    }
    refreshSelected(container, id, attr = "aria-pressed") {
      container.querySelectorAll("[data-id]").forEach((el) => {
        el.setAttribute(attr, el.dataset.id === id ? "true" : "false");
      });
    }
    // ------------------------------------------------------------------
    // Persistence
    // ------------------------------------------------------------------
    load() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY$1);
        if (!raw) {
          return structuredDefaults();
        }
        const parsed = JSON.parse(raw);
        return {
          // `wallpaper` is now any non-empty string — registry
          // membership is validated at apply time rather than
          // here, so a plugin that gets enqueued late still
          // delivers its persisted selection.
          wallpaper: typeof parsed.wallpaper === "string" && parsed.wallpaper !== "" ? parsed.wallpaper : DEFAULTS.wallpaper,
          accent: ACCENTS.some((a) => a.id === parsed.accent) ? parsed.accent : DEFAULTS.accent,
          dockSize: DOCK_SIZES.some((d) => d.id === parsed.dockSize) ? parsed.dockSize : DEFAULTS.dockSize,
          customGradient: sanitizeCustomGradient(parsed.customGradient),
          customImage: sanitizeCustomImage(parsed.customImage),
          libraryHdOnly: typeof parsed.libraryHdOnly === "boolean" ? parsed.libraryHdOnly : DEFAULTS.libraryHdOnly
        };
      } catch {
        return structuredDefaults();
      }
    }
    save() {
      try {
        window.localStorage.setItem(STORAGE_KEY$1, JSON.stringify(this.state));
      } catch {
      }
    }
  }
  function structuredDefaults() {
    return {
      ...DEFAULTS,
      customGradient: { ...DEFAULTS.customGradient },
      customImage: null
    };
  }
  function sanitizeCustomGradient(raw) {
    if (!raw || typeof raw !== "object") {
      return { ...DEFAULTS.customGradient };
    }
    const { from, to, angle } = raw;
    return {
      from: isHexColor(from) ? from : DEFAULTS.customGradient.from,
      to: isHexColor(to) ? to : DEFAULTS.customGradient.to,
      angle: typeof angle === "number" && Number.isFinite(angle) && angle >= 0 && angle <= 360 ? angle : DEFAULTS.customGradient.angle
    };
  }
  function sanitizeCustomImage(raw) {
    if (!raw || typeof raw !== "object") {
      return null;
    }
    const { id, url } = raw;
    if (typeof id !== "number" || !Number.isFinite(id) || id <= 0) {
      return null;
    }
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      return null;
    }
    return { id, url };
  }
  function isHexColor(value) {
    return typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value);
  }
  function sanitizeFilename(name) {
    const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    return cleaned || "wallpaper";
  }
  function isUsableImage(item) {
    if (!item || typeof item.id !== "number" || !item.source_url) {
      return false;
    }
    const d = item.media_details;
    return !!d && typeof d.width === "number" && typeof d.height === "number" && d.width > 0 && d.height > 0;
  }
  function stripHtml(html) {
    if (!html) {
      return "";
    }
    const el = document.createElement("div");
    el.innerHTML = html;
    return el.textContent?.trim() || "";
  }
  function isPromise(value) {
    return !!value && typeof value === "object" && typeof value.then === "function";
  }
  const pending = /* @__PURE__ */ new Map();
  function loadVendorScript(url) {
    const existing = pending.get(url);
    if (existing) {
      return existing;
    }
    const promise = new Promise((resolve, reject) => {
      const selector = `script[data-wp-desktop-vendor="${cssEscape(url)}"]`;
      const preexisting = document.querySelector(selector);
      if (preexisting) {
        if (preexisting.dataset.loaded === "1") {
          resolve();
          return;
        }
        preexisting.addEventListener("load", () => resolve(), { once: true });
        preexisting.addEventListener(
          "error",
          () => reject(new Error(`Failed to load ${url}`)),
          { once: true }
        );
        return;
      }
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.dataset.wpDesktopVendor = url;
      script.addEventListener(
        "load",
        () => {
          script.dataset.loaded = "1";
          resolve();
        },
        { once: true }
      );
      script.addEventListener(
        "error",
        () => {
          pending.delete(url);
          script.remove();
          reject(new Error(`Failed to load ${url}`));
        },
        { once: true }
      );
      document.head.appendChild(script);
    });
    pending.set(url, promise);
    return promise;
  }
  function cssEscape(value) {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(value);
    }
    return value.replace(/["\\]/g, "\\$&");
  }
  const registry = /* @__PURE__ */ new Map();
  function registerModule(def) {
    if (!def || typeof def.id !== "string" || def.id === "") {
      if (typeof console !== "undefined") {
        console.warn("[wp-desktop-mode] Ignored invalid module registration:", def);
      }
      return;
    }
    if (typeof def.url !== "string" || def.url === "") {
      if (typeof console !== "undefined") {
        console.warn(
          `[wp-desktop-mode] Module "${def.id}" has no url; ignored.`
        );
      }
      return;
    }
    registry.set(def.id, def);
  }
  function moduleIds() {
    return Array.from(registry.keys());
  }
  async function loadModules(ids) {
    if (!ids || ids.length === 0) {
      return;
    }
    const unknown = ids.filter((id) => !registry.has(id));
    if (unknown.length > 0) {
      throw new Error(
        `[wp-desktop-mode] Unknown module(s) in needs: ${unknown.map((id) => `"${id}"`).join(", ")}. Known modules: ${moduleIds().join(", ") || "(none)"}.`
      );
    }
    await Promise.all(
      ids.map((id) => {
        const def = registry.get(id);
        if (!def) {
          return Promise.resolve();
        }
        if (def.isReady && def.isReady()) {
          return Promise.resolve();
        }
        return loadVendorScript(def.url);
      })
    );
  }
  function createContext(id, pluginUrl) {
    return {
      id,
      pluginUrl,
      prefersReducedMotion: prefersReducedMotion(),
      visible: !document.hidden
    };
  }
  function prefersReducedMotion() {
    if (typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia("( prefers-reduced-motion: reduce )").matches;
  }
  class WallpaperLayer {
    constructor(element, pluginUrl) {
      this.generation = 0;
      this.active = null;
      this.boundVisibilityChange = () => {
        if (!this.active) {
          return;
        }
        doAction(HOOKS.WALLPAPER_VISIBILITY, {
          id: this.active.id,
          state: document.hidden ? "hidden" : "visible"
        });
      };
      this.element = element;
      this.pluginUrl = pluginUrl;
      document.addEventListener("visibilitychange", this.boundVisibilityChange);
    }
    /**
     * Apply a wallpaper definition. Safe to call from any event
     * handler — handles type dispatch, teardown of the prior active
     * canvas, and race-safe async mounts.
     */
    apply(def) {
      const gen = ++this.generation;
      this.teardownActive();
      if (def.type === "css") {
        this.applyCss(def);
        return;
      }
      this.applyCanvas(def, gen);
    }
    /**
     * Imperative teardown entry point — called from desktop.ts on
     * `pagehide` so a canvas wallpaper's ticker doesn't compete with
     * the session-beacon flush at unload.
     */
    teardownActive() {
      if (!this.active) {
        return;
      }
      const { id, teardown } = this.active;
      this.active = null;
      doAction(HOOKS.WALLPAPER_UNMOUNTING, { id });
      try {
        teardown();
      } catch (err) {
        if (typeof console !== "undefined") {
          console.error(
            `[wp-desktop-mode] Wallpaper "${id}" teardown threw:`,
            err
          );
        }
      }
      this.element.innerHTML = "";
    }
    /** Remove listeners. Not called in normal flow — reserved for tests. */
    dispose() {
      this.teardownActive();
      document.removeEventListener("visibilitychange", this.boundVisibilityChange);
    }
    applyCss(def) {
      const value = def.resolveValue ? def.resolveValue(createContext(def.id, this.pluginUrl)) : def.value;
      if (typeof value === "string") {
        this.element.style.setProperty("--wp-desktop-bg", value);
        const shell = document.getElementById("wp-desktop-shell");
        shell?.style.setProperty("--wp-desktop-bg", value);
      }
    }
    applyCanvas(def, gen) {
      const ctx = createContext(def.id, this.pluginUrl);
      doAction(HOOKS.WALLPAPER_MOUNTING, { id: def.id, container: this.element, ctx });
      const depsReady = def.needs && def.needs.length > 0 ? loadModules(def.needs) : Promise.resolve();
      const onResolve = (teardown) => {
        if (gen !== this.generation) {
          try {
            teardown();
          } catch {
          }
          return;
        }
        this.active = { id: def.id, teardown };
        doAction(HOOKS.WALLPAPER_MOUNTED, { id: def.id, container: this.element, ctx });
      };
      depsReady.then(
        () => {
          if (gen !== this.generation) {
            return;
          }
          let result;
          try {
            result = def.mount(this.element, ctx);
          } catch (err) {
            this.handleMountFailure(def.id, err);
            return;
          }
          if (isThenable$1(result)) {
            result.then(onResolve, (err) => {
              if (gen !== this.generation) {
                return;
              }
              this.handleMountFailure(def.id, err);
            });
            return;
          }
          onResolve(result);
        },
        (err) => {
          if (gen !== this.generation) {
            return;
          }
          this.handleMountFailure(def.id, err);
        }
      );
    }
    handleMountFailure(id, err) {
      this.element.innerHTML = "";
      doAction(HOOKS.WALLPAPER_MOUNT_FAILED, { id, error: err });
      if (typeof console !== "undefined") {
        console.error(
          `[wp-desktop-mode] Wallpaper "${id}" failed to mount:`,
          err
        );
      }
    }
  }
  function isThenable$1(value) {
    return !!value && typeof value === "object" && typeof value.then === "function";
  }
  const PRESETS = [
    {
      id: "dark",
      label: "Graphite",
      value: "linear-gradient(135deg, #1d2327 0%, #2c3338 50%, #1d2327 100%)"
    },
    {
      id: "aurora",
      label: "Aurora",
      value: "linear-gradient(135deg, #1a2980 0%, #26d0ce 100%)"
    },
    {
      id: "sunset",
      label: "Sunset",
      value: "linear-gradient(135deg, #ff512f 0%, #dd2476 100%)"
    },
    {
      id: "forest",
      label: "Forest",
      value: "linear-gradient(135deg, #134e5e 0%, #71b280 100%)"
    },
    {
      id: "mono",
      label: "Mono",
      value: "#1d2327"
    }
  ];
  function registerBuiltInWallpapers() {
    for (const p of PRESETS) {
      register$1({
        id: p.id,
        label: translatePresetLabel(p.id, p.label),
        type: "css",
        value: p.value,
        preview: p.value
      });
    }
  }
  function translatePresetLabel(id, fallback) {
    switch (id) {
      case "dark":
        return __("Graphite");
      case "aurora":
        return __("Aurora");
      case "sunset":
        return __("Sunset");
      case "forest":
        return __("Forest");
      case "mono":
        return __("Mono");
      default:
        return fallback;
    }
  }
  const seed = [];
  function register(def) {
    if (!isValidDef(def)) {
      if (typeof console !== "undefined") {
        console.warn(
          "[wp-desktop-mode] Ignored invalid widget registration:",
          def
        );
      }
      return;
    }
    const idx = seed.findIndex((w) => w.id === def.id);
    if (idx >= 0) {
      seed[idx] = def;
    } else {
      seed.push(def);
    }
  }
  function all() {
    const copy = seed.slice();
    const filtered = applyFilters(HOOKS.WIDGETS, copy);
    if (!Array.isArray(filtered)) {
      if (typeof console !== "undefined") {
        console.warn(
          "[wp-desktop-mode] `wp-desktop.widgets` filter returned a non-array; falling back to seed list."
        );
      }
      return copy;
    }
    return filtered.filter(isValidDef);
  }
  function get(id) {
    return all().find((w) => w.id === id);
  }
  function isValidDef(def) {
    if (!def || typeof def !== "object") {
      return false;
    }
    const d = def;
    if (typeof d.id !== "string" || d.id === "") {
      return false;
    }
    if (typeof d.label !== "string" || d.label === "") {
      return false;
    }
    if (typeof d.description !== "string") {
      return false;
    }
    if (typeof d.icon !== "string" || d.icon === "") {
      return false;
    }
    return typeof d.mount === "function";
  }
  let active = null;
  function openWidgetPicker(options) {
    if (active) {
      return;
    }
    const panel = document.createElement("div");
    panel.className = "wp-desktop-widget-picker";
    panel.setAttribute("role", "menu");
    panel.setAttribute("aria-label", __("Add widget"));
    const title = document.createElement("div");
    title.className = "wp-desktop-widget-picker__title";
    title.textContent = __("Add widget");
    panel.appendChild(title);
    const list = document.createElement("div");
    list.className = "wp-desktop-widget-picker__list";
    panel.appendChild(list);
    paintList(list, options);
    document.body.appendChild(panel);
    positionPanel(panel, options.anchor);
    const onOutsidePointerDown = (e) => {
      const target = e.target;
      if (!target) {
        return;
      }
      if (panel.contains(target) || options.anchor.contains(target)) {
        return;
      }
      closeWidgetPicker();
    };
    window.setTimeout(() => {
      document.addEventListener("pointerdown", onOutsidePointerDown, true);
    }, 0);
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        closeWidgetPicker();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    active = { panel, options, onOutsidePointerDown, onKeyDown };
    const first = list.querySelector(
      "button:not([disabled])"
    );
    first?.focus();
  }
  function refreshWidgetPicker() {
    if (!active) {
      return;
    }
    const list = active.panel.querySelector(
      ".wp-desktop-widget-picker__list"
    );
    if (list) {
      paintList(list, active.options);
    }
  }
  function closeWidgetPicker() {
    if (!active) {
      return;
    }
    document.removeEventListener(
      "pointerdown",
      active.onOutsidePointerDown,
      true
    );
    document.removeEventListener("keydown", active.onKeyDown);
    active.panel.remove();
    active = null;
  }
  function paintList(list, options) {
    list.innerHTML = "";
    const enabled = new Set(options.enabledIds());
    const defs = options.registry();
    if (defs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "wp-desktop-widget-picker__empty";
      empty.textContent = __(
        "No widgets available. Activate a plugin that registers one, or see the docs for the registerWidget API."
      );
      list.appendChild(empty);
      return;
    }
    for (const def of defs) {
      const entry = document.createElement("button");
      entry.type = "button";
      entry.className = "wp-desktop-widget-picker__entry";
      const isAdded = enabled.has(def.id);
      if (isAdded) {
        entry.classList.add(
          "wp-desktop-widget-picker__entry--added"
        );
        entry.disabled = true;
        entry.setAttribute("aria-disabled", "true");
      }
      entry.setAttribute("role", "menuitem");
      let ariaLabel;
      if (isAdded) {
        ariaLabel = sprintf(__("%s (already added)"), def.label);
      } else {
        ariaLabel = sprintf(__("Add %s"), def.label);
      }
      entry.setAttribute("aria-label", ariaLabel);
      const icon = document.createElement("span");
      icon.className = `wp-desktop-widget-picker__entry-icon dashicons ${def.icon}`;
      icon.setAttribute("aria-hidden", "true");
      entry.appendChild(icon);
      const textWrap = document.createElement("span");
      textWrap.className = "wp-desktop-widget-picker__entry-text";
      const label = document.createElement("span");
      label.className = "wp-desktop-widget-picker__entry-label";
      label.textContent = def.label;
      textWrap.appendChild(label);
      if (def.description) {
        const desc = document.createElement("span");
        desc.className = "wp-desktop-widget-picker__entry-description";
        desc.textContent = def.description;
        textWrap.appendChild(desc);
      }
      entry.appendChild(textWrap);
      if (isAdded) {
        const status = document.createElement("span");
        status.className = "wp-desktop-widget-picker__entry-status";
        status.textContent = __("Added");
        entry.appendChild(status);
      }
      if (!isAdded) {
        entry.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          options.onAdd(def.id);
        });
      }
      list.appendChild(entry);
    }
  }
  function positionPanel(panel, anchor) {
    const rect = anchor.getBoundingClientRect();
    panel.style.position = "fixed";
    panel.style.left = "0px";
    panel.style.top = "0px";
    panel.style.visibility = "hidden";
    const panelRect = panel.getBoundingClientRect();
    const width = panelRect.width || 320;
    const height = panelRect.height || 200;
    const gap = 6;
    let left = rect.right - width;
    let top = rect.top - height - gap;
    if (left < 8) {
      left = 8;
    }
    if (top < 8) {
      top = rect.bottom + gap;
    }
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    panel.style.visibility = "";
  }
  const STORAGE_KEY = "wp-desktop-widgets";
  const DEFAULT_ENABLED_IDS = ["clock"];
  class WidgetLayer {
    constructor(root, pluginUrl) {
      this.mounted = /* @__PURE__ */ new Map();
      this.generation = 0;
      this.root = root;
      this.pluginUrl = pluginUrl;
      this.enabledIds = loadEnabledIds();
      this.listEl = document.createElement("div");
      this.listEl.className = "wp-desktop-widgets__list";
      this.root.appendChild(this.listEl);
      this.addTile = document.createElement("button");
      this.addTile.type = "button";
      this.addTile.className = "wp-desktop-widgets__add";
      this.addTile.setAttribute("aria-label", __("Add widget"));
      const addPlus = document.createElement("span");
      addPlus.className = "wp-desktop-widgets__add-plus";
      addPlus.setAttribute("aria-hidden", "true");
      addPlus.textContent = "+";
      const addLabel = document.createElement("span");
      addLabel.className = "wp-desktop-widgets__add-label";
      addLabel.textContent = __("Add widget");
      this.addTile.appendChild(addPlus);
      this.addTile.appendChild(addLabel);
      this.addTile.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openWidgetPicker({
          anchor: this.addTile,
          registry: () => all(),
          enabledIds: () => [...this.enabledIds],
          onAdd: (id) => this.add(id)
        });
      });
      this.root.appendChild(this.addTile);
      this.paintEmptyState();
    }
    /**
     * Mount every widget the user has enabled (per localStorage).
     * Called once during shell boot, AFTER the registry seed has run
     * so built-ins are available. Safe to call multiple times — the
     * `mounted` map dedupes.
     */
    hydrate() {
      if (readRawStored() === null) {
        this.enabledIds = DEFAULT_ENABLED_IDS.filter(
          (id) => !!get(id)
        );
        saveEnabledIds(this.enabledIds);
      }
      for (const id of this.enabledIds) {
        if (this.mounted.has(id)) {
          continue;
        }
        this.mountById(id);
      }
      this.paintEmptyState();
    }
    /**
     * Add a widget by id — called by the picker after the user
     * selects an available entry. Idempotent: adding an already-
     * enabled widget is a no-op.
     */
    add(id) {
      if (this.enabledIds.includes(id)) {
        return;
      }
      if (!get(id)) {
        return;
      }
      this.enabledIds.push(id);
      saveEnabledIds(this.enabledIds);
      this.mountById(id);
      this.paintEmptyState();
      doAction(HOOKS.WIDGET_ADDED, { id });
      refreshWidgetPicker();
    }
    /**
     * Remove a widget by id — called from the card's × button and
     * also from the picker if that's wired later. Idempotent.
     */
    remove(id) {
      const before = this.enabledIds.length;
      this.enabledIds = this.enabledIds.filter((e) => e !== id);
      if (this.enabledIds.length === before) {
        return;
      }
      saveEnabledIds(this.enabledIds);
      this.unmountById(id);
      this.paintEmptyState();
      doAction(HOOKS.WIDGET_REMOVED, { id });
      refreshWidgetPicker();
    }
    /** Public read for the picker / external callers. */
    getEnabledIds() {
      return [...this.enabledIds];
    }
    /**
     * Tear down every widget. Called on shell unload via `pagehide`
     * so intervals / RAF loops stop before the beacon flush.
     */
    disposeAll() {
      for (const id of Array.from(this.mounted.keys())) {
        this.unmountById(id);
      }
    }
    // --- Internal ---------------------------------------------------
    mountById(id) {
      const def = get(id);
      if (!def) {
        return;
      }
      const gen = ++this.generation;
      const card = this.buildCard(def);
      const body = card.querySelector(
        ".wp-desktop-widgets__card-body"
      );
      const record = {
        id,
        card,
        body,
        generation: gen,
        teardown: null
      };
      this.mounted.set(id, record);
      this.listEl.appendChild(card);
      const ctx = { id, pluginUrl: this.pluginUrl };
      doAction(HOOKS.WIDGET_MOUNTING, { id, container: body, ctx });
      const onResolve = (teardown) => {
        const current = this.mounted.get(id);
        if (!current || current.generation !== gen) {
          try {
            teardown();
          } catch {
          }
          return;
        }
        current.teardown = teardown;
        doAction(HOOKS.WIDGET_MOUNTED, { id, container: body, ctx });
      };
      let result;
      try {
        result = def.mount(body, ctx);
      } catch (err) {
        this.handleMountFailure(id, err);
        return;
      }
      if (isThenable(result)) {
        result.then(onResolve, (err) => {
          if (this.mounted.get(id)?.generation === gen) {
            this.handleMountFailure(id, err);
          }
        });
        return;
      }
      onResolve(result);
    }
    unmountById(id) {
      const record = this.mounted.get(id);
      if (!record) {
        return;
      }
      doAction(HOOKS.WIDGET_UNMOUNTING, { id });
      try {
        record.teardown?.();
      } catch (err) {
        if (typeof console !== "undefined") {
          console.error(
            `[wp-desktop-mode] Widget "${id}" teardown threw:`,
            err
          );
        }
      }
      this.generation++;
      record.card.remove();
      this.mounted.delete(id);
    }
    handleMountFailure(id, err) {
      const record = this.mounted.get(id);
      if (record) {
        record.card.remove();
        this.mounted.delete(id);
      }
      doAction(HOOKS.WIDGET_MOUNT_FAILED, { id, error: err });
      if (typeof console !== "undefined") {
        console.error(
          `[wp-desktop-mode] Widget "${id}" failed to mount:`,
          err
        );
      }
    }
    buildCard(def) {
      const card = document.createElement("div");
      card.className = "wp-desktop-widgets__card";
      card.dataset.widgetId = def.id;
      const close = document.createElement("button");
      close.type = "button";
      close.className = "wp-desktop-widgets__card-close";
      close.setAttribute("aria-label", sprintf(__("Remove %s"), def.label));
      close.innerHTML = '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
      close.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.remove(def.id);
      });
      card.appendChild(close);
      const body = document.createElement("div");
      body.className = "wp-desktop-widgets__card-body";
      card.appendChild(body);
      return card;
    }
    /**
     * Toggle a `--has-widgets` modifier so CSS can hide the column's
     * decorative backdrop when nothing's mounted (keeps the empty
     * state clean — just the `+` tile floating in the corner).
     */
    paintEmptyState() {
      this.root.classList.toggle(
        "wp-desktop-widgets--has-widgets",
        this.mounted.size > 0
      );
    }
  }
  function isThenable(x) {
    return !!x && (typeof x === "object" || typeof x === "function") && typeof x.then === "function";
  }
  function readRawStored() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }
  function loadEnabledIds() {
    const raw = readRawStored();
    if (raw === null) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter((x) => typeof x === "string");
    } catch {
      return [];
    }
  }
  function saveEnabledIds(ids) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {
    }
  }
  const clock = {
    id: "clock",
    // Labels/descriptions on built-in defs stay string-literal at
    // module-eval time so the extract-pot pass picks them up. The
    // values are wrapped in `__()` so they translate at runtime.
    get label() {
      return __("Clock");
    },
    get description() {
      return __("Local time and date, refreshed every second.");
    },
    icon: "dashicons-clock",
    mount: (container) => {
      container.classList.add("wp-desktop-widget-clock");
      const time = document.createElement("div");
      time.className = "wp-desktop-widget-clock__time";
      container.appendChild(time);
      const date = document.createElement("div");
      date.className = "wp-desktop-widget-clock__date";
      container.appendChild(date);
      const render = () => {
        const now = /* @__PURE__ */ new Date();
        time.textContent = now.toLocaleTimeString(void 0, {
          hour: "2-digit",
          minute: "2-digit"
        });
        date.textContent = now.toLocaleDateString(void 0, {
          weekday: "long",
          month: "short",
          day: "numeric"
        });
      };
      render();
      const msUntilNextSecond = 1e3 - Date.now() % 1e3;
      let interval = null;
      const kickoff = window.setTimeout(() => {
        render();
        interval = window.setInterval(render, 1e3);
      }, msUntilNextSecond);
      return () => {
        window.clearTimeout(kickoff);
        if (interval !== null) {
          window.clearInterval(interval);
        }
      };
    }
  };
  function registerBuiltInWidgets() {
    register(clock);
  }
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
    targetLogoWidth: 1e3,
    /** Fraction of the smaller shell dimension the logo is allowed to occupy. */
    logoShellFraction: 0.72,
    /**
     * Spring stiffness — how hard a particle pulls back to its home.
     * Lower = slower, floatier return. At 0.015 the natural-frequency
     * period is ~50 frames (~0.85 s at 60 fps), so particles visibly
     * drift back after a cursor flick rather than snapping home.
     */
    springK: 0.015,
    /** Velocity damping per tick. 1 = no damping, 0 = instant stop. */
    damping: 0.86,
    /**
     * Velocity floor below which a particle is considered at rest —
     * its position snaps to its home and its velocity zeroes out. Kills
     * the subpixel jitter that made the resting logo flicker.
     */
    restVelocityEpsilon: 0.02,
    /**
     * Sand-drag brush radius in CSS pixels. Particles within this
     * distance of the cursor pick up a fraction of the cursor's
     * per-frame displacement — they're carried in the direction the
     * cursor is moving, not pushed away from its position. Beyond
     * the radius the cursor has no effect.
     */
    dragRadius: 150,
    /**
     * Base fraction of the cursor's per-frame displacement that a
     * particle inherits when it's at the dead center of the brush.
     * At 0.22 a particle in the brush core picks up roughly a
     * quarter of the cursor's velocity per frame — enough to read
     * as "dragged" without the particles chasing the cursor.
     */
    dragStrength: 0.22,
    /**
     * Super-linear speed boost. For every {@link dragBoostRefSpeed}
     * pixels-per-frame of cursor speed, the applied drag force is
     * additionally scaled by this factor. Kept gentle (0.3) so fast
     * flicks feel a bit punchier than linear without flinging
     * particles across the screen.
     */
    dragBoost: 0.3,
    /** Reference cursor speed for the boost curve (CSS px / frame). */
    dragBoostRefSpeed: 40,
    /**
     * Cap on the mouse delta a single frame can accumulate. Prevents
     * a wild delta from a stale pointer (e.g. first pointermove after
     * the cursor entered from offscreen) from launching particles
     * into orbit. A real fast mouse rarely exceeds 80 px/frame.
     */
    maxMouseDelta: 80,
    /**
     * Radial-gradient brush texture size. Larger = smoother edges at
     * the cost of texture memory. 128px is plenty — sprites scale
     * down to 10–30 px range for rendering so we have headroom.
     */
    brushSize: 128,
    /** Min/max sprite scale relative to the brush texture size. */
    spriteScaleMin: 0.1,
    spriteScaleMax: 0.26,
    /** Min/max per-particle alpha. */
    spriteAlphaMin: 0.55,
    spriteAlphaMax: 0.92
  };
  const PARTICLE_PALETTE = [
    // Rainbow six (higher weight — the flag's main body).
    16726843,
    16726843,
    // red
    16747562,
    16747562,
    // orange
    16767293,
    16767293,
    // yellow
    5036388,
    5036388,
    // green
    4104447,
    4104447,
    // blue
    11037695,
    11037695,
    // purple
    // Trans flag stripes.
    16757703,
    // pink
    8380415,
    // light blue
    16777215,
    // white
    // POC inclusion stripe.
    13140042
    // warm brown (boosted for visibility under additive)
  ];
  const BACKDROP_CSS = "radial-gradient(circle at 50% 50%, #1e40af 0%, #152a6b 45%, #0a1024 100%)";
  async function mountScene({ container, logoUrl, prefersReducedMotion: prefersReducedMotion2 }) {
    const pixi = window.PIXI;
    if (!pixi) {
      throw new Error(
        "[animated-logo-wallpaper] window.PIXI is undefined; declare `needs: ['pixijs']` on the wallpaper def so the shell loads it before mount."
      );
    }
    const homes = await sampleLogoHomes(logoUrl);
    const priorBackground = container.style.background;
    container.style.background = BACKDROP_CSS;
    const app = new pixi.Application();
    await app.init({
      resizeTo: container,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2)
    });
    container.appendChild(app.canvas);
    applyCanvasLayout(app.canvas);
    const brushTexture = buildBrushTexture(pixi);
    const particleLayer = new pixi.Container();
    app.stage.addChild(particleLayer);
    const n = homes.length;
    const homeX = new Float32Array(n);
    const homeY = new Float32Array(n);
    const x = new Float32Array(n);
    const y = new Float32Array(n);
    const vx = new Float32Array(n);
    const vy = new Float32Array(n);
    const sprites = new Array(n);
    for (let i = 0; i < n; i++) {
      const sprite = new pixi.Sprite(brushTexture);
      sprite.anchor.set(0.5);
      sprite.blendMode = "add";
      sprite.tint = PARTICLE_PALETTE[Math.floor(Math.random() * PARTICLE_PALETTE.length)];
      const scale = CONFIG.spriteScaleMin + Math.random() * (CONFIG.spriteScaleMax - CONFIG.spriteScaleMin);
      sprite.scale.set(scale);
      sprite.alpha = CONFIG.spriteAlphaMin + Math.random() * (CONFIG.spriteAlphaMax - CONFIG.spriteAlphaMin);
      particleLayer.addChild(sprite);
      sprites[i] = sprite;
    }
    let logoScale = 1;
    let logoOffsetX = 0;
    let logoOffsetY = 0;
    const computeLayout = () => {
      const w = app.canvas.clientWidth;
      const h = app.canvas.clientHeight;
      const target = Math.min(
        CONFIG.targetLogoWidth,
        Math.min(w, h) * CONFIG.logoShellFraction
      );
      logoScale = target;
      logoOffsetX = (w - target) / 2;
      logoOffsetY = (h - target) / 2;
      for (let i = 0; i < n; i++) {
        homeX[i] = logoOffsetX + homes[i][0] * logoScale;
        homeY[i] = logoOffsetY + homes[i][1] * logoScale;
        if (x[i] === 0 && y[i] === 0) {
          x[i] = homeX[i];
          y[i] = homeY[i];
        }
      }
    };
    computeLayout();
    const resizeObserver = new ResizeObserver(() => computeLayout());
    resizeObserver.observe(container);
    let pointerX = -1e6;
    let pointerY = -1e6;
    let pointerActive = false;
    let mouseDx = 0;
    let mouseDy = 0;
    const onPointerMove = (e) => {
      const rect = app.canvas.getBoundingClientRect();
      const nx = e.clientX - rect.left;
      const ny = e.clientY - rect.top;
      if (pointerActive) {
        const rawDx = nx - pointerX;
        const rawDy = ny - pointerY;
        const cap = CONFIG.maxMouseDelta;
        mouseDx += Math.max(-cap, Math.min(cap, rawDx));
        mouseDy += Math.max(-cap, Math.min(cap, rawDy));
      }
      pointerX = nx;
      pointerY = ny;
      pointerActive = true;
    };
    const onPointerLeave = () => {
      pointerX = -1e6;
      pointerY = -1e6;
      pointerActive = false;
      mouseDx = 0;
      mouseDy = 0;
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
    let animating = !prefersReducedMotion2;
    const syncSprites = () => {
      for (let i = 0; i < n; i++) {
        sprites[i].x = x[i];
        sprites[i].y = y[i];
      }
    };
    const tick = () => {
      if (animating) {
        step(
          n,
          homeX,
          homeY,
          x,
          y,
          vx,
          vy,
          pointerX,
          pointerY,
          pointerActive ? mouseDx : 0,
          pointerActive ? mouseDy : 0
        );
      }
      mouseDx = 0;
      mouseDy = 0;
      syncSprites();
    };
    app.ticker.add(tick);
    syncSprites();
    if (!animating) {
      app.renderer.render(app.stage);
      app.ticker.stop();
    }
    return {
      destroy() {
        resizeObserver.disconnect();
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerleave", onPointerLeave);
        app.destroy(true, {
          children: true,
          texture: true,
          textureSource: true,
          context: true
        });
        try {
          brushTexture.destroy(true);
        } catch {
        }
        container.style.background = priorBackground;
      },
      setAnimating(playing) {
        animating = playing && !prefersReducedMotion2;
        if (animating) {
          app.ticker.start();
        } else {
          app.ticker.stop();
        }
      }
    };
  }
  function step(n, homeX, homeY, x, y, vx, vy, pointerX, pointerY, mouseDx, mouseDy) {
    const {
      springK,
      damping,
      dragRadius,
      dragStrength,
      dragBoost,
      dragBoostRefSpeed,
      restVelocityEpsilon
    } = CONFIG;
    const dragRadiusSq = dragRadius * dragRadius;
    const restEpsSq = restVelocityEpsilon * restVelocityEpsilon;
    const restPosEps = 0.25;
    const restPosEpsSq = restPosEps * restPosEps;
    const mouseSpeed = Math.sqrt(mouseDx * mouseDx + mouseDy * mouseDy);
    const speedMultiplier = 1 + mouseSpeed / dragBoostRefSpeed * dragBoost;
    const dragFx = mouseDx * dragStrength * speedMultiplier;
    const dragFy = mouseDy * dragStrength * speedMultiplier;
    const cursorMoving = mouseDx !== 0 || mouseDy !== 0;
    for (let i = 0; i < n; i++) {
      const dhx = homeX[i] - x[i];
      const dhy = homeY[i] - y[i];
      let fx = dhx * springK;
      let fy = dhy * springK;
      const dx = x[i] - pointerX;
      const dy = y[i] - pointerY;
      const distSq = dx * dx + dy * dy;
      let disturbed = false;
      if (cursorMoving && distSq < dragRadiusSq) {
        const t = 1 - Math.sqrt(distSq) / dragRadius;
        const falloff = t * t;
        fx += dragFx * falloff;
        fy += dragFy * falloff;
        disturbed = true;
      }
      const nvx = (vx[i] + fx) * damping;
      const nvy = (vy[i] + fy) * damping;
      if (!disturbed && nvx * nvx + nvy * nvy < restEpsSq && dhx * dhx + dhy * dhy < restPosEpsSq) {
        x[i] = homeX[i];
        y[i] = homeY[i];
        vx[i] = 0;
        vy[i] = 0;
        continue;
      }
      vx[i] = nvx;
      vy[i] = nvy;
      x[i] += nvx;
      y[i] += nvy;
    }
  }
  function buildBrushTexture(pixi) {
    const size = CONFIG.brushSize;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("[animated-logo-wallpaper] 2D canvas context unavailable.");
    }
    const center = size / 2;
    const gradient = ctx.createRadialGradient(
      center,
      center,
      0,
      center,
      center,
      center
    );
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.18, "rgba(255, 255, 255, 0.85)");
    gradient.addColorStop(0.42, "rgba(255, 255, 255, 0.28)");
    gradient.addColorStop(0.75, "rgba(255, 255, 255, 0.06)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return pixi.Texture.from(canvas);
  }
  async function sampleLogoHomes(url) {
    const img = await loadImage(url);
    const maxSide = 400;
    const ratio = img.naturalWidth / img.naturalHeight;
    const sampleWidth = ratio >= 1 ? maxSide : Math.round(maxSide * ratio);
    const sampleHeight = ratio >= 1 ? Math.round(maxSide / ratio) : maxSide;
    const off = document.createElement("canvas");
    off.width = sampleWidth;
    off.height = sampleHeight;
    const ctx = off.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return [];
    }
    ctx.drawImage(img, 0, 0, sampleWidth, sampleHeight);
    const data = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
    const homes = [];
    const stride = CONFIG.sampleStride;
    const threshold = CONFIG.alphaThreshold;
    for (let row = 0; row < sampleHeight; row += stride) {
      const rowOffset = row / stride % 2 === 0 ? 0 : stride / 2;
      for (let col = 0; col < sampleWidth; col += stride) {
        const px = Math.min(sampleWidth - 1, Math.round(col + rowOffset));
        const py = row;
        const alpha = data[(py * sampleWidth + px) * 4 + 3];
        if (alpha > threshold) {
          homes.push([px / sampleWidth, py / sampleHeight]);
        }
      }
    }
    return homes;
  }
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load logo: ${url}`));
      img.src = url;
    });
  }
  function applyCanvasLayout(canvas) {
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
  }
  const WALLPAPER_ID = "wp-animated-logo";
  const NAMESPACE = "wp-desktop-mode/animated-logo";
  const PREVIEW = "radial-gradient(circle at 50% 50%, #1e3a8a 0%, #0b0f25 100%)";
  addAction(
    HOOKS.INIT,
    NAMESPACE,
    () => {
      const api = window.wp?.desktop;
      if (!api || typeof api.registerWallpaper !== "function") {
        return;
      }
      api.registerWallpaper({
        id: WALLPAPER_ID,
        label: "Animated WordPress Logo",
        type: "canvas",
        preview: PREVIEW,
        needs: ["pixijs"],
        mount: async (container, ctx) => {
          const logoUrl = `${ctx.pluginUrl}/assets/images/wp-logo.png`;
          const scene = await mountScene({
            container,
            logoUrl,
            prefersReducedMotion: ctx.prefersReducedMotion
          });
          const visibilityHandler = (...args) => {
            const detail = args[0];
            if (!detail || detail.id !== WALLPAPER_ID) {
              return;
            }
            scene.setAnimating(detail.state === "visible");
          };
          api.hooks.addAction(
            HOOKS.WALLPAPER_VISIBILITY,
            `${NAMESPACE}/visibility`,
            visibilityHandler
          );
          return () => {
            api.hooks.removeAction(
              HOOKS.WALLPAPER_VISIBILITY,
              `${NAMESPACE}/visibility`
            );
            scene.destroy();
          };
        }
      });
    }
  );
  const OS_SETTINGS_WINDOW_ID = "wp-desktop-os-settings";
  const SESSION_SAVE_DEBOUNCE_MS = 500;
  const VIEWPORT_CLAMP_MARGIN = 12;
  function init() {
    const config = window.wpDesktopConfig;
    if (!config) {
      return;
    }
    const desktopArea = document.getElementById("wp-desktop-area");
    if (!desktopArea) {
      return;
    }
    const manager = new WindowManager(desktopArea);
    const wallpaperEl = document.getElementById("wp-desktop-wallpaper");
    const pluginUrl = config.pluginUrl || "";
    let wallpaperLayer = null;
    if (wallpaperEl) {
      wallpaperLayer = new WallpaperLayer(wallpaperEl, pluginUrl);
    }
    registerBuiltInWallpapers();
    const widgetsEl = document.getElementById("wp-desktop-widgets");
    let widgetLayer = null;
    registerBuiltInWidgets();
    if (widgetsEl) {
      widgetLayer = new WidgetLayer(widgetsEl, pluginUrl);
    }
    registerModule({
      id: "pixijs",
      url: `${pluginUrl}/assets/vendor/pixi.min.js`,
      isReady: () => typeof window.PIXI !== "undefined"
    });
    const osSettings = new OsSettings(
      {
        mediaUrl: config.mediaUrl,
        restNonce: config.restNonce,
        canUpload: !!config.canUpload
      },
      wallpaperLayer ?? new WallpaperLayer(document.createElement("div"), pluginUrl)
    );
    osSettings.apply();
    const dockEl = document.getElementById("wp-desktop-dock");
    let dock = null;
    if (dockEl && config.dockItems) {
      dock = new Dock(dockEl, manager, config.dockItems, config.adminUrl);
      desktopArea.classList.add("wp-desktop-area--with-dock");
      dock.appendSystemItem({
        id: OS_SETTINGS_WINDOW_ID,
        title: "OS Settings",
        icon: "dashicons-desktop",
        isOpen: () => !!manager.getById(OS_SETTINGS_WINDOW_ID),
        onOpen: () => {
          manager.open({
            id: OS_SETTINGS_WINDOW_ID,
            baseId: OS_SETTINGS_WINDOW_ID,
            url: "#os-settings",
            title: "OS Settings",
            icon: "dashicons-desktop",
            native: true,
            render: (body) => osSettings.renderPanel(body),
            // Sized to comfortably fit three wallpaper swatches
            // across plus the media-library grid showing 5–6
            // thumbnails per row — smaller defaults forced the
            // sections into a single narrow column.
            width: 820,
            height: 720,
            minWidth: 560,
            minHeight: 480
          });
        }
      });
    }
    const hasSession = !!(config.session && config.session.windows && config.session.windows.length > 0);
    if (hasSession) {
      restoreSession(manager, config, desktopArea);
    }
    const defaultEnabled = config.defaultWindow?.enabled !== false;
    const suppressAutoOpen = config.fromPortal && (hasSession || !defaultEnabled);
    if (!suppressAutoOpen) {
      openCurrentPage(manager, config);
    }
    const saveSession = createSessionSaver(manager, config);
    wireSessionEvents(saveSession);
    const setDefaultWindow = async (url) => {
      try {
        const response = await fetch(config.defaultWindowUrl, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-WP-Nonce": config.restNonce
          },
          body: JSON.stringify({ url })
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        config.defaultWindow = data;
        document.dispatchEvent(
          new CustomEvent("wp-desktop-default-window-changed", {
            detail: data
          })
        );
      } catch (err) {
        if (typeof console !== "undefined") {
          console.error(
            "[wp-desktop-mode] Failed to save default window:",
            err
          );
        }
      }
    };
    manager.onToggleStartupRequested = (win) => {
      const currentPref = config.defaultWindow;
      const winUrl = win.getCurrentUrl();
      const alreadyDefault = !!currentPref?.enabled && urlMatchKey(currentPref.url) === urlMatchKey(winUrl);
      void setDefaultWindow(alreadyDefault ? null : winUrl);
    };
    window.wp = window.wp || {};
    window.wp.desktop = {
      windowManager: manager,
      dock,
      saveSession,
      hooks: rawHooks(),
      registerWallpaper: (def) => {
        register$1(def);
        osSettings.apply();
      },
      registerWidget: (def) => {
        register(def);
      },
      loadVendorScript,
      registerModule,
      loadModules,
      whenReady,
      setDefaultWindow,
      config
    };
    doAction(HOOKS.INIT, { config });
    osSettings.apply();
    widgetLayer?.hydrate();
    window.addEventListener("pagehide", () => {
      wallpaperLayer?.teardownActive();
      widgetLayer?.disposeAll();
    });
    bindShellLifecycle();
    bindTopWindowLinkInterceptor(manager, config);
    desktopArea.addEventListener("click", (e) => {
      if (e.target !== desktopArea) {
        return;
      }
      if (desktopArea.classList.contains("wp-desktop-area--overview")) {
        return;
      }
      const windows = manager.getAll();
      const allMinimized = windows.length > 0 && windows.every((w) => w.state === "minimized");
      if (allMinimized) {
        for (const win of windows) {
          win.restore();
        }
      } else {
        for (const win of windows) {
          if (win.state !== "minimized") {
            win.minimize();
          }
        }
      }
    });
    document.dispatchEvent(
      new CustomEvent("wp-desktop-init", {
        detail: { config, restored: hasSession }
      })
    );
  }
  function restoreSession(manager, config, desktopArea) {
    const rect = desktopArea.getBoundingClientRect();
    if (Array.isArray(config.session.desktops) && config.session.desktops.length > 0) {
      manager.seedDesktops(
        config.session.desktops,
        config.session.activeDesktop || config.session.desktops[0].id
      );
    }
    for (const win of config.session.windows) {
      const clamped = clampGeometryToViewport(win, rect);
      const dockEntry = findDockEntryForUrl(win.url, config);
      const opened = manager.open({
        id: win.id,
        baseId: win.baseId || win.id,
        desktopId: win.desktopId,
        multi: !!dockEntry?.multi,
        url: win.url,
        title: win.title,
        icon: win.icon || "dashicons-admin-generic",
        x: clamped.x,
        y: clamped.y,
        width: clamped.width,
        height: clamped.height,
        initialState: win.state,
        submenu: dockEntry?.submenu
      });
      if (Array.isArray(win.externalTabs)) {
        for (const ext of win.externalTabs) {
          if (ext && typeof ext.url === "string" && ext.url !== "") {
            opened.addExternalTab(
              ext.url,
              typeof ext.label === "string" && ext.label !== "" ? ext.label : ext.url
            );
          }
        }
      }
    }
    if (config.session.focused) {
      const focused = manager.getById(config.session.focused);
      if (focused) {
        manager.focus(focused);
      }
    }
  }
  function openCurrentPage(manager, config) {
    const windowId = deriveWindowId(config.currentPage, config.adminUrl);
    const dockEntry = findDockEntryForUrl(config.currentPage, config);
    manager.open({
      id: windowId,
      baseId: windowId,
      multi: !!dockEntry?.multi,
      url: config.currentPage,
      title: config.currentTitle,
      icon: config.currentIcon,
      submenu: dockEntry?.submenu
    });
  }
  function bindTopWindowLinkInterceptor(manager, config) {
    document.addEventListener(
      "click",
      (e) => {
        if (e.defaultPrevented) {
          return;
        }
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
          return;
        }
        const target = e.target;
        const link = target && target.closest ? target.closest("a[href]") : null;
        if (!link) {
          return;
        }
        const anchor = link;
        const linkTarget = anchor.getAttribute("target");
        if (linkTarget && linkTarget !== "" && linkTarget !== "_self") {
          return;
        }
        if (anchor.hasAttribute("download")) {
          return;
        }
        const rawHref = anchor.getAttribute("href");
        if (!rawHref || rawHref.charAt(0) === "#") {
          return;
        }
        if (/^(mailto:|tel:|javascript:|data:)/i.test(rawHref)) {
          return;
        }
        let url;
        try {
          url = new URL(rawHref, window.location.href);
        } catch {
          return;
        }
        if (url.origin !== window.location.origin) {
          return;
        }
        let adminPath;
        try {
          adminPath = new URL(config.adminUrl).pathname;
        } catch {
          adminPath = "/wp-admin/";
        }
        if (!url.pathname.startsWith(adminPath)) {
          return;
        }
        if (/\/(admin-post|admin-ajax)\.php$/.test(url.pathname)) {
          return;
        }
        if (url.searchParams.has("action") && url.searchParams.get("action") === "logout") {
          return;
        }
        if (url.searchParams.has("wp_desktop_classic")) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        const windowId = deriveWindowId(url.href, config.adminUrl);
        const dockEntry = findDockEntryForUrl(url.href, config);
        const fallbackTitle = (anchor.textContent || "").trim() || dockEntry?.title || "";
        manager.open({
          id: windowId,
          baseId: windowId,
          multi: !!dockEntry?.multi,
          url: url.href,
          title: dockEntry?.title || fallbackTitle,
          icon: dockEntry?.icon || "dashicons-admin-generic",
          submenu: dockEntry?.submenu
        });
      },
      true
    );
  }
  function findDockEntryForUrl(url, config) {
    const windowId = deriveWindowId(url, config.adminUrl);
    return (config.dockItems || []).find(
      (i) => deriveWindowId(i.url, config.adminUrl) === windowId || (i.submenu || []).some(
        (s) => deriveWindowId(s.url, config.adminUrl) === windowId
      )
    );
  }
  function clampGeometryToViewport(win, rect) {
    const maxW = Math.max(200, rect.width - VIEWPORT_CLAMP_MARGIN * 2);
    const maxH = Math.max(200, rect.height - VIEWPORT_CLAMP_MARGIN * 2);
    const width = Math.min(win.width, maxW);
    const height = Math.min(win.height, maxH);
    const maxX = Math.max(0, rect.width - width - VIEWPORT_CLAMP_MARGIN);
    const maxY = Math.max(0, rect.height - height - VIEWPORT_CLAMP_MARGIN);
    const x = Math.max(VIEWPORT_CLAMP_MARGIN, Math.min(win.x, maxX));
    const y = Math.max(VIEWPORT_CLAMP_MARGIN, Math.min(win.y, maxY));
    return { x, y, width, height };
  }
  function createSessionSaver(manager, config) {
    let debounceTimer = null;
    let inFlight = false;
    const doSave = async () => {
      if (inFlight) {
        return;
      }
      const payload = manager.snapshot();
      inFlight = true;
      try {
        await fetch(config.sessionUrl, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-WP-Nonce": config.restNonce
          },
          body: JSON.stringify({ session: payload }),
          // Best-effort: we don't block the UI on persistence.
          keepalive: true
        });
      } catch {
      } finally {
        inFlight = false;
      }
    };
    const flushImmediately = () => {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      const payload = manager.snapshot();
      const body = new Blob(
        [JSON.stringify({ session: payload })],
        { type: "application/json" }
      );
      const beaconUrl = config.sessionUrl + (config.sessionUrl.includes("?") ? "&" : "?") + "_wpnonce=" + encodeURIComponent(config.restNonce);
      if (navigator.sendBeacon && navigator.sendBeacon(beaconUrl, body)) {
        return;
      }
      void doSave();
    };
    const schedule = () => {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null;
        void doSave();
      }, SESSION_SAVE_DEBOUNCE_MS);
    };
    window.addEventListener("pagehide", flushImmediately);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        flushImmediately();
      }
    });
    return schedule;
  }
  function wireSessionEvents(save) {
    document.addEventListener("wp-desktop-window-opened", save);
    document.addEventListener("wp-desktop-window-closed", save);
    document.addEventListener("wp-desktop-window-focused", save);
    document.addEventListener("wp-desktop-window-changed", save);
  }
  const SHELL_RESIZE_DEBOUNCE_MS = 120;
  function bindShellLifecycle() {
    const shellEl = document.getElementById("wp-desktop-shell");
    let resizeTimer = null;
    const fireShellResize = () => {
      resizeTimer = null;
      const rect = shellEl ? shellEl.getBoundingClientRect() : null;
      doAction(HOOKS.SHELL_RESIZED, {
        width: rect ? Math.round(rect.width) : window.innerWidth,
        height: rect ? Math.round(rect.height) : window.innerHeight
      });
    };
    window.addEventListener("resize", () => {
      if (resizeTimer !== null) {
        window.clearTimeout(resizeTimer);
      }
      resizeTimer = window.setTimeout(fireShellResize, SHELL_RESIZE_DEBOUNCE_MS);
    });
    document.addEventListener("visibilitychange", () => {
      doAction(HOOKS.SHELL_VISIBILITY, {
        state: document.hidden ? "hidden" : "visible"
      });
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  exports.clampGeometryToViewport = clampGeometryToViewport;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  return exports;
}({});
