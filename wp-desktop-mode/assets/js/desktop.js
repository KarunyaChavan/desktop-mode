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
  const HD_MIN_WIDTH = 1920;
  const HD_MIN_HEIGHT = 1080;
  const MEDIA_PER_PAGE = 40;
  const SEARCH_DEBOUNCE_MS = 300;
  const WALLPAPER_PRESETS = [
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
  const ALL_WALLPAPER_IDS = [
    ...WALLPAPER_PRESETS.map((w) => w.id),
    "custom-gradient",
    "custom-image"
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
    constructor(config) {
      this.config = config;
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
      shell.style.setProperty("--wp-desktop-bg", this.resolveWallpaperValue());
      const accent = ACCENTS.find((a) => a.id === this.state.accent) ?? ACCENTS[0];
      const dockSize = DOCK_SIZES.find((d) => d.id === this.state.dockSize) ?? DOCK_SIZES[1];
      shell.style.setProperty("--wp-admin-theme-color", accent.value);
      shell.style.setProperty("--wp-desktop-dock-width", `${dockSize.width}px`);
      shell.style.setProperty("--wp-desktop-dock-icon-size", `${dockSize.icon}px`);
    }
    /**
     * Compute the current wallpaper's `background` shorthand value.
     *
     * Falls back gracefully: custom-gradient uses the stored angle/colors;
     * custom-image falls back to the first preset if the uploaded image is
     * missing (e.g. the attachment was deleted from Media Library since
     * the preference was saved).
     */
    resolveWallpaperValue() {
      if (this.state.wallpaper === "custom-gradient") {
        const { from, to, angle } = this.state.customGradient;
        return `linear-gradient(${angle}deg, ${from}, ${to})`;
      }
      if (this.state.wallpaper === "custom-image" && this.state.customImage) {
        const safeUrl = encodeURI(this.state.customImage.url);
        return `url("${safeUrl}") center/cover no-repeat, #1d2327`;
      }
      const preset = WALLPAPER_PRESETS.find((w) => w.id === this.state.wallpaper) ?? WALLPAPER_PRESETS[0];
      return preset.value;
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
    /**
     * Wallpaper section — preset grid, a "Custom gradient" swatch with an
     * inline editor that only appears when selected, and an image
     * uploader tile below.
     */
    buildWallpaperSection(body) {
      const section = this.buildSection(
        "Wallpaper",
        "The backdrop behind your windows. Pick a preset, mix your own gradient, or drop in an image."
      );
      const grid = document.createElement("div");
      grid.className = "wp-desktop-os-settings__grid wp-desktop-os-settings__grid--wallpapers";
      const gradientEditor = this.buildCustomGradientEditor(() => {
        this.selectWallpaper("custom-gradient", body);
      });
      const toggleGradientEditor = () => {
        gradientEditor.dataset.expanded = this.state.wallpaper === "custom-gradient" ? "true" : "false";
      };
      for (const wp of WALLPAPER_PRESETS) {
        grid.appendChild(
          this.buildWallpaperSwatch(wp.id, wp.label, wp.value, () => {
            this.selectWallpaper(wp.id, body);
            toggleGradientEditor();
          })
        );
      }
      grid.appendChild(
        this.buildWallpaperSwatch(
          "custom-gradient",
          "Custom gradient",
          this.customGradientCss(),
          () => {
            this.selectWallpaper("custom-gradient", body);
            toggleGradientEditor();
          }
        )
      );
      section.appendChild(grid);
      gradientEditor.dataset.expanded = this.state.wallpaper === "custom-gradient" ? "true" : "false";
      section.appendChild(gradientEditor);
      section.appendChild(this.buildCustomImageSection(body));
      return section;
    }
    /**
     * Build one clickable wallpaper preview tile. Factored out because we
     * use the same shape for presets and for the custom-gradient swatch.
     */
    buildWallpaperSwatch(id, label, backgroundValue, onClick) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wp-desktop-os-settings__swatch wp-desktop-os-settings__swatch--wallpaper";
      btn.setAttribute("aria-label", label);
      btn.setAttribute("aria-pressed", this.state.wallpaper === id ? "true" : "false");
      btn.dataset.wallpaperId = id;
      btn.style.background = backgroundValue;
      const labelEl = document.createElement("span");
      labelEl.className = "wp-desktop-os-settings__swatch-label";
      labelEl.textContent = label;
      btn.appendChild(labelEl);
      btn.addEventListener("click", onClick);
      return btn;
    }
    /**
     * Mark a wallpaper id as selected and refresh the grid's pressed
     * state. Separate from the swatch handlers so the image uploader
     * (which lives outside the grid) can call it too.
     */
    selectWallpaper(id, body) {
      this.state.wallpaper = id;
      this.save();
      this.apply();
      this.refreshWallpaperPressedState(body);
    }
    /**
     * Update `aria-pressed` on every wallpaper swatch + image tile so the
     * UI reflects `state.wallpaper`. Cheaper than re-rendering the whole
     * section and keeps focus on whichever button the user clicked.
     */
    refreshWallpaperPressedState(body) {
      body.querySelectorAll("[data-wallpaper-id]").forEach((el) => {
        el.setAttribute(
          "aria-pressed",
          el.dataset.wallpaperId === this.state.wallpaper ? "true" : "false"
        );
      });
    }
    /**
     * Inline editor for the custom gradient — two color inputs and an
     * angle slider. Changing any field updates state live (the
     * `input` event, not `change`) so the desktop repaints as the user
     * drags the angle slider or scrubs through the color picker.
     */
    buildCustomGradientEditor(onApply) {
      const wrap = document.createElement("div");
      wrap.className = "wp-desktop-os-settings__gradient-editor";
      wrap.dataset.expanded = "false";
      const inner = document.createElement("div");
      inner.className = "wp-desktop-os-settings__gradient-editor-inner";
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
      row.appendChild(
        buildColorField("From", this.state.customGradient.from, (value) => {
          this.state.customGradient.from = value;
          this.save();
          onApply();
          this.syncGradientPreviewSwatch(wrap);
        })
      );
      row.appendChild(
        buildColorField("To", this.state.customGradient.to, (value) => {
          this.state.customGradient.to = value;
          this.save();
          onApply();
          this.syncGradientPreviewSwatch(wrap);
        })
      );
      inner.appendChild(row);
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
        this.save();
        onApply();
        this.syncGradientPreviewSwatch(wrap);
      });
      inner.appendChild(angleField);
      wrap.appendChild(inner);
      return wrap;
    }
    /**
     * Keep the "Custom gradient" swatch's preview background in sync with
     * the live-edited gradient. Called from each color/angle input so the
     * user sees the same swatch they'll be selecting from.
     *
     * Walks up from the editor element to find its enclosing section so
     * the lookup stays local to this panel — important because the same
     * class names could appear elsewhere if a plugin ever embeds us.
     */
    syncGradientPreviewSwatch(editorEl) {
      const section = editorEl.closest(".wp-desktop-os-settings__section");
      const preview = section?.querySelector(
        '[data-wallpaper-id="custom-gradient"]'
      );
      if (preview) {
        preview.style.background = this.customGradientCss();
      }
    }
    customGradientCss() {
      const { from, to, angle } = this.state.customGradient;
      return `linear-gradient(${angle}deg, ${from}, ${to})`;
    }
    /**
     * Build the custom-image section: a tabbed widget that lets the user
     * either upload a new image or pick one from the Media Library.
     *
     * The "Upload new" tab is only offered when the user holds the
     * `upload_files` capability; "Media Library" is always available
     * because browsing media only requires the standard `read` cap plus
     * whatever Core enforces on individual attachments.
     */
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
    /**
     * Render the "Upload new" pane into the given container. Replaces
     * any prior contents so tab switching stays cheap.
     */
    renderUploadPane(pane, body) {
      pane.innerHTML = "";
      const tile = document.createElement("div");
      tile.className = "wp-desktop-os-settings__upload-tile";
      tile.dataset.wallpaperId = "custom-image";
      tile.setAttribute(
        "aria-pressed",
        this.state.wallpaper === "custom-image" ? "true" : "false"
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
    /**
     * Render the "Media Library" pane into the given container.
     *
     * Owns its own in-pane state (search query, HD toggle live value,
     * current page, loaded items) via closure. Every tab re-activation
     * starts fresh — simpler than persisting pagination across tab
     * swaps and the payload is small.
     */
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
    /**
     * Apply the HD filter if it's enabled. Factored out so the toggle
     * can re-filter without re-fetching.
     */
    visibleLibraryItems(items) {
      if (!this.state.libraryHdOnly) {
        return items;
      }
      return items.filter(
        (it) => it.media_details.width >= HD_MIN_WIDTH && it.media_details.height >= HD_MIN_HEIGHT
      );
    }
    /**
     * Build one thumbnail tile for a REST media item. Clicking selects
     * the image as the custom wallpaper.
     */
    buildLibraryTile(item, body) {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "wp-desktop-os-settings__library-tile";
      tile.dataset.mediaId = String(item.id);
      const isSelected = this.state.wallpaper === "custom-image" && this.state.customImage?.id === item.id;
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
        this.state.wallpaper = "custom-image";
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
    /**
     * Fetch one page of image attachments from the REST API. Filters
     * `_fields` down to the data we actually render, sorts newest-first,
     * and reads `X-WP-TotalPages` to drive the Load more button.
     *
     * Dimension filtering is intentionally client-side: Core's REST
     * doesn't let us filter by `media_details.width` without a custom
     * query var, and we'd rather not force each install to register
     * one.
     */
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
    /**
     * Paint the image uploader tile based on `state.customImage`. Also
     * wires the click / drag listeners — factored into its own method so
     * swapping empty ↔ filled states is a single call.
     */
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
          if (this.state.wallpaper === "custom-image") {
            this.state.wallpaper = WALLPAPER_PRESETS[0].id;
          }
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
          this.selectWallpaper("custom-image", body);
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
    /**
     * Validate + upload one dropped/chosen file. Errors surface as
     * transient text inside the tile so the user never has to open
     * DevTools to learn why their upload didn't stick.
     */
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
        this.state.wallpaper = "custom-image";
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
    /**
     * Floats a temporary error message inside the tile. Auto-clears
     * after a few seconds so it doesn't linger past the user's attention.
     */
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
    /**
     * POST a single image to the WP REST media endpoint.
     *
     * Using the raw-binary (Content-Disposition header) variant rather
     * than multipart so we don't need a FormData boundary or depend on
     * the server parsing multipart uploads — the REST media endpoint
     * accepts both, and raw-binary is simpler to reason about.
     *
     * Returns the attachment's id and source URL; throws on HTTP error
     * with the server's `message` field preserved so the tile can show
     * the real reason (size, mime, cap) instead of a generic "Failed".
     */
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
          return structuredDefaults();
        }
        const parsed = JSON.parse(raw);
        return {
          wallpaper: typeof parsed.wallpaper === "string" && ALL_WALLPAPER_IDS.includes(parsed.wallpaper) ? parsed.wallpaper : DEFAULTS.wallpaper,
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
    const osSettings = new OsSettings({
      mediaUrl: config.mediaUrl,
      restNonce: config.restNonce,
      canUpload: !!config.canUpload
    });
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
