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
  const EDGE_MARGIN = 8;
  function withChromelessParam(url) {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin !== window.location.origin) {
      return null;
    }
    parsed.searchParams.set("wp_desktop", "1");
    return parsed.toString();
  }
  function urlMatchKey(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      parsed.searchParams.delete("wp_desktop");
      return parsed.pathname.replace(/\/+$/, "") + "?" + parsed.searchParams.toString();
    } catch {
      return url;
    }
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
    if (config.multi) {
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
      const openAnother = document.createElement("button");
      openAnother.type = "button";
      openAnother.className = "wp-desktop-window__menu-item wp-desktop-window__menu-item--open-another";
      openAnother.setAttribute("role", "menuitem");
      openAnother.innerHTML = `<span class="wp-desktop-window__menu-icon dashicons dashicons-plus-alt2" aria-hidden="true"></span><span class="wp-desktop-window__menu-label">Open another ${config.title}</span>`;
      menuPanel.appendChild(openAnother);
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
    }
    /**
     * Restore the window from minimized state.
     */
    restore() {
      if (this.iframe) {
        this.iframe.style.visibility = "";
      }
      this.element.classList.remove("wp-desktop-window--minimized");
      if (this.state === "minimized") {
        this.state = "normal";
      }
      this.onFocusRequest?.(this);
      this.emitChange("state");
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
      }
      this.emitChange("state");
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
    }
    /**
     * Toggle the title-bar actions menu.
     */
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
      this.stack.push(win);
      this.desktop.appendChild(win.element);
      this.focus(win);
      document.dispatchEvent(new CustomEvent("wp-desktop-window-opened", {
        detail: { windowId: win.id, page: config.url, title: config.title }
      }));
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
      document.dispatchEvent(new CustomEvent("wp-desktop-window-focused", {
        detail: { windowId: win.id }
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
      if (this.stack.length > 0) {
        this.focus(this.stack[this.stack.length - 1]);
      }
      document.dispatchEvent(new CustomEvent("wp-desktop-window-closed", {
        detail: { windowId: win.id }
      }));
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
  const STORAGE_KEY = "wp-desktop-os-settings";
  const WALLPAPERS = [
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
    wallpaper: "dark",
    accent: "wp-blue",
    dockSize: "default"
  };
  class OsSettings {
    constructor() {
      this.state = this.load();
    }
    /**
     * Apply the current state to the shell. Safe to call repeatedly —
     * subsequent calls just reset the same CSS variables.
     */
    apply() {
      const shell = document.getElementById("wp-desktop-shell");
      if (!shell) {
        return;
      }
      const wallpaper = WALLPAPERS.find((w) => w.id === this.state.wallpaper) ?? WALLPAPERS[0];
      const accent = ACCENTS.find((a) => a.id === this.state.accent) ?? ACCENTS[0];
      const dockSize = DOCK_SIZES.find((d) => d.id === this.state.dockSize) ?? DOCK_SIZES[1];
      shell.style.setProperty("--wp-desktop-bg", wallpaper.value);
      shell.style.setProperty("--wp-admin-theme-color", accent.value);
      shell.style.setProperty("--wp-desktop-dock-width", `${dockSize.width}px`);
      shell.style.setProperty("--wp-desktop-dock-icon-size", `${dockSize.icon}px`);
    }
    /**
     * Render the settings panel into the given native-window body.
     *
     * Builds three pickers (wallpaper, accent, dock size) and wires
     * each to save/apply on change. The panel is a one-shot build per
     * window open — closing and re-opening renders a fresh tree.
     */
    renderPanel(body) {
      body.classList.add("wp-desktop-os-settings");
      body.innerHTML = "";
      const intro = document.createElement("p");
      intro.className = "wp-desktop-os-settings__intro";
      intro.textContent = "Personalize your desktop. Changes apply instantly and are saved to this browser.";
      body.appendChild(intro);
      body.appendChild(
        this.buildWallpaperSection(() => this.apply())
      );
      body.appendChild(
        this.buildAccentSection(() => this.apply())
      );
      body.appendChild(
        this.buildDockSizeSection(() => this.apply())
      );
      const footer = document.createElement("div");
      footer.className = "wp-desktop-os-settings__footer";
      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "wp-desktop-os-settings__reset";
      reset.textContent = "Reset to defaults";
      reset.addEventListener("click", () => {
        this.state = { ...DEFAULTS };
        this.save();
        this.apply();
        this.renderPanel(body);
      });
      footer.appendChild(reset);
      body.appendChild(footer);
    }
    /**
     * Build the wallpaper section — a grid of preview swatches. Clicking
     * a swatch sets the wallpaper, saves, and fires the apply callback so
     * the desktop updates live.
     */
    buildWallpaperSection(onChange) {
      const section = this.buildSection(
        "Wallpaper",
        "The backdrop behind your windows."
      );
      const grid = document.createElement("div");
      grid.className = "wp-desktop-os-settings__grid wp-desktop-os-settings__grid--wallpapers";
      for (const wp of WALLPAPERS) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "wp-desktop-os-settings__swatch wp-desktop-os-settings__swatch--wallpaper";
        btn.setAttribute("aria-label", wp.label);
        btn.setAttribute("aria-pressed", this.state.wallpaper === wp.id ? "true" : "false");
        btn.dataset.id = wp.id;
        btn.style.background = wp.value;
        const label = document.createElement("span");
        label.className = "wp-desktop-os-settings__swatch-label";
        label.textContent = wp.label;
        btn.appendChild(label);
        btn.addEventListener("click", () => {
          this.state.wallpaper = wp.id;
          this.save();
          onChange();
          this.refreshSelected(grid, wp.id);
        });
        grid.appendChild(btn);
      }
      section.appendChild(grid);
      return section;
    }
    buildAccentSection(onChange) {
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
        btn.setAttribute("aria-pressed", this.state.accent === accent.id ? "true" : "false");
        btn.dataset.id = accent.id;
        btn.style.background = accent.value;
        btn.title = accent.label;
        btn.addEventListener("click", () => {
          this.state.accent = accent.id;
          this.save();
          onChange();
          this.refreshSelected(grid, accent.id);
        });
        grid.appendChild(btn);
      }
      section.appendChild(grid);
      return section;
    }
    buildDockSizeSection(onChange) {
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
        btn.setAttribute("aria-checked", this.state.dockSize === size.id ? "true" : "false");
        btn.dataset.id = size.id;
        btn.textContent = size.label;
        btn.addEventListener("click", () => {
          this.state.dockSize = size.id;
          this.save();
          onChange();
          this.refreshSelected(group, size.id, "aria-checked");
        });
        group.appendChild(btn);
      }
      section.appendChild(group);
      return section;
    }
    /**
     * Helper: builds a `<section>` wrapper with a heading + description.
     */
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
    /**
     * Flip the pressed state on whichever button in the group matches the
     * given id. Extracted so each picker can stay terse.
     */
    refreshSelected(container, id, attr = "aria-pressed") {
      container.querySelectorAll("[data-id]").forEach((el) => {
        el.setAttribute(attr, el.dataset.id === id ? "true" : "false");
      });
    }
    /**
     * Read state from localStorage, merged over defaults. Invalid or
     * unknown values fall back silently — a user editing their storage
     * by hand shouldn't brick the panel.
     */
    load() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          return { ...DEFAULTS };
        }
        const parsed = JSON.parse(raw);
        return {
          wallpaper: WALLPAPERS.some((w) => w.id === parsed.wallpaper) ? parsed.wallpaper : DEFAULTS.wallpaper,
          accent: ACCENTS.some((a) => a.id === parsed.accent) ? parsed.accent : DEFAULTS.accent,
          dockSize: DOCK_SIZES.some((d) => d.id === parsed.dockSize) ? parsed.dockSize : DEFAULTS.dockSize
        };
      } catch {
        return { ...DEFAULTS };
      }
    }
    save() {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      } catch {
      }
    }
  }
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
    const osSettings = new OsSettings();
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
            width: 560,
            height: 560
          });
        }
      });
    }
    const hasSession = !!(config.session && config.session.windows && config.session.windows.length > 0);
    if (hasSession) {
      restoreSession(manager, config, desktopArea);
    }
    openCurrentPage(manager, config);
    const saveSession = createSessionSaver(manager, config);
    wireSessionEvents(saveSession);
    window.wp = window.wp || {};
    window.wp.desktop = {
      windowManager: manager,
      dock,
      saveSession
    };
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
    normalizeBrowserUrl(config);
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
        [JSON.stringify({ session: payload, _wpnonce: config.restNonce })],
        { type: "application/json" }
      );
      if (navigator.sendBeacon && navigator.sendBeacon(config.sessionUrl, body)) {
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
  function normalizeBrowserUrl(config) {
    if (!config.portalUrl || !window.history || !window.history.replaceState) {
      return;
    }
    try {
      window.history.replaceState(window.history.state, "", config.portalUrl);
    } catch {
    }
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
