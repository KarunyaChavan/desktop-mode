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
  const EDGE_MARGIN = 8;
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
      menuBtn.setAttribute("aria-label", "Window actions");
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
      startup.innerHTML = '<span class="wp-desktop-window__menu-check" aria-hidden="true"></span><span class="wp-desktop-window__menu-label">Open on startup</span>';
      menuPanel.appendChild(startup);
      if (config.multi) {
        const openAnother = document.createElement("button");
        openAnother.type = "button";
        openAnother.className = "wp-desktop-window__menu-item wp-desktop-window__menu-item--open-another";
        openAnother.setAttribute("role", "menuitem");
        openAnother.innerHTML = `<span class="wp-desktop-window__menu-icon dashicons dashicons-plus-alt2" aria-hidden="true"></span><span class="wp-desktop-window__menu-label">Open another ${config.title}</span>`;
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
      "Minimize",
      '<path d="M3 6h6" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>'
    );
    const btnMax = createControlButton(
      "maximize",
      "Maximize",
      '<rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.25" fill="none"/>'
    );
    const btnFocus = createControlButton(
      "focus",
      "Enter fullscreen",
      '<path d="M4.5 2H2v2.5M10 4.5V2H7.5M4.5 10H2V7.5M10 7.5V10H7.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
    );
    const btnDetach = createControlButton(
      "detach",
      "Detach to new tab",
      '<path d="M5 2H2.5v7.5H10V7M6.5 2H10v3.5M10 2L5.5 6.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
    );
    const btnClose = createControlButton(
      "close",
      "Close",
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
    if (config.submenu && config.submenu.length > 0) {
      const tabs = document.createElement("nav");
      tabs.className = "wp-desktop-window__tabs";
      tabs.setAttribute("role", "tablist");
      tabs.setAttribute("aria-label", `${config.title} sub-pages`);
      const initialKey = urlMatchKey(config.url);
      for (const sub of config.submenu) {
        const tab = document.createElement("button");
        tab.className = "wp-desktop-window__tab";
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
      this.onFocusRequest = null;
      this.onClose = null;
      this.onMinimize = null;
      this.onOpenAnother = null;
      this.onToggleStartup = null;
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
            const target = e.target.closest(".wp-desktop-window__tab");
            if (!target || !target.dataset.url) {
              return;
            }
            e.stopPropagation();
            const next = withChromelessParam(target.dataset.url);
            if (next) {
              iframe.src = next;
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
     */
    syncActiveTab(currentUrl) {
      const tabs = this.element.querySelectorAll(".wp-desktop-window__tab");
      if (!tabs.length) {
        return;
      }
      const activeKey = urlMatchKey(currentUrl);
      for (const tab of tabs) {
        const tabUrl = tab.dataset.url;
        const isActive = !!tabUrl && urlMatchKey(tabUrl) === activeKey;
        tab.classList.toggle("wp-desktop-window__tab--active", isActive);
        tab.setAttribute("aria-selected", isActive ? "true" : "false");
      }
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
        "help": { icon: "dashicons-editor-help", label: "Help" }
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
        return;
      }
      this.isDragging = true;
      this.dragOffsetX = e.clientX - this.element.offsetLeft;
      this.dragOffsetY = e.clientY - this.element.offsetTop;
      this.titleBar.setPointerCapture(e.pointerId);
      this.element.classList.add("wp-desktop-window--dragging");
      doAction(HOOKS.WINDOW_DRAG_START, { windowId: this.id });
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
        this.element.style.left = `${x}px`;
        this.element.style.top = `${y}px`;
      };
      const onDragEnd = () => {
        if (!this.isDragging) {
          return;
        }
        this.isDragging = false;
        this.element.classList.remove("wp-desktop-window--dragging");
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
        this.element.classList.remove("wp-desktop-window--resizing");
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
          this.element.style.left = `${this.savedGeometry.x}px`;
          this.element.style.top = `${this.savedGeometry.y}px`;
          this.element.style.width = `${this.savedGeometry.width}px`;
          this.element.style.height = `${this.savedGeometry.height}px`;
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
        isFullscreen ? "Exit fullscreen" : "Enter fullscreen"
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
  }
  const BASE_Z_INDEX = 100;
  const CASCADE_OFFSET = 30;
  class WindowManager {
    constructor(desktop) {
      this.stack = [];
      this.cascadeIndex = 0;
      this.onToggleStartupRequested = null;
      this.desktop = desktop;
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
        baseId: config.baseId || config.id
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
      this.stack.push(win);
      this.desktop.appendChild(win.element);
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
        return {
          id: w.id,
          baseId: w.config.baseId || w.id,
          url: w.getCurrentUrl(),
          title: w.config.title,
          icon: w.config.icon,
          state: snap.state,
          x: snap.x,
          y: snap.y,
          width: snap.width,
          height: snap.height
        };
      });
      const focusedId = focused && !focused.config.native ? focused.id : "";
      return {
        windows,
        focused: focusedId,
        updated: Math.floor(Date.now() / 1e3)
      };
    }
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
        badge.setAttribute("aria-label", `${item.badge} updates`);
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
        addBtn.setAttribute("aria-label", `Open another ${item.title}`);
        addBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M6 2v8M2 6h8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>';
        addBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.openNewInstance(item);
        });
        addBtn.addEventListener("pointerenter", () => {
          const rect = addBtn.getBoundingClientRect();
          this.tooltip.textContent = `Open new ${item.title}`;
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
     */
    bindWindowEvents() {
      document.addEventListener("wp-desktop-window-opened", (e) => {
        this.updateActiveStates();
      });
      document.addEventListener("wp-desktop-window-closed", (e) => {
        this.updateActiveStates();
      });
      document.addEventListener("wp-desktop-window-focused", (e) => {
        this.updateActiveStates();
      });
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
  const seed = [];
  function register(def) {
    if (!isValidDef(def)) {
      if (typeof console !== "undefined") {
        console.warn(
          "[wp-desktop-mode] Ignored invalid wallpaper registration:",
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
  function unregister(id) {
    const idx = seed.findIndex((w) => w.id === id);
    if (idx >= 0) {
      seed.splice(idx, 1);
    }
  }
  function all() {
    const copy = seed.slice();
    const filtered = applyFilters(HOOKS.WALLPAPERS, copy);
    if (!Array.isArray(filtered)) {
      if (typeof console !== "undefined") {
        console.warn(
          "[wp-desktop-mode] `wp-desktop.wallpapers` filter returned a non-array; falling back to seed list."
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
  const STORAGE_KEY = "wp-desktop-os-settings";
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
      const def = get(this.state.wallpaper) || get(DEFAULT_WALLPAPER_ID) || all()[0];
      if (def) {
        this.layer.apply(def);
      }
      const accent = ACCENTS.find((a) => a.id === this.state.accent) ?? ACCENTS[0];
      const dockSize = DOCK_SIZES.find((d) => d.id === this.state.dockSize) ?? DOCK_SIZES[1];
      shell.style.setProperty("--wp-admin-theme-color", accent.value);
      shell.style.setProperty("--wp-desktop-dock-width", `${dockSize.width}px`);
      shell.style.setProperty("--wp-desktop-dock-icon-size", `${dockSize.icon}px`);
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
      intro.textContent = "Personalize your desktop. Changes apply instantly and are saved to this browser.";
      body.appendChild(intro);
      body.appendChild(this.buildWallpaperSection(body));
      body.appendChild(this.buildAccentSection());
      body.appendChild(this.buildDockSizeSection());
      const footer = document.createElement("div");
      footer.className = "wp-desktop-os-settings__footer";
      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "wp-desktop-os-settings__reset";
      reset.textContent = "Reset to defaults";
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
      register({
        id: CUSTOM_GRADIENT_ID,
        label: "Custom gradient",
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
      register({
        id: CUSTOM_IMAGE_ID,
        label: "Custom image",
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
        "Wallpaper",
        "The backdrop behind your windows. Pick a preset, mix your own gradient, or drop in an image."
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
      for (const def of all()) {
        if (def.id === CUSTOM_IMAGE_ID) {
          continue;
        }
        grid.appendChild(this.buildWallpaperSwatch(def, () => onSelect(def)));
      }
      section.appendChild(grid);
      const active = get(this.state.wallpaper);
      if (active) {
        this.syncEditorSlot(editorSlot, editorInner, active);
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
        buildColorField("From", this.state.customGradient.from, (value) => {
          this.state.customGradient.from = value;
          onGradientChange();
        })
      );
      row.appendChild(
        buildColorField("To", this.state.customGradient.to, (value) => {
          this.state.customGradient.to = value;
          onGradientChange();
        })
      );
      container.appendChild(row);
      const angleField = document.createElement("label");
      angleField.className = "wp-desktop-os-settings__gradient-angle";
      const angleLabel = document.createElement("span");
      angleLabel.className = "wp-desktop-os-settings__gradient-label";
      angleLabel.textContent = "Angle";
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
      heading.textContent = "Or use your own image";
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
          label: "Upload new",
          render: () => this.renderUploadPane(pane, body)
        });
      }
      tabs.push({
        key: "library",
        label: "Media Library",
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
      search.placeholder = "Search your media";
      search.className = "wp-desktop-os-settings__library-search";
      search.setAttribute("aria-label", "Search media");
      toolbar.appendChild(search);
      const hdWrap = document.createElement("label");
      hdWrap.className = "wp-desktop-os-settings__library-hd";
      const hdInput = document.createElement("input");
      hdInput.type = "checkbox";
      hdInput.checked = this.state.libraryHdOnly;
      hdWrap.appendChild(hdInput);
      const hdLabel = document.createElement("span");
      hdLabel.textContent = `Only HD (≥${HD_MIN_WIDTH}×${HD_MIN_HEIGHT})`;
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
      loadMore.textContent = "Load more";
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
        const parts = [`Showing ${visible}`];
        if (this.state.libraryHdOnly && hiddenByHd > 0) {
          parts.push(`${hiddenByHd} hidden by HD filter`);
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
          empty.textContent = this.state.libraryHdOnly ? "No HD images found. Try unchecking the filter, or upload a larger image." : "No images in your Media Library yet.";
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
          errMsg.textContent = err instanceof Error ? `Couldn’t load your media: ${err.message}` : "Couldn’t load your media.";
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
        tile.setAttribute("aria-label", "Custom image wallpaper");
        tile.style.backgroundImage = `url("${encodeURI(this.state.customImage.url)}")`;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "wp-desktop-os-settings__upload-remove";
        remove.setAttribute("aria-label", "Remove custom image");
        remove.textContent = "Remove";
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
        inner.innerHTML = `
				<span class="wp-desktop-os-settings__upload-plus" aria-hidden="true">+</span>
				<span class="wp-desktop-os-settings__upload-prompt">Drop an image here, or click to upload</span>
				<span class="wp-desktop-os-settings__upload-hint">JPEG, PNG, or WebP · goes straight to your Media Library</span>
			`;
        tile.appendChild(inner);
        tile.setAttribute("aria-label", "Upload a wallpaper image");
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
        this.showUploadError(tile, "That file isn’t an image.");
        return;
      }
      tile.classList.add("wp-desktop-os-settings__upload-tile--busy");
      const prevInner = tile.innerHTML;
      tile.innerHTML = '<span class="wp-desktop-os-settings__upload-status">Uploading…</span>';
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
        const message = err instanceof Error ? err.message : "Upload failed.";
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
        "Accent color",
        "Used in focused window title bars, buttons, and focus rings."
      );
      const grid = document.createElement("div");
      grid.className = "wp-desktop-os-settings__grid wp-desktop-os-settings__grid--accents";
      for (const accent of ACCENTS) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "wp-desktop-os-settings__swatch wp-desktop-os-settings__swatch--accent";
        btn.setAttribute("aria-label", accent.label);
        btn.setAttribute(
          "aria-pressed",
          this.state.accent === accent.id ? "true" : "false"
        );
        btn.dataset.id = accent.id;
        btn.style.background = accent.value;
        btn.title = accent.label;
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
        "Dock size",
        "Width of the dock and size of its icons."
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
        btn.textContent = size.label;
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
        const raw = window.localStorage.getItem(STORAGE_KEY);
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
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
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
          if (isThenable(result)) {
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
  function isThenable(value) {
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
      register({
        id: p.id,
        label: p.label,
        type: "css",
        value: p.value,
        preview: p.value
      });
    }
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
    /** Spring stiffness — how hard a particle pulls back to its home. */
    springK: 0.035,
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
    const onPointerMove = (e) => {
      const rect = app.canvas.getBoundingClientRect();
      pointerX = e.clientX - rect.left;
      pointerY = e.clientY - rect.top;
    };
    const onPointerLeave = () => {
      pointerX = -1e6;
      pointerY = -1e6;
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
        step(n, homeX, homeY, x, y, vx, vy, pointerX, pointerY);
      }
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
  function step(n, homeX, homeY, x, y, vx, vy, pointerX, pointerY) {
    const { springK, damping, repelRadius, repelStrength, restVelocityEpsilon } = CONFIG;
    const repelRadiusSq = repelRadius * repelRadius;
    const restEpsSq = restVelocityEpsilon * restVelocityEpsilon;
    const restPosEps = 0.25;
    const restPosEpsSq = restPosEps * restPosEps;
    for (let i = 0; i < n; i++) {
      const dhx = homeX[i] - x[i];
      const dhy = homeY[i] - y[i];
      let fx = dhx * springK;
      let fy = dhy * springK;
      const dx = x[i] - pointerX;
      const dy = y[i] - pointerY;
      const distSq = dx * dx + dy * dy;
      let disturbed = false;
      if (distSq < repelRadiusSq && distSq > 1e-4) {
        const dist = Math.sqrt(distSq);
        const t = 1 - dist / repelRadius;
        const mag = t * t * repelStrength / dist;
        fx += dx * mag;
        fy += dy * mag;
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
        register(def);
        osSettings.apply();
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
    window.addEventListener("pagehide", () => {
      wallpaperLayer?.teardownActive();
    });
    bindShellLifecycle();
    bindTopWindowLinkInterceptor(manager, config);
    desktopArea.addEventListener("click", (e) => {
      if (e.target !== desktopArea) {
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
    for (const win of config.session.windows) {
      const clamped = clampGeometryToViewport(win, rect);
      const dockEntry = findDockEntryForUrl(win.url, config);
      manager.open({
        id: win.id,
        baseId: win.baseId || win.id,
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
