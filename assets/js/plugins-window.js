(function() {
  "use strict";
  const NONCE_HEADER = "X-WP-Nonce";
  function injectRestNonce(input, init) {
    const nonce = readRestNonce();
    if (!nonce) {
      return init;
    }
    const url = resolveUrl(input);
    if (!url || !isSameOriginRestUrl(url)) {
      return init;
    }
    const baseHeaders = init?.headers ?? (typeof Request !== "undefined" && input instanceof Request ? input.headers : void 0);
    const headers = new Headers(baseHeaders ?? {});
    if (headers.has(NONCE_HEADER)) {
      return init;
    }
    headers.set(NONCE_HEADER, nonce);
    return { ...init ?? {}, headers };
  }
  function readRestNonce() {
    if (typeof window === "undefined") {
      return void 0;
    }
    const cfg = window.desktopModeConfig;
    const value = cfg?.restNonce;
    return typeof value === "string" && value.length > 0 ? value : void 0;
  }
  function resolveUrl(input) {
    try {
      const base = typeof window !== "undefined" && window.location ? window.location.href : void 0;
      if (typeof input === "string") {
        return new URL(input, base);
      }
      if (input instanceof URL) {
        return input;
      }
      if (typeof Request !== "undefined" && input instanceof Request) {
        return new URL(input.url, base);
      }
      return null;
    } catch {
      return null;
    }
  }
  function isSameOriginRestUrl(url) {
    if (typeof window === "undefined" || !window.location || url.origin !== window.location.origin) {
      return false;
    }
    if (url.pathname.includes("/wp-json/")) {
      return true;
    }
    if (url.searchParams.has("rest_route")) {
      return true;
    }
    return false;
  }
  function trackedFetch(input, init, opts = {}) {
    const fn = window.wp?.desktop?.fetch;
    if (typeof fn === "function") {
      return fn(input, init, opts);
    }
    const finalInit = injectRestNonce(input, init);
    return fetch(input, finalInit);
  }
  const TEXT_DOMAIN = "desktop-mode";
  function i18n() {
    return window.wp?.i18n;
  }
  function __(text, domain = TEXT_DOMAIN) {
    return i18n()?.__(text, domain) ?? text;
  }
  function sprintf(format, ...args) {
    const impl = i18n()?.sprintf;
    if (impl) {
      return impl(format, ...args);
    }
    let i = 0;
    return format.replace(/%[sd]/g, () => String(args[i++] ?? ""));
  }
  function buildCard(plugin, installed, callbacks) {
    const card = document.createElement("wpd-card");
    card.classList.add("desktop-mode-plugins__card");
    card.setAttribute("interactive", "");
    card.dataset.slug = plugin.slug;
    card.setAttribute(
      "aria-label",
      sprintf(
        /* translators: %s: plugin name */
        __("View details for %s", "desktop-mode"),
        plugin.name
      )
    );
    const header = document.createElement("header");
    header.className = "desktop-mode-plugins__card-header";
    const iconWrap = document.createElement("div");
    iconWrap.className = "desktop-mode-plugins__card-icon";
    const iconUrl = pickIcon(plugin.icons);
    if (iconUrl) {
      const img = document.createElement("img");
      img.src = iconUrl;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener(
        "load",
        () => img.classList.add("is-loaded")
      );
      img.addEventListener("error", () => {
        iconWrap.replaceChildren(buildFallbackGlyph());
      });
      iconWrap.appendChild(img);
    } else {
      iconWrap.appendChild(buildFallbackGlyph());
    }
    const titleBlock = document.createElement("div");
    titleBlock.className = "desktop-mode-plugins__card-titleblock";
    const title = document.createElement("h3");
    title.className = "desktop-mode-plugins__card-title";
    title.textContent = decodeEntities(plugin.name);
    const byline = document.createElement("p");
    byline.className = "desktop-mode-plugins__card-byline";
    byline.innerHTML = sprintf(
      /* translators: %s: plugin author name (HTML-stripped) */
      __("by %s", "desktop-mode"),
      `<span>${escapeHtml$1(stripHtml$3(plugin.author ?? ""))}</span>`
    );
    titleBlock.append(title, byline);
    header.setAttribute("slot", "header");
    header.append(iconWrap, titleBlock);
    const desc = document.createElement("p");
    desc.className = "desktop-mode-plugins__card-desc";
    desc.textContent = decodeEntities(plugin.short_description ?? "");
    const footer = document.createElement("footer");
    footer.className = "desktop-mode-plugins__card-footer";
    footer.setAttribute("slot", "footer");
    const meta = document.createElement("div");
    meta.className = "desktop-mode-plugins__card-meta";
    meta.appendChild(buildStarCluster(plugin.rating ?? 0, plugin.num_ratings ?? 0));
    const installs = document.createElement("span");
    installs.className = "desktop-mode-plugins__card-installs";
    installs.textContent = formatInstalls(plugin.active_installs ?? 0);
    meta.appendChild(installs);
    const cta = buildCta(plugin, installed, callbacks, card);
    footer.append(meta, cta);
    card.append(header, desc, footer);
    card.addEventListener("wpd-card-click", () => {
      callbacks.onOpen(plugin.slug, plugin);
    });
    return card;
  }
  function repaintCardCta(card, plugin, installed, callbacks) {
    const footer = card.querySelector(
      ".desktop-mode-plugins__card-footer"
    );
    if (!footer) {
      return;
    }
    const previous = footer.querySelector(
      "[data-plugin-card-cta]"
    );
    if (previous) {
      previous.remove();
    }
    footer.appendChild(buildCta(plugin, installed, callbacks, card));
  }
  function buildCta(plugin, installed, callbacks, card) {
    const installedRow = installed.get(plugin.slug);
    const button2 = document.createElement("wpd-button");
    button2.setAttribute("data-plugin-card-cta", "");
    button2.setAttribute("data-noclick", "");
    if (installedRow) {
      if (installedRow.status === "active" || installedRow.status === "active-network") {
        button2.setAttribute("variant", "ghost");
        button2.setAttribute("disabled", "");
        button2.textContent = __("Active", "desktop-mode");
      } else {
        button2.setAttribute("variant", "primary");
        button2.textContent = __("Activate", "desktop-mode");
        button2.addEventListener("click", (ev) => {
          ev.stopPropagation();
          void callbacks.onActivate(installedRow, card);
        });
      }
    } else {
      button2.setAttribute("variant", "primary");
      button2.textContent = __("Install", "desktop-mode");
      button2.addEventListener("click", (ev) => {
        ev.stopPropagation();
        void callbacks.onInstall(plugin, card);
      });
    }
    return button2;
  }
  function buildStarCluster(rating0to100, totalRatings) {
    const wrap = document.createElement("span");
    wrap.className = "desktop-mode-plugins__stars";
    wrap.setAttribute("aria-label", formatStarsAriaLabel(rating0to100));
    const stars5 = Math.max(0, Math.min(5, rating0to100 / 100 * 5));
    const full = Math.floor(stars5);
    const half = stars5 - full >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    for (let i = 0; i < full; i++) {
      wrap.appendChild(buildStar("filled"));
    }
    for (let i = 0; i < half; i++) {
      wrap.appendChild(buildStar("half"));
    }
    for (let i = 0; i < empty; i++) {
      wrap.appendChild(buildStar("empty"));
    }
    if (totalRatings > 0) {
      const count = document.createElement("span");
      count.className = "desktop-mode-plugins__stars-count";
      count.textContent = `(${formatThousands(totalRatings)})`;
      wrap.appendChild(count);
    }
    return wrap;
  }
  function buildStar(kind) {
    const span = document.createElement("span");
    span.className = "desktop-mode-plugins__star";
    span.setAttribute("aria-hidden", "true");
    const icon = document.createElement("span");
    if (kind === "filled") {
      icon.className = "dashicons dashicons-star-filled";
    } else if (kind === "half") {
      icon.className = "dashicons dashicons-star-half";
    } else {
      icon.className = "dashicons dashicons-star-empty";
    }
    span.appendChild(icon);
    return span;
  }
  function buildFallbackGlyph() {
    const fallback = document.createElement("span");
    fallback.className = "dashicons dashicons-admin-plugins desktop-mode-plugins__card-icon-fallback";
    fallback.setAttribute("aria-hidden", "true");
    return fallback;
  }
  function pickIcon(icons) {
    if (!icons) {
      return null;
    }
    return icons.svg ?? icons["256"] ?? icons["256x256"] ?? icons.default ?? icons["128"] ?? icons["128x128"] ?? icons["2x"] ?? icons["1x"] ?? Object.values(icons)[0] ?? null;
  }
  function formatInstalls(n) {
    if (n <= 0) {
      return __("Fewer than 10 active", "desktop-mode");
    }
    if (n >= 1e6) {
      const millions = Math.floor(n / 1e6);
      return sprintf(
        /* translators: %d: integer number of millions of active installs */
        __("%d+ million active", "desktop-mode"),
        millions
      );
    }
    if (n >= 1e3) {
      return sprintf(
        /* translators: %s: comma-grouped active install count */
        __("%s+ active", "desktop-mode"),
        formatThousands(roundTo3SigFigs(n))
      );
    }
    return sprintf(
      /* translators: %s: comma-grouped active install count */
      __("%s+ active", "desktop-mode"),
      formatThousands(n)
    );
  }
  function roundTo3SigFigs(n) {
    const order = Math.pow(10, Math.floor(Math.log10(n)) - 2);
    return Math.floor(n / order) * order;
  }
  function formatStarsAriaLabel(rating0to100) {
    const stars5 = Math.max(0, Math.min(5, rating0to100 / 100 * 5));
    return sprintf(
      /* translators: %s: rating out of 5 (one decimal) */
      __("Rated %s out of 5", "desktop-mode"),
      stars5.toFixed(1)
    );
  }
  function formatThousands(n) {
    try {
      return new Intl.NumberFormat().format(n);
    } catch {
      return String(n);
    }
  }
  const _entityCache = document.createElement("textarea");
  function decodeEntities(html) {
    if (!html) {
      return "";
    }
    _entityCache.innerHTML = html;
    return _entityCache.value;
  }
  function escapeHtml$1(raw) {
    const tmp = document.createElement("div");
    tmp.textContent = raw;
    return tmp.innerHTML;
  }
  function stripHtml$3(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent ?? "";
  }
  function api() {
    return window.wp?.desktop ?? null;
  }
  function makeCardDraggable(card, plugin) {
    if (card.dataset.dragWired === "1") {
      return;
    }
    card.dataset.dragWired = "1";
    card.addEventListener("pointerdown", (ev) => {
      const desktop = api();
      const manager = desktop?.dragManager;
      if (!manager) {
        return;
      }
      const t = ev.target;
      if (t?.closest("[data-plugin-card-cta]")) {
        return;
      }
      manager.start({
        payload: {
          type: "wporg-plugin",
          source: card,
          data: {
            slug: plugin.slug,
            name: plugin.name,
            iconUrl: pickIcon(plugin.icons) ?? null,
            homepage: plugin.homepage ?? "",
            authorName: stripHtml$2(plugin.author ?? ""),
            shortDescription: plugin.short_description ?? ""
          },
          ghost: buildGhost(plugin, card, ev)
        },
        origin: ev,
        onClickOnly: () => {
        }
      });
    });
  }
  function installPluginDropTargets() {
    const desktop = api();
    const manager = desktop?.dragManager;
    if (!manager) {
      return () => {
      };
    }
    const teardowns = [];
    const dock = findDockElement();
    if (dock) {
      const off = manager.registerDropTarget({
        id: "desktop-mode-plugins-window/dock",
        element: dock,
        accept: (p) => p.type === "wporg-plugin",
        onEnter: () => {
          dock.setAttribute("data-plugins-card-drop-active", "");
        },
        onLeave: () => {
          dock.removeAttribute("data-plugins-card-drop-active");
        },
        onDrop: (session) => {
          dock.removeAttribute("data-plugins-card-drop-active");
          const data = session.payload.data;
          const slug = String(data.slug ?? "");
          if (!slug) {
            return;
          }
          const name = String(data.name ?? slug);
          const icon = typeof data.iconUrl === "string" && data.iconUrl ? data.iconUrl : "dashicons-admin-plugins";
          const homepage = String(data.homepage ?? "");
          const url = homepage !== "" ? homepage : `https://wordpress.org/plugins/${encodeURIComponent(slug)}/`;
          if (typeof desktop?.registerSystemTile === "function") {
            desktop.registerSystemTile({
              id: `wporg-plugin-${slug}`,
              title: name,
              icon,
              url
            });
          }
          if (typeof desktop?.showToast === "function") {
            desktop.showToast({
              message: sprintf(
                /* translators: %s: plugin name */
                __("Pinned %s to the dock.", "desktop-mode"),
                name
              ),
              duration: 3500
            });
          }
        }
      });
      teardowns.push(off);
    }
    return () => {
      for (const off of teardowns) {
        try {
          off();
        } catch {
        }
      }
    };
  }
  function findDockElement() {
    return document.querySelector(".desktop-mode-bottom-dock") ?? document.querySelector(".desktop-mode-dock") ?? document.querySelector("[data-desktop-mode-dock]");
  }
  function buildGhost(plugin, card, origin) {
    const rect = card.getBoundingClientRect();
    const offsetX = origin.clientX - rect.left;
    const offsetY = origin.clientY - rect.top;
    const ghost = document.createElement("div");
    ghost.className = "desktop-mode-plugins__drag-ghost";
    const iconUrl = pickIcon(plugin.icons);
    if (iconUrl) {
      const img = document.createElement("img");
      img.src = iconUrl;
      img.alt = "";
      ghost.appendChild(img);
    } else {
      const fallback = document.createElement("span");
      fallback.className = "dashicons dashicons-admin-plugins desktop-mode-plugins__drag-ghost-fallback";
      ghost.appendChild(fallback);
    }
    const label = document.createElement("span");
    label.textContent = plugin.name;
    ghost.appendChild(label);
    return { offsetX, offsetY, element: ghost };
  }
  function stripHtml$2(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent ?? "";
  }
  const WINDOW_ID = "desktop-mode-plugins";
  function getConfig() {
    const store = window.desktopModeWindowConfig;
    const cfg = store ? store[WINDOW_ID] : void 0;
    if (!cfg) {
      throw new Error(
        `[${WINDOW_ID}] config blob is missing — was the window opened without registration? See the matching \`desktop_mode_register_window()\` call in \`includes/plugins-window/window.php\`.`
      );
    }
    return cfg;
  }
  function shellFetch(input, init) {
    return trackedFetch(input, init, {
      windowId: WINDOW_ID,
      source: "desktop-mode/plugins-window"
    });
  }
  async function restRequest(url, init = {}) {
    const cfg = getConfig();
    const { expectJson = true, ...rest } = init;
    const response = await shellFetch(url, {
      ...rest,
      credentials: "same-origin",
      headers: {
        "X-WP-Nonce": cfg.restNonce,
        Accept: "application/json",
        ...rest.body ? { "Content-Type": "application/json" } : {},
        ...rest.headers ?? {}
      }
    });
    if (!response.ok) {
      throw await unpackErrorResponse(response);
    }
    if (!expectJson) {
      return void 0;
    }
    return await response.json();
  }
  async function ajaxRequest(action, args = {}, options = {}) {
    const cfg = getConfig();
    const body = new URLSearchParams();
    body.set("action", action);
    const nonceField = options.nonceField ?? "_ajax_nonce";
    const nonceValue = options.nonceValue ?? cfg.ajaxNonce;
    body.set(nonceField, nonceValue);
    for (const [key, value] of Object.entries(args)) {
      if (value === void 0) {
        continue;
      }
      body.set(key, String(value));
    }
    const response = await shellFetch(cfg.ajaxUrl, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "application/json"
      },
      body
    });
    const json = await readJsonOrThrow(response);
    return unwrapAjaxEnvelope(json, response.status);
  }
  async function ajaxUpload(action, formData) {
    const cfg = getConfig();
    formData.set("action", action);
    if (!formData.has("_ajax_nonce")) {
      formData.set("_ajax_nonce", cfg.ajaxNonce);
    }
    const response = await shellFetch(cfg.ajaxUrl, {
      method: "POST",
      credentials: "same-origin",
      body: formData
      // Don't set Content-Type — the browser appends the boundary.
    });
    const json = await readJsonOrThrow(response);
    return unwrapAjaxEnvelope(json, response.status);
  }
  async function readJsonOrThrow(response) {
    let json;
    try {
      json = await response.json();
    } catch (err) {
      throw new Error(
        `Server returned ${response.status} with non-JSON body. (${String(err)})`
      );
    }
    if (!response.ok) {
      throw extractAjaxError(json, response.status);
    }
    return json;
  }
  function unwrapAjaxEnvelope(json, status) {
    if (typeof json === "object" && json !== null && "success" in json) {
      const env = json;
      if (env.success) {
        return env.data ?? null;
      }
      throw extractAjaxError(env.data, status);
    }
    return json;
  }
  function extractAjaxError(data, status) {
    if (typeof data === "object" && data !== null) {
      const obj = data;
      const msg = obj.message ?? obj.errorMessage ?? obj.code;
      if (typeof msg === "string" && msg !== "") {
        const err = new Error(msg);
        err.code = obj.code;
        err.status = status;
        return err;
      }
    }
    return new Error(`Request failed (${status}).`);
  }
  async function unpackErrorResponse(response) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const json = await response.json();
      if (json && typeof json.message === "string" && json.message !== "") {
        message = json.message;
      }
      const err = new Error(message);
      err.code = json?.code;
      err.status = response.status;
      return err;
    } catch {
      const err = new Error(message);
      err.status = response.status;
      return err;
    }
  }
  async function fetchInstalledPlugins() {
    const cfg = getConfig();
    const url = cfg.pluginsUrl + "?context=view&per_page=100";
    return restRequest(url, { method: "GET" });
  }
  async function activateInstalledPlugin(plugin) {
    return mutateInstalledPlugin(plugin, { status: "active" });
  }
  async function deactivateInstalledPlugin(plugin) {
    return mutateInstalledPlugin(plugin, { status: "inactive" });
  }
  async function mutateInstalledPlugin(plugin, body) {
    const cfg = getConfig();
    return restRequest(
      cfg.pluginsUrl + "/" + encodePluginPath(plugin.plugin),
      {
        method: "PUT",
        body: JSON.stringify(body)
      }
    );
  }
  async function deleteInstalledPlugin(plugin) {
    const cfg = getConfig();
    await restRequest(
      cfg.pluginsUrl + "/" + encodePluginPath(plugin.plugin) + "?force=true",
      {
        method: "DELETE",
        expectJson: false
      }
    );
  }
  function encodePluginPath(plugin) {
    return plugin.split("/").map(encodeURIComponent).join("/");
  }
  async function browsePlugins(args = {}) {
    return ajaxRequest("desktop_mode_plugins_browse", {
      browse: args.browse,
      search: args.search,
      tag: args.tag,
      page: args.page,
      per_page: args.perPage
    });
  }
  async function fetchPluginInfo(slug) {
    return ajaxRequest("desktop_mode_plugins_info", { slug });
  }
  async function fetchPluginReviews(slug) {
    return ajaxRequest("desktop_mode_plugins_reviews", { slug });
  }
  async function installPluginBySlug(slug) {
    return ajaxRequest(
      "install-plugin",
      { slug },
      { nonceField: "_ajax_nonce", nonceValue: getConfig().updatesNonce }
    );
  }
  async function uploadPluginZip(file) {
    const data = new FormData();
    data.set("pluginzip", file);
    return ajaxUpload("desktop_mode_plugins_upload", data);
  }
  async function refreshFrameworkMenu() {
    const refresh = window.wp?.desktop?.refreshMenu;
    if (typeof refresh !== "function") {
      return;
    }
    try {
      await refresh();
    } catch {
    }
  }
  function isDesktopModeSelf(pluginFile) {
    let self = "";
    try {
      self = getConfig().selfPluginFile;
    } catch {
      return false;
    }
    const trim = (s) => s.endsWith(".php") ? s.slice(0, -4) : s;
    return self !== "" && trim(self) === trim(pluginFile);
  }
  function reloadOutOfDesktopMode() {
    const target = window.top ?? window;
    let dest;
    try {
      dest = getConfig().adminUrl;
    } catch {
      dest = "";
    }
    window.setTimeout(() => {
      if (dest) {
        try {
          target.location.assign(dest);
          return;
        } catch {
        }
        window.location.assign(dest);
        return;
      }
      try {
        target.location.reload();
      } catch {
        window.location.reload();
      }
    }, 800);
  }
  function toast$2(message, duration = 3500) {
    const api2 = window.wp?.desktop;
    if (api2 && typeof api2.showToast === "function") {
      api2.showToast({ message, duration });
      return;
    }
    console.log("[plugins-window]", message);
  }
  async function confirm$1(opts) {
    const api2 = window.wp?.desktop;
    if (api2 && typeof api2.confirm === "function") {
      return api2.confirm(opts);
    }
    return Promise.resolve(true);
  }
  function openDetailFlyout(flyout, slug, hint, callbacks) {
    flyout.replaceChildren();
    const card = document.createElement("div");
    card.className = "desktop-mode-plugins__flyout";
    const hero = buildHeroSkeleton(hint);
    const tabs = buildTabs();
    const body = document.createElement("div");
    body.className = "desktop-mode-plugins__flyout-body";
    const footer = document.createElement("footer");
    footer.className = "desktop-mode-plugins__flyout-footer";
    card.append(hero.root, tabs.root, body, footer);
    flyout.appendChild(card);
    flyout.setAttribute("open", "");
    let info = null;
    const reviewsCache = { loaded: false };
    const refreshFooter = () => {
      paintFooter(footer, slug, info, callbacks, () => closeFlyout(flyout));
    };
    refreshFooter();
    tabs.onChange((tab) => {
      paintTabBody(body, tab, info, slug, reviewsCache);
    });
    paintTabBody(body, "overview", info, slug, reviewsCache);
    void (async () => {
      try {
        info = await fetchPluginInfo(slug);
        paintHero(hero, info);
        refreshFooter();
        const current = tabs.current();
        paintTabBody(body, current, info, slug, reviewsCache);
      } catch (err) {
        body.innerHTML = "";
        const failure = document.createElement("p");
        failure.className = "desktop-mode-plugins__flyout-error";
        failure.textContent = err instanceof Error ? err.message : __("Could not load plugin details.", "desktop-mode");
        body.appendChild(failure);
      }
    })();
  }
  function closeFlyout(flyout) {
    flyout.removeAttribute("open");
  }
  function buildHeroSkeleton(hint) {
    const root = document.createElement("header");
    root.className = "desktop-mode-plugins__flyout-hero";
    const banner = document.createElement("div");
    banner.className = "desktop-mode-plugins__flyout-banner";
    root.appendChild(banner);
    const inner = document.createElement("div");
    inner.className = "desktop-mode-plugins__flyout-hero-inner";
    const icon = document.createElement("div");
    icon.className = "desktop-mode-plugins__flyout-hero-icon";
    const text = document.createElement("div");
    text.className = "desktop-mode-plugins__flyout-hero-text";
    const title = document.createElement("h2");
    title.className = "desktop-mode-plugins__flyout-hero-title";
    const byline = document.createElement("p");
    byline.className = "desktop-mode-plugins__flyout-hero-byline";
    const meta = document.createElement("div");
    meta.className = "desktop-mode-plugins__flyout-hero-meta";
    const stars = document.createElement("div");
    stars.className = "desktop-mode-plugins__flyout-hero-stars";
    meta.appendChild(stars);
    text.append(title, byline, meta);
    inner.append(icon, text);
    root.appendChild(inner);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "desktop-mode-plugins__flyout-close";
    close.setAttribute("data-flyout-close", "");
    close.setAttribute(
      "aria-label",
      __("Close plugin details", "desktop-mode")
    );
    close.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 L6 18"></path><path d="M6 6 L18 18"></path></svg>';
    root.appendChild(close);
    if (hint) {
      title.textContent = hint.name;
      byline.textContent = sprintf(
        /* translators: %s: plugin author */
        __("by %s", "desktop-mode"),
        stripHtml$1(hint.author ?? "")
      );
      const iconUrl = pickIcon(hint.icons);
      if (iconUrl) {
        const img = document.createElement("img");
        img.src = iconUrl;
        img.alt = "";
        icon.appendChild(img);
      }
      stars.appendChild(
        buildStarCluster(hint.rating ?? 0, hint.num_ratings ?? 0)
      );
    }
    return { root, icon, title, byline, stars, meta, banner };
  }
  function paintHero(parts, info) {
    parts.title.textContent = info.name;
    parts.byline.textContent = sprintf(
      /* translators: %s: plugin author */
      __("by %s", "desktop-mode"),
      stripHtml$1(info.author ?? "")
    );
    parts.icon.replaceChildren();
    const iconUrl = pickIcon(info.icons);
    if (iconUrl) {
      const img = document.createElement("img");
      img.src = iconUrl;
      img.alt = "";
      parts.icon.appendChild(img);
    }
    parts.stars.replaceChildren(
      buildStarCluster(info.rating ?? 0, info.num_ratings ?? 0)
    );
    const bannerUrl = info.banners?.high ?? info.banners?.low;
    if (bannerUrl) {
      parts.banner.style.backgroundImage = `url("${bannerUrl}")`;
      parts.banner.classList.add("has-banner");
    }
    parts.meta.querySelectorAll(":scope > .desktop-mode-plugins__flyout-meta-row").forEach((n) => n.remove());
    const metaRow = document.createElement("div");
    metaRow.className = "desktop-mode-plugins__flyout-meta-row";
    const installs = document.createElement("span");
    installs.textContent = sprintf(
      /* translators: %s: comma-grouped active install count */
      __("%s+ active", "desktop-mode"),
      new Intl.NumberFormat().format(info.active_installs ?? 0)
    );
    const updated = document.createElement("span");
    updated.textContent = sprintf(
      /* translators: %s: human-readable date string from wp.org */
      __("Updated %s", "desktop-mode"),
      humanDate(info.last_updated)
    );
    const tested = document.createElement("span");
    tested.textContent = info.tested ? sprintf(
      /* translators: %s: maximum tested WordPress version */
      __("Tested up to WordPress %s", "desktop-mode"),
      info.tested
    ) : "";
    metaRow.append(installs, updated);
    if (tested.textContent) {
      metaRow.appendChild(tested);
    }
    parts.meta.appendChild(metaRow);
  }
  function buildTabs() {
    const root = document.createElement("wpd-tabs");
    root.className = "desktop-mode-plugins__flyout-tabs";
    root.setAttribute("value", "overview");
    const labels = [
      { value: "overview", label: __("Overview", "desktop-mode") },
      { value: "screenshots", label: __("Screenshots", "desktop-mode") },
      { value: "reviews", label: __("Reviews", "desktop-mode") },
      { value: "changelog", label: __("Changelog", "desktop-mode") },
      { value: "faq", label: __("FAQ", "desktop-mode") }
    ];
    for (const opt of labels) {
      const tab = document.createElement("wpd-tab");
      tab.setAttribute("value", opt.value);
      tab.textContent = opt.label;
      root.appendChild(tab);
    }
    let current = "overview";
    const subscribers = /* @__PURE__ */ new Set();
    root.addEventListener("wpd-tab-change", (ev) => {
      const detail = ev.detail;
      const value = detail?.value ?? "overview";
      current = value;
      for (const cb of subscribers) {
        cb(current);
      }
    });
    return {
      root,
      current: () => current,
      onChange: (cb) => subscribers.add(cb)
    };
  }
  function paintTabBody(body, tab, info, slug, reviewsCache) {
    body.replaceChildren();
    if (!info) {
      body.appendChild(buildSkeletonLines(4));
      return;
    }
    if (tab === "overview") {
      body.appendChild(buildHtmlSection(info.sections?.description ?? info.short_description ?? ""));
      return;
    }
    if (tab === "screenshots") {
      body.appendChild(buildScreenshots(info.screenshots));
      return;
    }
    if (tab === "changelog") {
      body.appendChild(buildHtmlSection(info.sections?.changelog ?? ""));
      return;
    }
    if (tab === "faq") {
      body.appendChild(buildHtmlSection(info.sections?.faq ?? ""));
      return;
    }
    if (tab === "reviews") {
      body.appendChild(buildRatingsHistogram(info));
      const list = document.createElement("div");
      list.className = "desktop-mode-plugins__reviews-list";
      const loadingLine = document.createElement("p");
      loadingLine.className = "desktop-mode-plugins__reviews-loading";
      loadingLine.textContent = __("Loading recent reviews…", "desktop-mode");
      list.appendChild(loadingLine);
      body.appendChild(list);
      if (!reviewsCache.loaded) {
        void (async () => {
          try {
            const resp = await fetchPluginReviews(slug);
            list.replaceChildren();
            if (!resp.parsed || resp.items.length === 0) {
              const fallback = document.createElement("p");
              fallback.className = "desktop-mode-plugins__reviews-fallback";
              fallback.innerHTML = sprintf(
                /* translators: %s: anchor tag with link to wp.org reviews */
                __(
                  "Recent reviews aren’t available right now. %s",
                  "desktop-mode"
                ),
                `<a href="https://wordpress.org/plugins/${encodeURIComponent(slug)}/#reviews" target="_blank" rel="noopener">${__(
                  "Read reviews on WordPress.org ↗",
                  "desktop-mode"
                )}</a>`
              );
              list.appendChild(fallback);
            } else {
              for (const item of resp.items) {
                list.appendChild(buildReviewCard(item));
              }
            }
            reviewsCache.loaded = true;
          } catch {
            list.replaceChildren();
            const failure = document.createElement("p");
            failure.className = "desktop-mode-plugins__reviews-fallback";
            failure.textContent = __(
              "Could not load reviews.",
              "desktop-mode"
            );
            list.appendChild(failure);
          }
        })();
      }
    }
  }
  function buildHtmlSection(html) {
    const wrap = document.createElement("div");
    wrap.className = "desktop-mode-plugins__html";
    if (!html) {
      const empty = document.createElement("p");
      empty.className = "desktop-mode-plugins__empty-line";
      empty.textContent = __("No content available.", "desktop-mode");
      wrap.appendChild(empty);
      return wrap;
    }
    wrap.innerHTML = sanitizeHtml(html);
    wrap.querySelectorAll("a").forEach((a) => {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener nofollow");
    });
    return wrap;
  }
  function buildScreenshots(shots) {
    const wrap = document.createElement("div");
    wrap.className = "desktop-mode-plugins__screenshots";
    const items = shots ? Object.values(shots) : [];
    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "desktop-mode-plugins__empty-line";
      empty.textContent = __(
        "This plugin doesn’t ship screenshots.",
        "desktop-mode"
      );
      wrap.appendChild(empty);
      return wrap;
    }
    for (const shot of items) {
      const fig = document.createElement("figure");
      fig.className = "desktop-mode-plugins__screenshot";
      const img = document.createElement("img");
      img.src = shot.src;
      img.loading = "lazy";
      img.alt = shot.caption ?? "";
      fig.appendChild(img);
      if (shot.caption) {
        const cap = document.createElement("figcaption");
        cap.innerHTML = sanitizeHtml(shot.caption);
        fig.appendChild(cap);
      }
      wrap.appendChild(fig);
    }
    return wrap;
  }
  function buildRatingsHistogram(info) {
    const wrap = document.createElement("div");
    wrap.className = "desktop-mode-plugins__histogram";
    const ratings = info.ratings ?? {};
    const total = Object.values(ratings).reduce(
      (a, b) => a + (typeof b === "number" ? b : 0),
      0
    );
    if (total === 0) {
      const empty = document.createElement("p");
      empty.className = "desktop-mode-plugins__empty-line";
      empty.textContent = __("No ratings yet.", "desktop-mode");
      wrap.appendChild(empty);
      return wrap;
    }
    for (let star = 5; star >= 1; star--) {
      const count = ratings[String(star)] ?? 0;
      const ratio = count / total;
      const row = document.createElement("div");
      row.className = "desktop-mode-plugins__histogram-row";
      const label = document.createElement("span");
      label.className = "desktop-mode-plugins__histogram-label";
      label.textContent = sprintf(
        /* translators: %d: number of stars (1–5) */
        __("%d ★", "desktop-mode"),
        star
      );
      const track = document.createElement("span");
      track.className = "desktop-mode-plugins__histogram-track";
      const fill = document.createElement("span");
      fill.className = "desktop-mode-plugins__histogram-fill";
      fill.style.width = `${Math.round(ratio * 100)}%`;
      track.appendChild(fill);
      const num = document.createElement("span");
      num.className = "desktop-mode-plugins__histogram-count";
      num.textContent = new Intl.NumberFormat().format(count);
      row.append(label, track, num);
      wrap.appendChild(row);
    }
    return wrap;
  }
  function buildReviewCard(item) {
    const card = document.createElement("article");
    card.className = "desktop-mode-plugins__review";
    const head = document.createElement("header");
    head.className = "desktop-mode-plugins__review-head";
    const author = document.createElement("span");
    author.className = "desktop-mode-plugins__review-author";
    author.textContent = item.author || __("Anonymous", "desktop-mode");
    const star = buildStarCluster(item.stars / 5 * 100, 0);
    head.append(author, star);
    if (item.date) {
      const date = document.createElement("time");
      date.className = "desktop-mode-plugins__review-date";
      date.textContent = item.date;
      head.appendChild(date);
    }
    const body = document.createElement("p");
    body.className = "desktop-mode-plugins__review-excerpt";
    body.textContent = item.excerpt;
    card.append(head, body);
    if (item.url) {
      const link = document.createElement("a");
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener nofollow";
      link.textContent = __("Read on WordPress.org ↗", "desktop-mode");
      link.className = "desktop-mode-plugins__review-link";
      card.appendChild(link);
    }
    return card;
  }
  function buildSkeletonLines(count) {
    const wrap = document.createElement("div");
    wrap.className = "desktop-mode-plugins__skeleton";
    for (let i = 0; i < count; i++) {
      const line = document.createElement("span");
      line.className = "desktop-mode-plugins__skeleton-line";
      line.style.width = `${60 + i * 10 % 40}%`;
      wrap.appendChild(line);
    }
    return wrap;
  }
  function paintFooter(footer, slug, info, callbacks, close) {
    footer.replaceChildren();
    const cfg = getConfig();
    const installed = callbacks.getInstalled(slug);
    const left = document.createElement("div");
    left.className = "desktop-mode-plugins__flyout-footer-left";
    const wpOrg = document.createElement("a");
    wpOrg.href = `https://wordpress.org/plugins/${encodeURIComponent(slug)}/`;
    wpOrg.target = "_blank";
    wpOrg.rel = "noopener";
    wpOrg.className = "desktop-mode-plugins__flyout-wporg";
    wpOrg.textContent = __("View on WordPress.org ↗", "desktop-mode");
    left.appendChild(wpOrg);
    const right = document.createElement("div");
    right.className = "desktop-mode-plugins__flyout-footer-right";
    if (installed) {
      if (cfg.caps.activate) {
        if (installed.status === "active" || installed.status === "active-network") {
          const btn = button(__("Deactivate", "desktop-mode"), "secondary");
          btn.addEventListener("click", () => {
            void doDeactivate();
          });
          right.appendChild(btn);
        } else {
          const btn = button(__("Activate", "desktop-mode"), "primary");
          btn.addEventListener("click", () => {
            void doActivate();
          });
          right.appendChild(btn);
        }
      }
      if (cfg.caps.delete && installed.status === "inactive") {
        const btn = button(__("Delete", "desktop-mode"), "danger");
        btn.addEventListener("click", () => {
          void doDelete();
        });
        right.appendChild(btn);
      }
    } else if (cfg.caps.install) {
      const btn = button(__("Install", "desktop-mode"), "primary");
      btn.addEventListener("click", () => {
        void doInstall(btn);
      });
      right.appendChild(btn);
    }
    footer.append(left, right);
    async function doInstall(btn) {
      const originalText = btn.textContent ?? "";
      btn.setAttribute("busy", "");
      btn.setAttribute("disabled", "");
      btn.textContent = __("Installing…", "desktop-mode");
      try {
        const result = await installPluginBySlug(slug);
        toast$2(
          sprintf(
            /* translators: %s: plugin name */
            __("Installed %s.", "desktop-mode"),
            info?.name ?? slug
          )
        );
        await callbacks.onPluginInstalled(result.plugin ?? "", slug);
        paintFooter(footer, slug, info, callbacks, close);
        void refreshFrameworkMenu();
      } catch (err) {
        btn.removeAttribute("busy");
        btn.removeAttribute("disabled");
        btn.textContent = originalText;
        toast$2(
          sprintf(
            /* translators: %s: error message */
            __("Install failed: %s", "desktop-mode"),
            describe$2(err)
          ),
          6e3
        );
      }
    }
    async function doActivate() {
      if (!installed) {
        return;
      }
      try {
        const updated = await activateInstalledPlugin(installed);
        callbacks.onPluginActivated(updated);
        toast$2(
          sprintf(
            /* translators: %s: plugin name */
            __("%s activated.", "desktop-mode"),
            updated.name || updated.plugin
          )
        );
        paintFooter(footer, slug, info, callbacks, close);
        void refreshFrameworkMenu();
      } catch (err) {
        toast$2(
          sprintf(
            /* translators: %s: error message */
            __("Activation failed: %s", "desktop-mode"),
            describe$2(err)
          ),
          6e3
        );
      }
    }
    async function doDeactivate() {
      if (!installed) {
        return;
      }
      try {
        const updated = await deactivateInstalledPlugin(installed);
        callbacks.onPluginDeactivated(updated);
        if (isDesktopModeSelf(updated.plugin)) {
          toast$2(
            __(
              "Desktop Mode deactivated. Reloading…",
              "desktop-mode"
            ),
            2e3
          );
          reloadOutOfDesktopMode();
          return;
        }
        toast$2(
          sprintf(
            /* translators: %s: plugin name */
            __("%s deactivated.", "desktop-mode"),
            updated.name || updated.plugin
          )
        );
        paintFooter(footer, slug, info, callbacks, close);
        void refreshFrameworkMenu();
      } catch (err) {
        toast$2(
          sprintf(
            /* translators: %s: error message */
            __("Deactivation failed: %s", "desktop-mode"),
            describe$2(err)
          ),
          6e3
        );
      }
    }
    async function doDelete() {
      if (!installed) {
        return;
      }
      const ok = await confirm$1({
        title: __("Delete plugin?", "desktop-mode"),
        message: sprintf(
          /* translators: %s: plugin name */
          __(
            "Permanently delete %s? Its files will be removed from disk. This cannot be undone.",
            "desktop-mode"
          ),
          installed.name || installed.plugin
        ),
        confirmLabel: __("Delete", "desktop-mode"),
        danger: true
      });
      if (!ok) {
        return;
      }
      try {
        await deleteInstalledPlugin(installed);
        callbacks.onPluginDeleted(installed);
        if (isDesktopModeSelf(installed.plugin)) {
          toast$2(
            __(
              "Desktop Mode deleted. Reloading…",
              "desktop-mode"
            ),
            2e3
          );
          reloadOutOfDesktopMode();
          return;
        }
        toast$2(
          sprintf(
            /* translators: %s: plugin name */
            __("%s deleted.", "desktop-mode"),
            installed.name || installed.plugin
          )
        );
        close();
        void refreshFrameworkMenu();
      } catch (err) {
        toast$2(
          sprintf(
            /* translators: %s: error message */
            __("Delete failed: %s", "desktop-mode"),
            describe$2(err)
          ),
          6e3
        );
      }
    }
  }
  function button(label, variant) {
    const b = document.createElement("wpd-button");
    b.setAttribute("variant", variant);
    b.textContent = label;
    return b;
  }
  function sanitizeHtml(html) {
    const allowed = /* @__PURE__ */ new Set([
      "A",
      "ABBR",
      "B",
      "BLOCKQUOTE",
      "BR",
      "CODE",
      "DD",
      "DEL",
      "DIV",
      "DL",
      "DT",
      "EM",
      "FIGCAPTION",
      "FIGURE",
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6",
      "HR",
      "I",
      "IMG",
      "KBD",
      "LI",
      "OL",
      "P",
      "PRE",
      "Q",
      "S",
      "SMALL",
      "SPAN",
      "STRONG",
      "SUB",
      "SUP",
      "TABLE",
      "TBODY",
      "TD",
      "TFOOT",
      "TH",
      "THEAD",
      "TR",
      "U",
      "UL"
    ]);
    const allowedAttrs = /* @__PURE__ */ new Set([
      "href",
      "src",
      "alt",
      "title",
      "name",
      "rel",
      "target",
      "colspan",
      "rowspan"
    ]);
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    const walker = document.createTreeWalker(wrap, NodeFilter.SHOW_ELEMENT);
    const toRemove = [];
    let current = walker.currentNode;
    while (current) {
      const next = walker.nextNode();
      if (current === wrap) {
        current = next;
        continue;
      }
      if (!allowed.has(current.tagName)) {
        toRemove.push(current);
      } else {
        for (const attr of Array.from(current.attributes)) {
          if (!allowedAttrs.has(attr.name.toLowerCase())) {
            current.removeAttribute(attr.name);
          }
        }
        if (current.tagName === "A") {
          const href = current.getAttribute("href") ?? "";
          if (href.startsWith("javascript:")) {
            current.removeAttribute("href");
          }
        }
        if (current.tagName === "IMG") {
          const src = current.getAttribute("src") ?? "";
          if (src.startsWith("javascript:")) {
            current.removeAttribute("src");
          }
        }
      }
      current = next;
    }
    for (const el of toRemove) {
      const text = document.createTextNode(el.textContent ?? "");
      el.replaceWith(text);
    }
    return wrap.innerHTML;
  }
  function describe$2(err) {
    if (err instanceof Error) {
      return err.message;
    }
    return String(err);
  }
  function stripHtml$1(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent ?? "";
  }
  function humanDate(raw) {
    if (!raw) {
      return "—";
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    if (m) {
      const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      try {
        return date.toLocaleDateString();
      } catch {
        return raw;
      }
    }
    return raw;
  }
  function openUploadDialog(host, prefilled, callbacks = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "desktop-mode-plugins__upload-overlay";
      const card = document.createElement("div");
      card.className = "desktop-mode-plugins__upload-card";
      card.setAttribute("role", "dialog");
      card.setAttribute("aria-modal", "true");
      card.setAttribute(
        "aria-label",
        __("Upload a plugin .zip", "desktop-mode")
      );
      const heading = document.createElement("h2");
      heading.className = "desktop-mode-plugins__upload-heading";
      heading.textContent = __("Upload a plugin", "desktop-mode");
      const lede = document.createElement("p");
      lede.className = "desktop-mode-plugins__upload-lede";
      lede.textContent = __(
        "Pick a .zip file from your computer, or drop one onto the area below.",
        "desktop-mode"
      );
      const dropZone = document.createElement("div");
      dropZone.className = "desktop-mode-plugins__upload-dropzone";
      dropZone.tabIndex = 0;
      dropZone.setAttribute("role", "button");
      dropZone.setAttribute(
        "aria-label",
        __(
          "Drop a .zip plugin file here, or click to choose a file.",
          "desktop-mode"
        )
      );
      const dropIcon = document.createElement("span");
      dropIcon.className = "dashicons dashicons-upload desktop-mode-plugins__upload-icon";
      dropIcon.setAttribute("aria-hidden", "true");
      const dropHint = document.createElement("p");
      dropHint.className = "desktop-mode-plugins__upload-hint";
      dropHint.textContent = __(
        "Drop your .zip here or click to browse",
        "desktop-mode"
      );
      const fileLabel = document.createElement("p");
      fileLabel.className = "desktop-mode-plugins__upload-filename";
      fileLabel.hidden = true;
      dropZone.append(dropIcon, dropHint, fileLabel);
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".zip,application/zip,application/x-zip-compressed";
      input.style.display = "none";
      dropZone.appendChild(input);
      const status = document.createElement("p");
      status.className = "desktop-mode-plugins__upload-status";
      status.hidden = true;
      const actions = document.createElement("div");
      actions.className = "desktop-mode-plugins__upload-actions";
      const cancelBtn = document.createElement("wpd-button");
      cancelBtn.setAttribute("variant", "ghost");
      cancelBtn.textContent = __("Cancel", "desktop-mode");
      const submitBtn = document.createElement("wpd-button");
      submitBtn.setAttribute("variant", "primary");
      submitBtn.textContent = __("Install", "desktop-mode");
      submitBtn.setAttribute("disabled", "");
      actions.append(cancelBtn, submitBtn);
      card.append(heading, lede, dropZone, status, actions);
      overlay.appendChild(card);
      host.appendChild(overlay);
      let pickedFile = null;
      let uploading = false;
      const setFile = (file) => {
        pickedFile = file;
        if (file) {
          dropZone.classList.add("has-file");
          fileLabel.hidden = false;
          fileLabel.textContent = sprintf(
            /* translators: 1: file name, 2: file size in KB */
            __("%1$s · %2$s KB", "desktop-mode"),
            file.name,
            Math.round(file.size / 1024).toString()
          );
          submitBtn.removeAttribute("disabled");
        } else {
          dropZone.classList.remove("has-file");
          fileLabel.hidden = true;
          submitBtn.setAttribute("disabled", "");
        }
      };
      dropZone.addEventListener("click", (ev) => {
        if (ev.target?.tagName === "INPUT") {
          return;
        }
        input.click();
      });
      dropZone.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          input.click();
        }
      });
      dropZone.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        dropZone.classList.add("is-hovered");
      });
      dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("is-hovered");
      });
      dropZone.addEventListener("drop", (ev) => {
        ev.preventDefault();
        dropZone.classList.remove("is-hovered");
        const file = ev.dataTransfer?.files?.[0];
        if (file && isZip(file)) {
          setFile(file);
        } else if (file) {
          showStatus(
            __("Only .zip files are accepted.", "desktop-mode"),
            "error"
          );
        }
      });
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (file && isZip(file)) {
          setFile(file);
        }
      });
      const close = (result) => {
        document.removeEventListener("keydown", onKey);
        overlay.remove();
        resolve(result);
      };
      const onKey = (ev) => {
        if (ev.key === "Escape" && !uploading) {
          close(null);
        }
      };
      document.addEventListener("keydown", onKey);
      cancelBtn.addEventListener("click", () => {
        if (uploading) {
          return;
        }
        close(null);
      });
      submitBtn.addEventListener("click", () => {
        if (!pickedFile || uploading) {
          return;
        }
        void runUpload();
      });
      overlay.addEventListener("click", (ev) => {
        if (ev.target === overlay && !uploading) {
          close(null);
        }
      });
      if (prefilled && isZip(prefilled)) {
        setFile(prefilled);
      }
      async function runUpload() {
        if (!pickedFile) {
          return;
        }
        uploading = true;
        submitBtn.setAttribute("busy", "");
        submitBtn.setAttribute("disabled", "");
        cancelBtn.setAttribute("disabled", "");
        showStatus(
          __("Uploading and installing…", "desktop-mode"),
          "info"
        );
        try {
          const result = await uploadPluginZip(pickedFile);
          if (callbacks.onUploaded) {
            callbacks.onUploaded(result);
          }
          void refreshFrameworkMenu();
          showStatus(
            sprintf(
              /* translators: %s: plugin file (e.g. akismet/akismet.php) */
              __("Installed %s. Activate it from the Installed tab.", "desktop-mode"),
              result.plugin_file
            ),
            "success"
          );
          window.setTimeout(() => close(result), 1200);
        } catch (err) {
          uploading = false;
          submitBtn.removeAttribute("busy");
          submitBtn.removeAttribute("disabled");
          cancelBtn.removeAttribute("disabled");
          const message = err instanceof Error ? err.message : String(err);
          showStatus(
            sprintf(
              /* translators: %s: error message from the upload handler */
              __("Upload failed: %s", "desktop-mode"),
              message
            ),
            "error"
          );
        }
      }
      function showStatus(message, tone) {
        status.hidden = false;
        status.dataset.tone = tone;
        status.textContent = message;
      }
      window.setTimeout(() => dropZone.focus(), 16);
    });
  }
  function isZip(file) {
    if (file.size <= 0) {
      return false;
    }
    const name = file.name.toLowerCase();
    if (name.endsWith(".zip")) {
      return true;
    }
    return file.type === "application/zip" || file.type === "application/x-zip-compressed";
  }
  function toast$1(message, duration = 3500) {
    const api2 = window.wp?.desktop;
    if (api2 && typeof api2.showToast === "function") {
      api2.showToast({ message, duration });
      return;
    }
    console.log("[plugins-window]", message);
  }
  function mountBrowseView(host, flyoutEl, bodyEl) {
    host.replaceChildren();
    const state = {
      filter: "featured",
      search: "",
      page: 1,
      totalPages: 0,
      loading: false,
      exhausted: false,
      plugins: [],
      installed: /* @__PURE__ */ new Map(),
      cardsBySlug: /* @__PURE__ */ new Map()
    };
    const toolbar = document.createElement("header");
    toolbar.className = "desktop-mode-plugins__toolbar";
    const left = document.createElement("div");
    left.className = "desktop-mode-plugins__toolbar-left";
    const segmented = document.createElement("wpd-segmented");
    segmented.setAttribute("value", "featured");
    const filters = [
      { value: "featured", label: __("Featured", "desktop-mode") },
      { value: "popular", label: __("Popular", "desktop-mode") },
      { value: "recommended", label: __("Recommended", "desktop-mode") },
      { value: "favorites", label: __("Favorites", "desktop-mode") },
      { value: "new", label: __("New", "desktop-mode") },
      { value: "beta", label: __("Beta", "desktop-mode") }
    ];
    for (const opt of filters) {
      const seg = document.createElement("wpd-segment");
      seg.setAttribute("value", opt.value);
      seg.textContent = opt.label;
      segmented.appendChild(seg);
    }
    segmented.addEventListener("wpd-pick", (ev) => {
      const next = ev.detail?.value ?? "featured";
      state.filter = next;
      void resetAndLoad();
    });
    const search = document.createElement("wpd-text-field");
    search.setAttribute("placeholder", __("Search WordPress.org…", "desktop-mode"));
    let searchDebounce;
    search.addEventListener("wpd-input-change", (ev) => {
      const value = ev.detail?.value ?? "";
      window.clearTimeout(searchDebounce);
      searchDebounce = window.setTimeout(() => {
        state.search = value;
        void resetAndLoad();
      }, 250);
    });
    left.append(segmented, search);
    const right = document.createElement("div");
    right.className = "desktop-mode-plugins__toolbar-trailing";
    const cfg = getConfig();
    if (cfg.caps.upload) {
      const upload = document.createElement("wpd-button");
      upload.setAttribute("variant", "secondary");
      upload.innerHTML = '<span class="dashicons dashicons-upload" aria-hidden="true"></span> ' + __("Upload Plugin", "desktop-mode");
      upload.addEventListener("click", () => {
        void openUploadDialog(bodyEl, null, {
          onUploaded: () => void refreshInstalled()
        });
      });
      right.appendChild(upload);
    }
    toolbar.append(left, right);
    const gallery = document.createElement("div");
    gallery.className = "desktop-mode-plugins__gallery";
    const sentinel = document.createElement("div");
    sentinel.className = "desktop-mode-plugins__gallery-sentinel";
    sentinel.setAttribute("aria-hidden", "true");
    const status = document.createElement("p");
    status.className = "desktop-mode-plugins__gallery-status";
    status.hidden = true;
    host.append(toolbar, gallery, status);
    const dropOverlay = document.createElement("div");
    dropOverlay.className = "desktop-mode-plugins__window-drop";
    dropOverlay.setAttribute("aria-hidden", "true");
    const dropMsg = document.createElement("p");
    dropMsg.textContent = __(
      "Drop the .zip to install.",
      "desktop-mode"
    );
    dropOverlay.appendChild(dropMsg);
    bodyEl.appendChild(dropOverlay);
    let dragDepth = 0;
    const isZipDrag = (ev) => Boolean(
      ev.dataTransfer?.types.includes("Files")
    );
    const onDragEnter = (ev) => {
      if (!cfg.caps.upload) {
        return;
      }
      if (!isZipDrag(ev)) {
        return;
      }
      dragDepth++;
      bodyEl.classList.add("has-zip-dragover");
    };
    const onDragLeave = (ev) => {
      if (!cfg.caps.upload || !isZipDrag(ev)) {
        return;
      }
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) {
        bodyEl.classList.remove("has-zip-dragover");
      }
    };
    const onDragOver = (ev) => {
      if (cfg.caps.upload && isZipDrag(ev)) {
        ev.preventDefault();
      }
    };
    const onDrop = (ev) => {
      if (!cfg.caps.upload) {
        return;
      }
      const file = ev.dataTransfer?.files?.[0];
      dragDepth = 0;
      bodyEl.classList.remove("has-zip-dragover");
      if (!file) {
        return;
      }
      ev.preventDefault();
      void openUploadDialog(bodyEl, file, {
        onUploaded: () => void refreshInstalled()
      });
    };
    bodyEl.addEventListener("dragenter", onDragEnter);
    bodyEl.addEventListener("dragleave", onDragLeave);
    bodyEl.addEventListener("dragover", onDragOver);
    bodyEl.addEventListener("drop", onDrop);
    const teardownDropTargets = installPluginDropTargets();
    const cardCallbacks = {
      onOpen: (slug, hint) => {
        if (!flyoutEl) {
          return;
        }
        openDetailFlyout(flyoutEl, slug, hint, {
          getInstalled: (s) => state.installed.get(s),
          onPluginInstalled: async (pluginFile, slug2) => {
            await refreshInstalled();
            const card = state.cardsBySlug.get(slug2);
            const plugin = state.plugins.find((p) => p.slug === slug2);
            if (card && plugin) {
              repaintCardCta(card, plugin, state.installed, cardCallbacks);
            }
            if (pluginFile) {
              console.log("[plugins-window] installed", pluginFile);
            }
          },
          onPluginActivated: (updated) => {
            state.installed.set(indexKeyFor(updated), updated);
            const card = state.cardsBySlug.get(updated.textdomain ?? "");
            const plugin = state.plugins.find(
              (p) => p.slug === (updated.textdomain ?? "")
            );
            if (card && plugin) {
              repaintCardCta(card, plugin, state.installed, cardCallbacks);
            }
          },
          onPluginDeactivated: (updated) => {
            state.installed.set(indexKeyFor(updated), updated);
            const card = state.cardsBySlug.get(updated.textdomain ?? "");
            const plugin = state.plugins.find(
              (p) => p.slug === (updated.textdomain ?? "")
            );
            if (card && plugin) {
              repaintCardCta(card, plugin, state.installed, cardCallbacks);
            }
          },
          onPluginDeleted: (deleted) => {
            const key = indexKeyFor(deleted);
            state.installed.delete(key);
            const card = state.cardsBySlug.get(deleted.textdomain ?? "");
            const plugin = state.plugins.find(
              (p) => p.slug === (deleted.textdomain ?? "")
            );
            if (card && plugin) {
              repaintCardCta(card, plugin, state.installed, cardCallbacks);
            }
          }
        });
      },
      onInstall: async (plugin, card) => {
        const cta = card.querySelector("[data-plugin-card-cta]");
        const ctaOriginalText = cta?.textContent ?? "";
        cta?.setAttribute("busy", "");
        cta?.setAttribute("disabled", "");
        if (cta) {
          cta.textContent = __("Installing…", "desktop-mode");
        }
        try {
          await installPluginBySlug(plugin.slug);
          await refreshInstalled();
          toast$1(
            sprintf(
              /* translators: %s: plugin name */
              __("Installed %s.", "desktop-mode"),
              plugin.name
            )
          );
          repaintCardCta(card, plugin, state.installed, cardCallbacks);
          void refreshFrameworkMenu();
        } catch (err) {
          cta?.removeAttribute("busy");
          cta?.removeAttribute("disabled");
          if (cta) {
            cta.textContent = ctaOriginalText;
          }
          toast$1(
            sprintf(
              /* translators: %s: error message */
              __("Install failed: %s", "desktop-mode"),
              describe$1(err)
            ),
            6e3
          );
        }
      },
      onActivate: async (installed, card) => {
        const cta = card.querySelector("[data-plugin-card-cta]");
        const ctaOriginalText = cta?.textContent ?? "";
        cta?.setAttribute("busy", "");
        cta?.setAttribute("disabled", "");
        if (cta) {
          cta.textContent = __("Activating…", "desktop-mode");
        }
        try {
          const updated = await activateInstalledPlugin(installed);
          state.installed.set(indexKeyFor(updated), updated);
          toast$1(
            sprintf(
              /* translators: %s: plugin name */
              __("%s activated.", "desktop-mode"),
              updated.name || updated.plugin
            )
          );
          const plugin = state.plugins.find(
            (p) => p.slug === (updated.textdomain ?? "")
          );
          if (plugin) {
            repaintCardCta(card, plugin, state.installed, cardCallbacks);
          }
          void refreshFrameworkMenu();
        } catch (err) {
          cta?.removeAttribute("busy");
          cta?.removeAttribute("disabled");
          if (cta) {
            cta.textContent = ctaOriginalText;
          }
          toast$1(
            sprintf(
              /* translators: %s: error message */
              __("Activation failed: %s", "desktop-mode"),
              describe$1(err)
            ),
            6e3
          );
        }
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void loadMore();
          }
        }
      },
      { root: gallery, rootMargin: "240px", threshold: 0 }
    );
    observer.observe(sentinel);
    void refreshInstalled();
    void resetAndLoad();
    async function refreshInstalled() {
      try {
        const rows = await fetchInstalledPlugins();
        state.installed = new Map(
          rows.map((r) => [indexKeyFor(r), r])
        );
        for (const [slug, card] of state.cardsBySlug) {
          const plugin = state.plugins.find((p) => p.slug === slug);
          if (plugin) {
            repaintCardCta(card, plugin, state.installed, cardCallbacks);
          }
        }
      } catch {
      }
    }
    async function resetAndLoad() {
      state.page = 1;
      state.totalPages = 0;
      state.exhausted = false;
      state.plugins = [];
      state.cardsBySlug.clear();
      gallery.replaceChildren();
      for (let i = 0; i < 6; i++) {
        gallery.appendChild(buildSkeletonCard());
      }
      gallery.appendChild(sentinel);
      await loadMore();
    }
    const inflightSkeletons = [];
    function showInflightLoader() {
      if (inflightSkeletons.length > 0) {
        return;
      }
      for (let i = 0; i < 4; i++) {
        const skel = buildSkeletonCard();
        gallery.insertBefore(skel, sentinel);
        inflightSkeletons.push(skel);
      }
    }
    function clearInflightLoader() {
      for (const skel of inflightSkeletons) {
        skel.remove();
      }
      inflightSkeletons.length = 0;
    }
    async function loadMore() {
      if (state.loading || state.exhausted) {
        return;
      }
      state.loading = true;
      if (state.page > 1) {
        showInflightLoader();
      }
      try {
        const data = await browsePlugins({
          browse: state.search === "" ? state.filter : void 0,
          search: state.search === "" ? void 0 : state.search,
          page: state.page,
          perPage: 24
        });
        if (state.page === 1) {
          gallery.replaceChildren();
          gallery.appendChild(sentinel);
        }
        const info = data.info ?? {};
        if (typeof info.pages === "number" && info.pages > 0) {
          state.totalPages = info.pages;
        }
        const incoming = data.plugins ?? [];
        if (incoming.length === 0) {
          state.exhausted = true;
          if (state.page === 1) {
            showStatus(__("No plugins matched.", "desktop-mode"));
          }
          return;
        }
        for (const plugin of incoming) {
          if (!plugin?.slug) {
            continue;
          }
          if (state.cardsBySlug.has(plugin.slug)) {
            continue;
          }
          const card = buildCard(plugin, state.installed, cardCallbacks);
          makeCardDraggable(card, plugin);
          gallery.insertBefore(card, sentinel);
          state.cardsBySlug.set(plugin.slug, card);
          state.plugins.push(plugin);
        }
        state.page++;
        if (state.totalPages > 0 && state.page > state.totalPages) {
          state.exhausted = true;
        } else if (state.totalPages === 0 && incoming.length < 24) {
          state.exhausted = true;
        }
        hideStatus();
      } catch (err) {
        showStatus(
          sprintf(
            /* translators: %s: error message */
            __("Could not load plugins: %s", "desktop-mode"),
            describe$1(err)
          )
        );
      } finally {
        clearInflightLoader();
        state.loading = false;
      }
    }
    function showStatus(message) {
      status.hidden = false;
      status.textContent = message;
    }
    function hideStatus() {
      status.hidden = true;
      status.textContent = "";
    }
    return () => {
      observer.disconnect();
      bodyEl.removeEventListener("dragenter", onDragEnter);
      bodyEl.removeEventListener("dragleave", onDragLeave);
      bodyEl.removeEventListener("dragover", onDragOver);
      bodyEl.removeEventListener("drop", onDrop);
      dropOverlay.remove();
      teardownDropTargets();
      host.replaceChildren();
    };
  }
  function buildSkeletonCard() {
    const card = document.createElement("wpd-card");
    card.classList.add(
      "desktop-mode-plugins__card",
      "desktop-mode-plugins__card--skeleton"
    );
    card.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 4; i++) {
      const line = document.createElement("span");
      line.className = "desktop-mode-plugins__skeleton-line";
      line.style.width = `${50 + i * 17 % 50}%`;
      card.appendChild(line);
    }
    return card;
  }
  function indexKeyFor(plugin) {
    return plugin.textdomain || plugin.plugin;
  }
  function describe$1(err) {
    if (err instanceof Error) {
      return err.message;
    }
    return String(err);
  }
  function toast(message, duration = 3500) {
    const api2 = window.wp?.desktop;
    if (api2 && typeof api2.showToast === "function") {
      api2.showToast({ message, duration });
      return;
    }
    console.log("[plugins-window]", message);
  }
  async function confirm(opts) {
    const api2 = window.wp?.desktop;
    if (api2 && typeof api2.confirm === "function") {
      return api2.confirm(opts);
    }
    return Promise.resolve(true);
  }
  function mountInstalledView(host) {
    host.replaceChildren();
    const state = {
      rows: [],
      statusFilter: "",
      search: "",
      loading: true
    };
    const toolbar = document.createElement("header");
    toolbar.className = "desktop-mode-plugins__toolbar";
    const left = document.createElement("div");
    left.className = "desktop-mode-plugins__toolbar-left";
    const statusFilter = document.createElement("wpd-segmented");
    statusFilter.setAttribute("value", "");
    const statusOptions = [
      { value: "", label: __("All", "desktop-mode") },
      { value: "active", label: __("Active", "desktop-mode") },
      { value: "inactive", label: __("Inactive", "desktop-mode") },
      { value: "update", label: __("Update available", "desktop-mode") }
    ];
    for (const opt of statusOptions) {
      const seg = document.createElement("wpd-segment");
      seg.setAttribute("value", opt.value);
      seg.textContent = opt.label;
      statusFilter.appendChild(seg);
    }
    statusFilter.addEventListener("wpd-pick", (ev) => {
      const detail = ev.detail;
      state.statusFilter = detail?.value ?? "";
      paintTable();
    });
    const search = document.createElement("wpd-text-field");
    search.setAttribute(
      "placeholder",
      __("Search installed plugins…", "desktop-mode")
    );
    let searchDebounce;
    search.addEventListener("wpd-input-change", (ev) => {
      const value = ev.detail?.value ?? "";
      window.clearTimeout(searchDebounce);
      searchDebounce = window.setTimeout(() => {
        state.search = value;
        paintTable();
      }, 200);
    });
    left.append(statusFilter, search);
    const right = document.createElement("div");
    right.className = "desktop-mode-plugins__toolbar-right";
    const bulkBar = document.createElement("div");
    bulkBar.className = "desktop-mode-plugins__bulk";
    bulkBar.hidden = true;
    right.appendChild(bulkBar);
    const trailing = document.createElement("div");
    trailing.className = "desktop-mode-plugins__toolbar-trailing";
    const refreshButton = document.createElement("wpd-button");
    refreshButton.setAttribute("variant", "ghost");
    refreshButton.setAttribute("title", __("Refresh", "desktop-mode"));
    refreshButton.innerHTML = '<span class="dashicons dashicons-update" aria-hidden="true"></span>';
    refreshButton.addEventListener("click", () => {
      void reload();
    });
    trailing.appendChild(refreshButton);
    toolbar.append(left, right, trailing);
    const tableWrap = document.createElement("div");
    tableWrap.className = "desktop-mode-plugins__body";
    const table = document.createElement("wpd-table");
    table.setAttribute("selectable", "multi");
    table.setAttribute("sticky-header", "");
    table.setAttribute("sticky-columns", "1");
    table.setAttribute("hover", "");
    table.setAttribute("striped", "");
    table.setAttribute("bordered", "");
    table.setAttribute("loading", "");
    const empty = document.createElement("div");
    empty.setAttribute("slot", "empty");
    empty.className = "desktop-mode-plugins__empty";
    empty.innerHTML = '<span class="dashicons dashicons-admin-plugins" aria-hidden="true"></span><p>' + __("No plugins match your filters.", "desktop-mode") + "</p>";
    table.appendChild(empty);
    const getRowId = (row, index) => row.plugin || String(index);
    table.getRowId = getRowId;
    table.columns = buildColumns();
    tableWrap.appendChild(table);
    host.append(toolbar, tableWrap);
    const selectionListener = (ev) => {
      const detail = ev.detail;
      const ids = detail?.selection ?? [];
      paintBulkBar(ids);
    };
    table.addEventListener("wpd-table-selection-change", selectionListener);
    void reload();
    function buildColumns() {
      const cfg = getConfig();
      const cols = [
        {
          key: "name",
          label: __("Plugin", "desktop-mode"),
          sortable: true,
          sticky: true,
          render: (_value, row) => renderNameCell(row)
        },
        {
          key: "status",
          label: __("Status", "desktop-mode"),
          sortable: true,
          render: (_value, row) => renderStatusCell(row)
        },
        {
          key: "version",
          label: __("Version", "desktop-mode"),
          sortable: true,
          render: (_value, row) => renderVersionCell(row)
        },
        {
          key: "author",
          label: __("Author", "desktop-mode"),
          render: (_value, row) => renderAuthorCell(row)
        },
        {
          key: "desktop_mode_size_kb",
          label: __("Size", "desktop-mode"),
          align: "end",
          sortable: true,
          sortValue: (row) => row.desktop_mode_size_kb ?? 0,
          render: (_value, row) => formatSize(row.desktop_mode_size_kb ?? null)
        },
        {
          key: "_actions",
          label: "",
          align: "end",
          render: (_value, row) => renderActionsCell(row)
        }
      ];
      return cfg.caps.activate || cfg.caps.delete ? cols : cols.slice(0, -1);
    }
    function renderNameCell(row) {
      const wrap = document.createElement("div");
      wrap.style.cssText = "display:flex;align-items:center;gap:12px;min-width:0;padding:4px 0;";
      const icon = document.createElement("div");
      icon.style.cssText = "flex:0 0 32px;width:32px;height:32px;max-width:32px;max-height:32px;border-radius:6px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.04);box-sizing:border-box;";
      const url = row.desktop_mode_icon_url;
      if (url) {
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        img.style.cssText = "width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;display:block;";
        img.addEventListener("error", () => {
          icon.replaceChildren(buildFallbackIcon());
        });
        icon.appendChild(img);
      } else {
        icon.appendChild(buildFallbackIcon());
      }
      const text = document.createElement("div");
      text.style.cssText = "display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto;line-height:1.35;";
      const title = document.createElement("strong");
      title.textContent = row.name || row.plugin;
      title.style.cssText = "display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
      const path = document.createElement("span");
      path.textContent = row.plugin;
      path.style.cssText = "display:block;font-size:0.78em;color:#888;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
      text.append(title, path);
      wrap.append(icon, text);
      return wrap;
    }
    function buildFallbackIcon() {
      const fallback = document.createElement("span");
      fallback.className = "dashicons dashicons-admin-plugins";
      fallback.setAttribute("aria-hidden", "true");
      fallback.style.cssText = "font-size:18px;width:18px;height:18px;line-height:18px;color:#888;";
      return fallback;
    }
    function renderStatusCell(row) {
      const badge = document.createElement("span");
      const isActive = row.status === "active" || row.status === "active-network";
      const dot = isActive ? "#16a34a" : "#9ca3af";
      const bg = isActive ? "rgba(22, 163, 74, 0.14)" : "rgba(120, 120, 120, 0.12)";
      const fg = isActive ? "#166e37" : "#555";
      badge.style.cssText = `display:inline-flex;align-items:center;gap:6px;padding:2px 10px 2px 8px;border-radius:999px;font-size:0.78em;font-weight:600;line-height:1.4;white-space:nowrap;background:${bg};color:${fg};`;
      const dotEl = document.createElement("span");
      dotEl.style.cssText = `width:6px;height:6px;border-radius:50%;background:${dot};flex:0 0 auto;display:inline-block;`;
      badge.appendChild(dotEl);
      const label = document.createElement("span");
      label.textContent = isActive ? __("Active", "desktop-mode") : __("Inactive", "desktop-mode");
      badge.appendChild(label);
      return badge;
    }
    function renderVersionCell(row) {
      const wrap = document.createElement("div");
      wrap.style.cssText = "display:flex;align-items:center;gap:6px;flex-wrap:wrap;";
      const v = document.createElement("span");
      v.textContent = row.version ?? "—";
      wrap.appendChild(v);
      const update = row.desktop_mode_update_available;
      if (update?.available && update.new_version) {
        const badge = document.createElement("span");
        badge.style.cssText = "font-size:0.78em;background:rgba(245,175,0,0.18);color:#915f00;padding:1px 7px;border-radius:999px;font-weight:600;";
        badge.textContent = sprintf(
          /* translators: %s: new plugin version */
          __("→ %s", "desktop-mode"),
          update.new_version
        );
        wrap.appendChild(badge);
      }
      return wrap;
    }
    function renderAuthorCell(row) {
      const wrap = document.createElement("span");
      wrap.style.cssText = "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;";
      const text = stripHtml(row.author ?? "");
      wrap.textContent = text || __("Unknown", "desktop-mode");
      return wrap;
    }
    function renderActionsCell(row) {
      const wrap = document.createElement("div");
      wrap.style.cssText = "display:inline-flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:nowrap;";
      wrap.setAttribute("data-noclick", "");
      const can = row.desktop_mode_can_manage ?? {
        activate: row.status === "inactive",
        deactivate: row.status === "active" || row.status === "active-network",
        delete: row.status === "inactive"
      };
      if (can.activate) {
        const btn = button2(__("Activate", "desktop-mode"), "primary");
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          void runActivate(row);
        });
        wrap.appendChild(btn);
      } else if (can.deactivate) {
        const btn = button2(__("Deactivate", "desktop-mode"), "secondary");
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          void runDeactivate(row);
        });
        wrap.appendChild(btn);
      }
      if (can.delete) {
        const btn = button2(__("Delete", "desktop-mode"), "danger");
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          void runDelete(row);
        });
        wrap.appendChild(btn);
      }
      return wrap;
    }
    function button2(label, variant) {
      const b = document.createElement("wpd-button");
      b.setAttribute("variant", variant);
      b.setAttribute("size", "small");
      b.textContent = label;
      return b;
    }
    function paintBulkBar(ids) {
      bulkBar.replaceChildren();
      if (ids.length === 0) {
        bulkBar.hidden = true;
        return;
      }
      bulkBar.hidden = false;
      const count = document.createElement("span");
      count.className = "desktop-mode-plugins__bulk-count";
      count.textContent = sprintf(
        /* translators: %d: number of selected plugins */
        __("%d selected", "desktop-mode"),
        ids.length
      );
      bulkBar.appendChild(count);
      const cfg = getConfig();
      const selected = state.rows.filter((r) => ids.includes(r.plugin));
      if (cfg.caps.activate) {
        const activatable = selected.filter((r) => r.status === "inactive");
        if (activatable.length > 0) {
          const btn = button2(__("Activate", "desktop-mode"), "primary");
          btn.addEventListener("click", () => {
            void runBulk(activatable, "activate");
          });
          bulkBar.appendChild(btn);
        }
        const deactivatable = selected.filter(
          (r) => r.status === "active" || r.status === "active-network"
        );
        if (deactivatable.length > 0) {
          const btn = button2(__("Deactivate", "desktop-mode"), "secondary");
          btn.addEventListener("click", () => {
            void runBulk(deactivatable, "deactivate");
          });
          bulkBar.appendChild(btn);
        }
      }
      if (cfg.caps.delete) {
        const deletable = selected.filter((r) => r.status === "inactive");
        if (deletable.length > 0) {
          const btn = button2(__("Delete", "desktop-mode"), "danger");
          btn.addEventListener("click", () => {
            void runBulk(deletable, "delete");
          });
          bulkBar.appendChild(btn);
        }
      }
    }
    async function reload() {
      state.loading = true;
      table.setAttribute("loading", "");
      try {
        state.rows = await fetchInstalledPlugins();
      } catch (err) {
        toast(
          sprintf(
            /* translators: %s: error message */
            __("Could not load plugins: %s", "desktop-mode"),
            describe(err)
          ),
          6e3
        );
        state.rows = [];
      }
      state.loading = false;
      paintTable();
    }
    function paintTable() {
      if (state.loading) {
        table.setAttribute("loading", "");
      } else {
        table.removeAttribute("loading");
      }
      table.data = filterRows(state.rows);
    }
    function filterRows(rows) {
      const q = state.search.trim().toLowerCase();
      const status = state.statusFilter;
      return rows.filter((row) => {
        if (status === "active") {
          if (row.status !== "active" && row.status !== "active-network") {
            return false;
          }
        } else if (status === "inactive") {
          if (row.status !== "inactive") {
            return false;
          }
        } else if (status === "update") {
          if (!row.desktop_mode_update_available?.available) {
            return false;
          }
        }
        if (q !== "") {
          const haystack = `${row.name ?? ""} ${row.plugin} ${stripHtml(row.author ?? "")}`.toLowerCase();
          if (!haystack.includes(q)) {
            return false;
          }
        }
        return true;
      });
    }
    async function runActivate(row) {
      const previous = row.status;
      applyStatusOptimistic(row, "active");
      try {
        const updated = await activateInstalledPlugin(row);
        mergeRow(updated);
        toast(
          sprintf(
            /* translators: %s: plugin name */
            __("%s activated.", "desktop-mode"),
            row.name || row.plugin
          )
        );
        void refreshFrameworkMenu();
      } catch (err) {
        applyStatusOptimistic(row, previous);
        toast(
          sprintf(
            /* translators: %s: error message */
            __("Activation failed: %s", "desktop-mode"),
            describe(err)
          ),
          6e3
        );
      }
    }
    async function runDeactivate(row) {
      const previous = row.status;
      applyStatusOptimistic(row, "inactive");
      try {
        const updated = await deactivateInstalledPlugin(row);
        mergeRow(updated);
        if (isDesktopModeSelf(row.plugin)) {
          toast(
            __(
              "Desktop Mode deactivated. Reloading…",
              "desktop-mode"
            ),
            2e3
          );
          reloadOutOfDesktopMode();
          return;
        }
        toast(
          sprintf(
            /* translators: %s: plugin name */
            __("%s deactivated.", "desktop-mode"),
            row.name || row.plugin
          )
        );
        void refreshFrameworkMenu();
      } catch (err) {
        applyStatusOptimistic(row, previous);
        toast(
          sprintf(
            /* translators: %s: error message */
            __("Deactivation failed: %s", "desktop-mode"),
            describe(err)
          ),
          6e3
        );
      }
    }
    async function runDelete(row) {
      const ok = await confirm({
        title: __("Delete plugin?", "desktop-mode"),
        message: sprintf(
          /* translators: %s: plugin name */
          __(
            "Permanently delete %s? Its files will be removed from disk. This cannot be undone.",
            "desktop-mode"
          ),
          row.name || row.plugin
        ),
        confirmLabel: __("Delete", "desktop-mode"),
        danger: true
      });
      if (!ok) {
        return;
      }
      try {
        await deleteInstalledPlugin(row);
        state.rows = state.rows.filter((r) => r.plugin !== row.plugin);
        paintTable();
        if (isDesktopModeSelf(row.plugin)) {
          toast(
            __(
              "Desktop Mode deleted. Reloading…",
              "desktop-mode"
            ),
            2e3
          );
          reloadOutOfDesktopMode();
          return;
        }
        toast(
          sprintf(
            /* translators: %s: plugin name */
            __("%s deleted.", "desktop-mode"),
            row.name || row.plugin
          )
        );
        void refreshFrameworkMenu();
      } catch (err) {
        toast(
          sprintf(
            /* translators: %s: error message */
            __("Delete failed: %s", "desktop-mode"),
            describe(err)
          ),
          6e3
        );
      }
    }
    async function runBulk(rows, action) {
      if (rows.length === 0) {
        return;
      }
      if (action === "delete") {
        const ok = await confirm({
          title: __("Delete selected plugins?", "desktop-mode"),
          message: sprintf(
            /* translators: %d: number of plugins */
            __(
              "Permanently delete %d plugin(s)? Their files will be removed from disk. This cannot be undone.",
              "desktop-mode"
            ),
            rows.length
          ),
          confirmLabel: __("Delete", "desktop-mode"),
          danger: true
        });
        if (!ok) {
          return;
        }
      }
      let succeeded = 0;
      let selfMutated = false;
      const failures = [];
      for (const row of rows) {
        try {
          if (action === "activate") {
            mergeRow(await activateInstalledPlugin(row));
          } else if (action === "deactivate") {
            mergeRow(await deactivateInstalledPlugin(row));
          } else if (action === "delete") {
            await deleteInstalledPlugin(row);
            state.rows = state.rows.filter((r) => r.plugin !== row.plugin);
          }
          if ((action === "deactivate" || action === "delete") && isDesktopModeSelf(row.plugin)) {
            selfMutated = true;
          }
          succeeded++;
        } catch (err) {
          failures.push({ row, err });
        }
      }
      paintTable();
      table.clearSelection();
      if (selfMutated) {
        toast(
          action === "delete" ? __("Desktop Mode deleted. Reloading…", "desktop-mode") : __("Desktop Mode deactivated. Reloading…", "desktop-mode"),
          2e3
        );
        reloadOutOfDesktopMode();
        return;
      }
      void refreshFrameworkMenu();
      let noun = "";
      if (action === "delete") {
        noun = __("deleted", "desktop-mode");
      } else if (action === "activate") {
        noun = __("activated", "desktop-mode");
      } else {
        noun = __("deactivated", "desktop-mode");
      }
      const summary = failures.length === 0 ? sprintf(
        /* translators: 1: count, 2: action verb (activated, deactivated, deleted) */
        __("%1$d plugin(s) %2$s.", "desktop-mode"),
        succeeded,
        noun
      ) : sprintf(
        /* translators: 1: success count, 2: failure count, 3: action verb */
        __("%1$d %3$s, %2$d failed.", "desktop-mode"),
        succeeded,
        failures.length,
        noun
      );
      toast(summary, 5e3);
    }
    function applyStatusOptimistic(row, next) {
      row.status = next;
      paintTable();
    }
    function mergeRow(updated) {
      const idx = state.rows.findIndex((r) => r.plugin === updated.plugin);
      if (idx >= 0) {
        state.rows[idx] = { ...state.rows[idx], ...updated };
      } else {
        state.rows.push(updated);
      }
      paintTable();
    }
    return () => {
      table.removeEventListener("wpd-table-selection-change", selectionListener);
      host.replaceChildren();
    };
  }
  function formatSize(kb) {
    if (kb === null || kb === void 0) {
      return "—";
    }
    if (kb < 1024) {
      return sprintf(
        /* translators: %d: size in kilobytes */
        __("%d KB", "desktop-mode"),
        kb
      );
    }
    const mb = kb / 1024;
    return sprintf(
      /* translators: %s: size in megabytes (one decimal) */
      __("%s MB", "desktop-mode"),
      mb.toFixed(1)
    );
  }
  function stripHtml(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent ?? "";
  }
  function describe(err) {
    if (err instanceof Error) {
      return err.message;
    }
    return String(err);
  }
  const _initial = {
    tab: null,
    requestedAt: 0
  };
  let _store = null;
  function getStore() {
    if (_store) {
      return _store;
    }
    const w = window;
    const factory = w.wp?.desktop?.createSharedStore;
    if (typeof factory !== "function") {
      return null;
    }
    _store = factory(
      "desktop-mode/plugins-window/tab-target",
      () => ({ ..._initial })
    );
    return _store;
  }
  function consumePluginsWindowTab() {
    const store = getStore();
    if (store) {
      const tab = store.state.tab;
      if (tab !== null) {
        store.state.tab = null;
        store.state.requestedAt = 0;
        store.notify();
      }
      return tab;
    }
    const w = window;
    const prev = w._wpdPluginsWindowTab;
    if (prev) {
      w._wpdPluginsWindowTab = { tab: null, requestedAt: 0 };
      return prev.tab;
    }
    return null;
  }
  function subscribePluginsWindowTab(cb) {
    const store = getStore();
    if (!store) {
      return () => {
      };
    }
    return store.subscribe((state) => cb({ ...state }));
  }
  function renderPluginsWindow(body) {
    const root = body.querySelector(
      "[data-desktop-mode-plugins-root]"
    );
    if (!root) {
      body.innerHTML = '<p style="padding:20px;color:var(--wpd-fg-muted,#666);">' + __("Plugins window template missing.", "desktop-mode") + "</p>";
      return;
    }
    const config = getConfig();
    const tabs = root.querySelector(
      "[data-desktop-mode-plugins-tabs]"
    );
    const installedHost = root.querySelector(
      "[data-desktop-mode-plugins-installed-host]"
    );
    let installedTeardown = null;
    if (installedHost) {
      if (config.caps.activate) {
        installedTeardown = mountInstalledView(installedHost);
      } else {
        installedHost.replaceChildren();
        const msg = document.createElement("p");
        msg.style.padding = "20px";
        msg.style.color = "var(--wpd-fg-muted, #666)";
        msg.textContent = __(
          "You do not have permission to manage plugins.",
          "desktop-mode"
        );
        installedHost.appendChild(msg);
      }
    }
    const browseHost = root.querySelector(
      "[data-desktop-mode-plugins-browse-host]"
    );
    const flyout = root.querySelector(
      "[data-desktop-mode-plugins-flyout]"
    );
    let browseTeardown = null;
    if (browseHost && config.caps.install) {
      browseTeardown = mountBrowseView(browseHost, flyout, body);
    }
    const applyTab = (tab) => {
      if (!tabs) {
        return;
      }
      if (tab === "browse" && !config.caps.install) {
        tabs.setAttribute("value", "installed");
        return;
      }
      tabs.setAttribute("value", tab);
    };
    const initialTab = consumePluginsWindowTab();
    if (initialTab) {
      applyTab(initialTab);
    }
    const unsubscribeTab = subscribePluginsWindowTab((state) => {
      if (state.tab) {
        applyTab(state.tab);
      }
    });
    const onClosed = (ev) => {
      const detail = ev.detail;
      if (detail?.windowId !== "desktop-mode-plugins") {
        return;
      }
      document.removeEventListener("desktop-mode-window-closed", onClosed);
      unsubscribeTab();
      if (installedTeardown) {
        installedTeardown();
        installedTeardown = null;
      }
      if (browseTeardown) {
        browseTeardown();
        browseTeardown = null;
      }
    };
    document.addEventListener("desktop-mode-window-closed", onClosed);
    void maybeShowIntro(config);
  }
  let _introShown = false;
  async function maybeShowIntro(config) {
    if (_introShown || config.introSeen) {
      return;
    }
    _introShown = true;
    try {
      const { showPluginsIntroDialog: showPluginsIntroDialog2 } = await Promise.resolve().then(() => introDialog);
      const result = await showPluginsIntroDialog2();
      if (result === "cancel") {
        _introShown = false;
        return;
      }
      void markIntroSeen(config);
      if (result === "settings") {
        openOsSettingsFeatures();
      }
    } catch {
      _introShown = false;
    }
  }
  async function markIntroSeen(config) {
    if (!config.introUrl) {
      return;
    }
    try {
      await trackedFetch(
        config.introUrl,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-WP-Nonce": config.restNonce
          },
          body: JSON.stringify({ slug: "plugins" })
        },
        {
          windowId: "desktop-mode-plugins",
          source: "plugins-window/intro"
        }
      );
      config.introSeen = true;
    } catch {
    }
  }
  function openOsSettingsFeatures() {
    const api2 = window.wp?.desktop;
    if (typeof api2?.openOsSettings === "function") {
      api2.openOsSettings("features");
    }
  }
  const registry = window.desktopModeNativeWindows ?? (window.desktopModeNativeWindows = {});
  registry["desktop-mode-plugins"] = (body) => {
    renderPluginsWindow(body);
  };
  async function showPluginsIntroDialog() {
    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = "desktop-mode-plugins-intro__backdrop";
      backdrop.setAttribute("role", "presentation");
      Object.assign(backdrop.style, {
        position: "fixed",
        inset: "0",
        background: "color-mix(in srgb, var(--wp-admin-theme-color, #1d2327) 60%, transparent)",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
        zIndex: "100000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px"
      });
      const dialog = document.createElement("div");
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", "desktop-mode-plugins-intro-title");
      dialog.className = "desktop-mode-plugins-intro";
      Object.assign(dialog.style, {
        background: "var(--wp-admin-theme-bg, #fff)",
        color: "var(--wp-admin-theme-fg, #1d2327)",
        borderRadius: "14px",
        boxShadow: "0 24px 60px rgba(0,0,0,.28)",
        maxWidth: "560px",
        width: "100%",
        maxHeight: "90vh",
        overflow: "auto",
        padding: "28px 32px 24px",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
      });
      dialog.innerHTML = renderDialogMarkup();
      backdrop.appendChild(dialog);
      document.body.appendChild(backdrop);
      const primaryBtn = dialog.querySelector(
        '[data-action="confirm"]'
      );
      const settingsBtn = dialog.querySelector(
        '[data-action="settings"]'
      );
      primaryBtn?.focus();
      let resolved = false;
      const cleanup = (result) => {
        if (resolved) {
          return;
        }
        resolved = true;
        document.removeEventListener("keydown", onKey, true);
        backdrop.remove();
        resolve(result);
      };
      const onKey = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          cleanup("cancel");
        }
      };
      document.addEventListener("keydown", onKey, true);
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) {
          cleanup("cancel");
        }
      });
      primaryBtn?.addEventListener("click", () => cleanup("confirm"));
      settingsBtn?.addEventListener("click", () => cleanup("settings"));
    });
  }
  function renderDialogMarkup() {
    const title = __("Welcome to the new Plugins window", "desktop-mode");
    const lede = __(
      "You're looking at the redesigned Plugins admin — same WordPress.org repository under the hood, with a workflow tuned for how Desktop Mode wants you to work.",
      "desktop-mode"
    );
    const highlights = [
      __(
        "Two tabs in one window — Installed for managing what you have, Browse for discovering new plugins. No more bouncing between Plugins → Add New → back to Installed.",
        "desktop-mode"
      ),
      __(
        "A real gallery on Browse — clean cards with rating, install count, last updated, and a click-anywhere detail flyout. Subtle hover lift, lazy-loaded icons, infinite scroll.",
        "desktop-mode"
      ),
      __(
        "The detail flyout shows screenshots, the ratings histogram, recent reviews, the changelog and FAQ — all without leaving the window.",
        "desktop-mode"
      ),
      __(
        "Drag a .zip onto the window to install — or drag a Browse card straight to the dock to pin a shortcut. The framework drag bridge handles the rest.",
        "desktop-mode"
      ),
      __(
        'The dock repaints LIVE after every install / activate / deactivate / delete. No reload, no stale tile, no "wait, did that work?".',
        "desktop-mode"
      ),
      __(
        "Per-row capability flags so the UI hides actions you can't perform — and the server re-validates every mutation, so flags can't be tampered into more permissions.",
        "desktop-mode"
      )
    ];
    const li = (arr) => arr.map(
      (s) => `<li><span class="dot" aria-hidden="true"></span>${escapeHtml(
        s
      )}</li>`
    ).join("");
    return `
		<style>
			.desktop-mode-plugins-intro h2 {
				margin: 0 0 8px;
				font-size: 22px;
				font-weight: 600;
				letter-spacing: -0.01em;
			}
			.desktop-mode-plugins-intro p.lede {
				margin: 0 0 20px;
				color: var(--wp-admin-theme-fg-muted, #50575e);
				font-size: 14px;
				line-height: 1.5;
			}
			.desktop-mode-plugins-intro__list {
				list-style: none;
				margin: 0 0 22px;
				padding: 0;
				font-size: 14px;
				line-height: 1.5;
			}
			.desktop-mode-plugins-intro__list li {
				display: flex;
				align-items: flex-start;
				gap: 10px;
				padding: 6px 0;
			}
			.desktop-mode-plugins-intro__list .dot {
				flex: 0 0 auto;
				width: 6px;
				height: 6px;
				margin-top: 9px;
				border-radius: 50%;
				background: var(--wp-admin-theme-color, #2271b1);
			}
			.desktop-mode-plugins-intro__footer {
				display: flex;
				justify-content: flex-end;
				gap: 8px;
				margin-top: 8px;
			}
			.desktop-mode-plugins-intro__footer button {
				appearance: none;
				border: 1px solid var(--wp-admin-theme-border, #dcdcde);
				background: var(--wp-admin-theme-bg, #fff);
				color: inherit;
				padding: 8px 14px;
				border-radius: 6px;
				font-size: 13px;
				cursor: pointer;
			}
			.desktop-mode-plugins-intro__footer button.primary {
				border-color: var(--wp-admin-theme-color, #2271b1);
				background: var(--wp-admin-theme-color, #2271b1);
				color: #fff;
				font-weight: 500;
			}
			.desktop-mode-plugins-intro__footer button:hover {
				filter: brightness(1.05);
			}
			.desktop-mode-plugins-intro__footer button:focus-visible {
				outline: 2px solid var(--wp-admin-theme-color, #2271b1);
				outline-offset: 2px;
			}
		</style>
		<h2 id="desktop-mode-plugins-intro-title">${escapeHtml(title)}</h2>
		<p class="lede">${escapeHtml(lede)}</p>
		<ul class="desktop-mode-plugins-intro__list">${li(highlights)}</ul>
		<div class="desktop-mode-plugins-intro__footer">
			<button type="button" data-action="settings">${escapeHtml(
      __("Take me to settings", "desktop-mode")
    )}</button>
			<button type="button" class="primary" data-action="confirm">${escapeHtml(
      __("Got it", "desktop-mode")
    )}</button>
		</div>
	`;
  }
  function escapeHtml(s) {
    const t = document.createElement("div");
    t.textContent = s;
    return t.innerHTML;
  }
  const introDialog = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    showPluginsIntroDialog
  }, Symbol.toStringTag, { value: "Module" }));
})();
