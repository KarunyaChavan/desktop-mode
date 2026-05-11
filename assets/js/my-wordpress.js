(function() {
  "use strict";
  const TEXT_DOMAIN = "desktop-mode";
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
  function getWpHooks() {
    const hooks = window.wp?.hooks;
    if (!hooks) {
      throw new Error(
        "[desktop-mode] `window.wp.hooks` is not available. The plugin declares `wp-hooks` as a script dependency; if you are seeing this error, verify the enqueue order."
      );
    }
    return hooks;
  }
  function applyFilters(hookName, value, ...args) {
    return getWpHooks().applyFilters(hookName, value, ...args);
  }
  function doAction(hookName, ...args) {
    getWpHooks().doAction(hookName, ...args);
  }
  const MENU_CLASS = "desktop-mode-icon-canvas-menu";
  let activeMenu = null;
  let activeFlyout = null;
  let activeCanvas = null;
  let outsideHandler = null;
  let escHandler = null;
  function attachIconCanvasMenu(canvas, deps) {
    deps.openOnBackgroundClick !== false;
    const onContextMenu = (e) => {
      if (isInsideTile(e.target) || isInsideMenu(e.target)) {
        return;
      }
      e.preventDefault();
      toggle(e.clientX, e.clientY);
    };
    const toggle = (x, y) => {
      if (activeCanvas === canvas && activeMenu) {
        closeMenu();
        return;
      }
      const items = buildItems(deps);
      const filtered = applyFilters(
        "desktop-mode.icon-canvas.menu",
        items,
        deps.scope
      );
      const finalItems = Array.isArray(filtered) ? filtered : items;
      openMenu(finalItems, { x, y }, canvas);
    };
    canvas.addEventListener("contextmenu", onContextMenu);
    return {
      dispose: () => {
        canvas.removeEventListener("contextmenu", onContextMenu);
        closeMenu();
      }
    };
  }
  function isInsideTile(target) {
    if (!(target instanceof Element)) {
      return false;
    }
    return target.closest(".desktop-mode-file-tile") !== null;
  }
  function isInsideMenu(target) {
    if (!(target instanceof Element)) {
      return false;
    }
    return target.closest(`.${MENU_CLASS}`) !== null;
  }
  function buildItems(deps) {
    const sortItem = {
      id: "sort-by",
      label: __("Sort by", "desktop-mode"),
      icon: "dashicons-sort",
      sort: 10,
      children: [
        {
          id: "sort-name-asc",
          label: __("Name (A → Z)", "desktop-mode"),
          sort: 10,
          onClick: () => deps.onSort("name-asc")
        },
        {
          id: "sort-name-desc",
          label: __("Name (Z → A)", "desktop-mode"),
          sort: 20,
          onClick: () => deps.onSort("name-desc")
        },
        {
          id: "sort-date-desc",
          label: __("Newest first", "desktop-mode"),
          sort: 30,
          onClick: () => deps.onSort("date-desc")
        },
        {
          id: "sort-date-asc",
          label: __("Oldest first", "desktop-mode"),
          sort: 40,
          onClick: () => deps.onSort("date-asc")
        }
      ]
    };
    const items = [sortItem];
    if (Array.isArray(deps.extraItems)) {
      items.push(...deps.extraItems);
    }
    return items;
  }
  function sortItems(items) {
    return items.slice().sort((a, b) => {
      const sa = typeof a.sort === "number" ? a.sort : 100;
      const sb = typeof b.sort === "number" ? b.sort : 100;
      if (sa !== sb) {
        return sa - sb;
      }
      return a.label.localeCompare(b.label);
    });
  }
  function openMenu(items, pos, canvas) {
    closeMenu();
    if (items.length === 0) {
      return;
    }
    activeCanvas = canvas;
    const sorted = sortItems(items);
    const menu = document.createElement("wpd-context-menu");
    menu.setAttribute("open", "");
    menu.classList.add(MENU_CLASS);
    menu.style.left = `${pos.x}px`;
    menu.style.top = `${pos.y}px`;
    const itemById = /* @__PURE__ */ new Map();
    for (const item of sorted) {
      itemById.set(item.id, item);
      const opt = appendOption(menu, item);
      if (hasChildren(item)) {
        opt.addEventListener("mouseenter", () => {
          openFlyout(item, opt);
        });
      }
    }
    menu.addEventListener("wpd-context-menu-pick", (e) => {
      const detail = e.detail;
      const item = itemById.get(detail.id);
      if (!item) {
        return;
      }
      if (hasChildren(item)) {
        e.stopPropagation();
        const anchor = menu.querySelector(
          `[data-menu-item-id="${item.id}"]`
        );
        if (anchor) {
          openFlyout(item, anchor);
        }
        return;
      }
      closeMenu();
      item.onClick?.();
    });
    document.body.appendChild(menu);
    activeMenu = menu;
    clampToViewport(menu);
    queueMicrotask(() => {
      outsideHandler = (e) => {
        if (isInsideMenu(e.target)) {
          return;
        }
        closeMenu();
      };
      escHandler = (e) => {
        if (e.key === "Escape") {
          closeMenu();
        }
      };
      document.addEventListener("mousedown", outsideHandler);
      document.addEventListener("keydown", escHandler);
    });
  }
  function appendOption(host, item) {
    const opt = document.createElement("wpd-context-menu-option");
    opt.dataset.menuItemId = item.id;
    opt.setAttribute("value", item.id);
    if (item.heading) {
      opt.setAttribute("heading", "");
    }
    if (item.disabled) {
      opt.setAttribute("disabled", "");
    }
    if (item.icon) {
      opt.setAttribute("icon", sanitizeClass$1(item.icon));
    }
    if (hasChildren(item)) {
      opt.setAttribute("has-children", "");
    }
    opt.textContent = item.label;
    host.appendChild(opt);
    return opt;
  }
  function openFlyout(parent, anchor) {
    closeFlyout();
    if (!hasChildren(parent)) {
      return;
    }
    const fly = document.createElement("wpd-context-menu");
    fly.setAttribute("open", "");
    fly.classList.add(MENU_CLASS, `${MENU_CLASS}--flyout`);
    const childById = /* @__PURE__ */ new Map();
    for (const child of sortItems(parent.children ?? [])) {
      childById.set(child.id, child);
      appendOption(fly, child);
    }
    fly.addEventListener("wpd-context-menu-pick", (e) => {
      const detail = e.detail;
      const child = childById.get(detail.id);
      if (!child) {
        return;
      }
      e.stopPropagation();
      closeMenu();
      child.onClick?.();
    });
    document.body.appendChild(fly);
    activeFlyout = fly;
    positionFlyout(fly, anchor);
  }
  function positionFlyout(fly, anchor) {
    const ar = anchor.getBoundingClientRect();
    fly.style.position = "fixed";
    fly.style.left = `${ar.right}px`;
    fly.style.top = `${ar.top}px`;
    const fr = fly.getBoundingClientRect();
    if (fr.right > window.innerWidth) {
      fly.style.left = `${Math.max(0, ar.left - fr.width)}px`;
    }
    if (fr.bottom > window.innerHeight) {
      fly.style.top = `${Math.max(0, window.innerHeight - fr.height - 8)}px`;
    }
  }
  function clampToViewport(menu) {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${Math.max(0, window.innerWidth - rect.width - 8)}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${Math.max(0, window.innerHeight - rect.height - 8)}px`;
    }
  }
  function hasChildren(item) {
    return Array.isArray(item.children) && item.children.length > 0;
  }
  function closeFlyout() {
    if (activeFlyout) {
      activeFlyout.remove();
      activeFlyout = null;
    }
  }
  function closeMenu() {
    closeFlyout();
    if (activeMenu) {
      activeMenu.remove();
      activeMenu = null;
    }
    activeCanvas = null;
    if (outsideHandler) {
      document.removeEventListener("mousedown", outsideHandler);
      outsideHandler = null;
    }
    if (escHandler) {
      document.removeEventListener("keydown", escHandler);
      escHandler = null;
    }
  }
  function sanitizeClass$1(raw) {
    return raw.replace(/[^a-zA-Z0-9_-]/g, "");
  }
  const STATUS_BAR_CLASS = "desktop-mode-folder-status-bar";
  const ROOT_CLASS$1 = STATUS_BAR_CLASS;
  function renderStatusBarSegments(bar, segments) {
    render(bar, segments);
  }
  function render(bar, segments) {
    const sort = (a, b) => {
      const sa = typeof a.sort === "number" ? a.sort : 100;
      const sb = typeof b.sort === "number" ? b.sort : 100;
      if (sa !== sb) {
        return sa - sb;
      }
      return a.label.localeCompare(b.label);
    };
    const start = segments.filter((s) => (s.align ?? "start") === "start").sort(sort);
    const end = segments.filter((s) => s.align === "end").sort(sort);
    bar.replaceChildren();
    bar.appendChild(buildCluster("start", start));
    bar.appendChild(buildCluster("end", end));
  }
  function buildCluster(align, segs) {
    const cluster = document.createElement("div");
    cluster.className = `${ROOT_CLASS$1}__cluster ${ROOT_CLASS$1}__cluster--${align}`;
    for (const seg of segs) {
      cluster.appendChild(buildSegment(seg));
    }
    return cluster;
  }
  function buildSegment(seg) {
    const interactive = typeof seg.onClick === "function";
    const el = document.createElement(interactive ? "button" : "span");
    el.className = `${ROOT_CLASS$1}__segment`;
    el.dataset.segmentId = seg.id;
    if (interactive) {
      el.type = "button";
      el.addEventListener("click", (e) => seg.onClick(e));
    }
    if (seg.icon) {
      const icon = document.createElement("span");
      icon.className = `${ROOT_CLASS$1}__icon dashicons ${seg.icon.replace(/[^a-zA-Z0-9_-]/g, "")}`;
      icon.setAttribute("aria-hidden", "true");
      el.appendChild(icon);
    }
    const label = document.createElement("span");
    label.className = `${ROOT_CLASS$1}__label`;
    label.textContent = seg.label;
    el.appendChild(label);
    return el;
  }
  const ROOT_CLASS = "desktop-mode-breadcrumbs";
  function renderBreadcrumbs(host, segments, opts = {}) {
    host.replaceChildren();
    host.classList.add(ROOT_CLASS);
    if (opts.onBack) {
      const back = document.createElement("button");
      back.type = "button";
      back.className = `${ROOT_CLASS}__back`;
      back.setAttribute("aria-label", __("Back", "desktop-mode"));
      back.title = __("Back", "desktop-mode");
      const arrow = document.createElement("span");
      arrow.className = "dashicons dashicons-arrow-left-alt2";
      arrow.setAttribute("aria-hidden", "true");
      back.appendChild(arrow);
      if (opts.backDisabled) {
        back.disabled = true;
      }
      const onBack = opts.onBack;
      back.addEventListener("click", () => {
        if (back.disabled) {
          return;
        }
        onBack();
      });
      host.appendChild(back);
    }
    const nav = document.createElement("nav");
    nav.className = `${ROOT_CLASS}__crumbs`;
    nav.setAttribute("aria-label", __("Breadcrumb", "desktop-mode"));
    segments.forEach((seg, idx) => {
      if (idx > 0) {
        const sep = document.createElement("span");
        sep.className = `${ROOT_CLASS}__sep`;
        sep.setAttribute("aria-hidden", "true");
        sep.textContent = "›";
        nav.appendChild(sep);
      }
      if (!seg.onClick) {
        const here = document.createElement("span");
        here.className = `${ROOT_CLASS}__crumb ${ROOT_CLASS}__crumb--current`;
        here.setAttribute("aria-current", "page");
        here.textContent = seg.label;
        nav.appendChild(here);
        return;
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `${ROOT_CLASS}__crumb`;
      btn.textContent = seg.label;
      const onClick = seg.onClick;
      btn.addEventListener("click", () => {
        onClick();
      });
      nav.appendChild(btn);
    });
    host.appendChild(nav);
  }
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
  const WINDOW_ID$1 = "desktop-mode-my-wordpress";
  function getConfig() {
    const store = window.desktopModeWindowConfig;
    const cfg = store ? store[WINDOW_ID$1] : void 0;
    if (!cfg) {
      throw new Error(
        "[desktop-mode-my-wordpress] config blob missing — was the window opened without registration?"
      );
    }
    return cfg;
  }
  function getEntity(id) {
    return getConfig().entities.find((e) => e.id === id);
  }
  function buildUrl(path) {
    const cfg = getConfig();
    const base = cfg.restRoot.endsWith("/") ? cfg.restRoot : cfg.restRoot + "/";
    return base + path.replace(/^\/+/, "");
  }
  async function shellFetch(input, init) {
    return trackedFetch(input, init, {
      windowId: WINDOW_ID$1,
      source: "desktop-mode/my-wordpress"
    });
  }
  async function fetchEntityList(entity, params) {
    const cfg = getConfig();
    const url = new URL(buildUrl(entity.restPath));
    url.searchParams.set("page", String(params.page));
    url.searchParams.set("per_page", String(params.perPage));
    url.searchParams.set(
      "_fields",
      "id,title,excerpt,date,featured_media,link,desktop_mode_lock,_links,_embedded"
    );
    url.searchParams.set("_embed", "wp:featuredmedia");
    url.searchParams.set("status", "publish,future,draft,pending,private");
    const response = await shellFetch(url.toString(), {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "X-WP-Nonce": cfg.restNonce,
        Accept: "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to load list")
      );
    }
    const items = await response.json();
    const total = Number(response.headers.get("X-WP-Total") ?? items.length);
    const totalPages = Number(
      response.headers.get("X-WP-TotalPages") ?? 1
    );
    return { items, total, totalPages };
  }
  async function fetchEntityDetail(entity, id) {
    const cfg = getConfig();
    const url = new URL(buildUrl(`${entity.restPath}/${id}`));
    url.searchParams.set(
      "_fields",
      "id,title,content,excerpt,date,modified,status,link,author,featured_media,categories,tags,comment_status,desktop_mode_contributors,_links,_embedded"
    );
    url.searchParams.set("_embed", "author,wp:term,wp:featuredmedia,replies");
    const response = await shellFetch(url.toString(), {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "X-WP-Nonce": cfg.restNonce,
        Accept: "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to load entry")
      );
    }
    return await response.json();
  }
  async function trashEntity(entity, id) {
    const cfg = getConfig();
    const url = buildUrl(`${entity.restPath}/${id}`);
    const response = await shellFetch(url, {
      method: "DELETE",
      credentials: "same-origin",
      headers: {
        "X-WP-Nonce": cfg.restNonce,
        Accept: "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to move to trash")
      );
    }
  }
  async function readErrorMessage(response, fallback) {
    let message = `${response.status} ${response.statusText || fallback}`;
    try {
      const json = await response.json();
      if (json && typeof json.message === "string") {
        message = json.message;
      }
    } catch {
    }
    return message;
  }
  async function fetchEntityTotal(entity) {
    const cfg = getConfig();
    const buildRequestUrl = (withWho) => {
      const url = new URL(buildUrl(entity.restPath));
      url.searchParams.set("page", "1");
      url.searchParams.set("per_page", "1");
      url.searchParams.set("_fields", "id");
      if (entity.kind !== "user") {
        url.searchParams.set("status", "publish,future,draft,pending,private");
      } else if (withWho) {
        url.searchParams.set("who", "authors");
      }
      return url.toString();
    };
    const send = (target) => shellFetch(target, {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "X-WP-Nonce": cfg.restNonce,
        Accept: "application/json"
      }
    });
    let response = await send(buildRequestUrl(false));
    if (response.status === 403 && entity.kind === "user") {
      response = await send(buildRequestUrl(true));
    }
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "Failed to count"));
    }
    await response.json().catch(() => null);
    const raw = response.headers.get("X-WP-Total");
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : 0;
  }
  async function fetchUserList(entity, params) {
    const cfg = getConfig();
    const buildRequestUrl = (mode) => {
      const url = new URL(buildUrl(entity.restPath));
      url.searchParams.set("page", String(params.page));
      url.searchParams.set("per_page", String(params.perPage));
      url.searchParams.set(
        "_fields",
        "id,name,slug,description,link,avatar_urls,desktop_mode_summary"
      );
      url.searchParams.set("orderby", "name");
      url.searchParams.set("order", "asc");
      if (mode === "edit") {
        url.searchParams.set("context", "edit");
      } else {
        url.searchParams.set("who", "authors");
      }
      return url.toString();
    };
    const send = (target) => shellFetch(target, {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "X-WP-Nonce": cfg.restNonce,
        Accept: "application/json"
      }
    });
    let response = await send(buildRequestUrl("edit"));
    if (response.status === 403) {
      response = await send(buildRequestUrl("authors"));
    }
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "Failed to load users"));
    }
    const items = await response.json();
    const total = Number(response.headers.get("X-WP-Total") ?? items.length);
    const totalPages = Number(
      response.headers.get("X-WP-TotalPages") ?? 1
    );
    return { items, total, totalPages };
  }
  function fetchUserFootprint(userId) {
    return getJson(
      buildUrl(`desktop-mode/v1/user-footprint/${userId}`)
    );
  }
  function buildEditUserUrl(id) {
    const cfg = getConfig();
    const base = cfg.editUserUrlBase || cfg.editPostUrlBase;
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}user_id=${encodeURIComponent(String(id))}`;
  }
  function buildEditUrl(id) {
    const cfg = getConfig();
    const base = cfg.editPostUrlBase;
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}post=${encodeURIComponent(String(id))}&action=edit`;
  }
  async function getJson(url) {
    const cfg = getConfig();
    const response = await shellFetch(url, {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "X-WP-Nonce": cfg.restNonce,
        Accept: "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "Failed to load"));
    }
    return await response.json();
  }
  function fetchUserStats(id) {
    return getJson(buildUrl(`desktop-mode/v1/user-stats/${id}`));
  }
  function fetchTermStats(taxonomy, id) {
    const slug = taxonomy.replace(/[^a-zA-Z0-9_-]/g, "");
    return getJson(
      buildUrl(`desktop-mode/v1/term-stats/${slug}/${id}`)
    );
  }
  function fetchCommentStats(id) {
    return getJson(
      buildUrl(`desktop-mode/v1/comment-stats/${id}`)
    );
  }
  function fetchUser(id) {
    return getJson(
      buildUrl(`wp/v2/users/${id}?context=edit&_fields=id,name,slug,description,avatar_urls,link`)
    );
  }
  function fetchComments(postId) {
    return getJson(
      buildUrl(
        `wp/v2/comments?post=${postId}&per_page=100&_fields=id,post,author,author_name,author_avatar_urls,date,content,status,parent`
      )
    );
  }
  function fetchTerms(taxonomy, ids) {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return getJson(
      buildUrl(
        `wp/v2/${taxonomy}?include=${ids.join(",")}&per_page=100&_fields=id,name,slug,taxonomy,description,count,link`
      )
    );
  }
  function fetchAttachedMedia(postId) {
    return getJson(
      buildUrl(
        `wp/v2/media?parent=${postId}&per_page=100&_fields=id,title,source_url,mime_type,alt_text,date,media_details`
      )
    );
  }
  function fetchMediaByIds(ids) {
    const unique = Array.from(new Set(ids.filter((id) => id > 0)));
    if (unique.length === 0) {
      return Promise.resolve([]);
    }
    return getJson(
      buildUrl(
        `wp/v2/media?include=${unique.join(",")}&per_page=${unique.length}&_fields=id,title,source_url,mime_type,alt_text,date,media_details`
      )
    );
  }
  function fetchRevisions(entity, postId) {
    return getJson(
      buildUrl(
        `${entity.restPath}/${postId}/revisions?_fields=id,date,modified,author,title`
      )
    );
  }
  function fetchRevision(entity, postId, revisionId) {
    return getJson(
      buildUrl(
        `${entity.restPath}/${postId}/revisions/${revisionId}?_fields=id,date,modified,author,title,content,excerpt`
      )
    );
  }
  function getDragManager() {
    const api = window.wp?.desktop?.dragManager;
    return api ?? null;
  }
  const WINDOW_ID = "desktop-mode-my-wordpress";
  const ROOT_SEL = "[data-desktop-mode-my-wordpress-root]";
  const BREADCRUMBS_SEL = "[data-desktop-mode-my-wordpress-breadcrumbs]";
  const BODY_SEL = "[data-desktop-mode-my-wordpress-body]";
  const STATUS_SEL = "[data-desktop-mode-my-wordpress-status]";
  function wpdConfirmGlobal(options) {
    const fn = window.wp?.desktop?.confirm;
    if (typeof fn !== "function") {
      return Promise.resolve(false);
    }
    return fn(options);
  }
  function openIframeWindow(opts) {
    const manager = window.wp?.desktop?.windowManager;
    if (!manager || typeof manager.open !== "function") {
      return;
    }
    manager.open({
      id: opts.id,
      url: opts.url,
      title: opts.title,
      icon: opts.icon
    });
  }
  function stripTags(html) {
    const div = document.createElement("div");
    div.innerHTML = html;
    return (div.textContent ?? "").trim();
  }
  function getThumbnail(item) {
    const media = item._embedded?.["wp:featuredmedia"]?.[0];
    if (!media) {
      return "";
    }
    const sizes = media.media_details?.sizes;
    const preferred = sizes?.medium?.source_url ?? sizes?.thumbnail?.source_url ?? sizes?.large?.source_url ?? media.source_url;
    return preferred ?? "";
  }
  function paintStatus(state, baseSegments, ctx) {
    const filtered = applyFilters(
      "desktop-mode.my-wordpress.status-bar",
      baseSegments,
      ctx
    );
    renderStatusBarSegments(
      state.statusBar,
      Array.isArray(filtered) ? filtered : baseSegments
    );
  }
  function pluralLabel(n, singular, plural) {
    return `${n.toLocaleString()} ${n === 1 ? singular : plural}`;
  }
  function navigate(state, route) {
    clearTeardown(state);
    state.route = route;
    updateBreadcrumbs(state);
    state.body.replaceChildren();
    if (route.kind === "root") {
      renderRoot(state);
      return;
    }
    const entity = getEntity(route.entityId);
    if (!entity) {
      renderError(
        state,
        __("Unknown entity type.", "desktop-mode")
      );
      return;
    }
    if (route.kind === "list") {
      if (entity.kind === "user") {
        renderUserEntityList(state, entity);
      } else {
        renderEntityList(state, entity);
      }
      return;
    }
    if (route.kind === "detail") {
      renderDetail(state, entity, route.postId, route.postTitle);
      return;
    }
    if (route.kind === "sub-list") {
      renderSubList(
        state,
        entity,
        route.postId,
        route.postTitle,
        route.relation
      );
      return;
    }
    if (route.kind === "user-footprint") {
      renderUserFootprint(state, entity, route.userId, route.userName);
    }
  }
  function parentRoute(route) {
    switch (route.kind) {
      case "root":
        return route;
      case "list":
        return { kind: "root" };
      case "detail":
        return { kind: "list", entityId: route.entityId };
      case "sub-list":
        return {
          kind: "detail",
          entityId: route.entityId,
          postId: route.postId,
          postTitle: route.postTitle
        };
      case "user-footprint":
        return { kind: "list", entityId: route.entityId };
      default:
        return { kind: "root" };
    }
  }
  function clearTeardown(state) {
    for (const fn of state.teardown) {
      try {
        fn();
      } catch {
      }
    }
    state.teardown = [];
  }
  function updateBreadcrumbs(state) {
    const { route } = state;
    const segments = [];
    const isRoot = route.kind === "root";
    segments.push(
      isRoot ? { label: __("My WordPress", "desktop-mode") } : {
        label: __("My WordPress", "desktop-mode"),
        onClick: () => navigate(state, { kind: "root" })
      }
    );
    if (route.kind !== "root") {
      const entity = getEntity(route.entityId);
      const label = entity ? entity.label : route.entityId;
      segments.push(
        route.kind === "list" ? { label } : {
          label,
          onClick: () => navigate(state, {
            kind: "list",
            entityId: route.entityId
          })
        }
      );
    }
    if (route.kind === "detail" || route.kind === "sub-list") {
      const postTitle = route.postTitle;
      const entityId = route.entityId;
      const postId = route.postId;
      segments.push(
        route.kind === "detail" ? { label: postTitle } : {
          label: postTitle,
          onClick: () => navigate(state, {
            kind: "detail",
            entityId,
            postId,
            postTitle
          })
        }
      );
    }
    if (route.kind === "sub-list") {
      segments.push({ label: subRelationLabel(route.relation) });
    }
    if (route.kind === "user-footprint") {
      segments.push({
        label: sprintf(
          // translators: %s is a user display name.
          __("%s — activity footprint", "desktop-mode"),
          route.userName
        )
      });
    }
    renderBreadcrumbs(state.breadcrumbs, segments, {
      onBack: () => {
        if (state.route.kind === "root") {
          return;
        }
        navigate(state, parentRoute(state.route));
      },
      backDisabled: isRoot
    });
  }
  function subRelationLabel(relation) {
    switch (relation) {
      case "author":
        return __("Author", "desktop-mode");
      case "contributors":
        return __("Contributors", "desktop-mode");
      case "comments":
        return __("Comments", "desktop-mode");
      case "categories":
        return __("Categories", "desktop-mode");
      case "tags":
        return __("Tags", "desktop-mode");
      case "media":
        return __("Attached media", "desktop-mode");
      case "revisions":
        return __("Revisions", "desktop-mode");
      default:
        return relation;
    }
  }
  function renderRoot(state) {
    const cfg = getConfig();
    const grid = document.createElement("div");
    grid.className = "desktop-mode-my-wordpress__grid desktop-mode-my-wordpress__canvas";
    grid.setAttribute("role", "list");
    const layout = createTileLayout(grid, "root");
    const select = createTileSelector();
    const tilesByEntity = /* @__PURE__ */ new Map();
    cfg.entities.forEach((entity, idx) => {
      const tile = buildIconTile({
        role: "folder",
        icon: entity.icon,
        label: entity.label
      });
      tile.dataset.entityId = entity.id;
      tilesByEntity.set(entity.id, tile);
      const tileKey = `entity:${entity.id}`;
      const synthDate = new Date(2020, 0, 1 + idx).toISOString();
      layout.place(tile, tileKey, {
        name: entity.label,
        date: synthDate
      });
      tile.addEventListener("click", () => select(tile));
      tile.addEventListener("dblclick", (e) => {
        e.preventDefault();
        navigate(state, { kind: "list", entityId: entity.id });
      });
      grid.appendChild(tile);
    });
    cfg.entities.forEach((entity) => {
      void fetchEntityTotal(entity).then((total) => {
        if (state.route.kind !== "root") {
          return;
        }
        const tile = tilesByEntity.get(entity.id);
        if (!tile) {
          return;
        }
        const label = tile.querySelector(
          ".desktop-mode-file-tile__label"
        );
        if (label) {
          label.textContent = `${entity.label} · ${total.toLocaleString()}`;
        }
      }).catch(() => {
      });
    });
    state.body.appendChild(grid);
    const menu = attachIconCanvasMenu(grid, {
      scope: "my-wordpress:root",
      onSort: (mode) => layout.sort(mode)
    });
    state.teardown.push(() => menu.dispose());
    state.teardown.push(() => layout.dispose());
    paintStatus(
      state,
      [
        {
          id: "count",
          label: pluralLabel(cfg.entities.length, "folder", "folders"),
          align: "start",
          sort: 10
        }
      ],
      { view: "root" }
    );
  }
  function buildIconTile(spec) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "desktop-mode-file-tile desktop-mode-my-wordpress__tile" + (spec.role === "folder" ? " desktop-mode-my-wordpress__tile--folder" : " desktop-mode-my-wordpress__tile--entry");
    tile.setAttribute("role", "listitem");
    tile.dataset.role = spec.role;
    const visual = document.createElement("span");
    visual.className = `desktop-mode-file-tile__icon dashicons ${sanitizeClass(
      spec.icon
    )}`;
    visual.setAttribute("aria-hidden", "true");
    tile.appendChild(visual);
    const label = document.createElement("span");
    label.className = "desktop-mode-file-tile__label";
    label.textContent = spec.label;
    tile.appendChild(label);
    return tile;
  }
  function renderError(state, message) {
    const empty = document.createElement("div");
    empty.className = "desktop-mode-my-wordpress__empty";
    empty.textContent = message;
    state.body.appendChild(empty);
  }
  function renderEntityList(state, entity) {
    const cfg = getConfig();
    const split = document.createElement("div");
    split.className = "desktop-mode-my-wordpress__split";
    const left = document.createElement("div");
    left.className = "desktop-mode-my-wordpress__list";
    const tiles = document.createElement("div");
    tiles.className = "desktop-mode-my-wordpress__tiles desktop-mode-my-wordpress__canvas";
    tiles.setAttribute("role", "list");
    left.appendChild(tiles);
    const sentinel = document.createElement("div");
    sentinel.className = "desktop-mode-my-wordpress__sentinel";
    sentinel.setAttribute("aria-hidden", "true");
    left.appendChild(sentinel);
    const right = document.createElement("div");
    right.className = "desktop-mode-my-wordpress__preview";
    const previewEmpty = document.createElement("div");
    previewEmpty.className = "desktop-mode-my-wordpress__preview-empty";
    previewEmpty.textContent = __(
      "Select an entry to preview it here.",
      "desktop-mode"
    );
    right.appendChild(previewEmpty);
    split.appendChild(left);
    split.appendChild(right);
    state.body.appendChild(split);
    const tileLayout = createTileLayout(tiles, `entity:${entity.id}`);
    const menu = attachIconCanvasMenu(tiles, {
      scope: `my-wordpress:${entity.id}`,
      onSort: (mode) => tileLayout.sort(mode)
    });
    state.teardown.push(() => menu.dispose());
    const ctx = {
      page: 0,
      totalPages: 1,
      total: 0,
      loaded: 0,
      loading: false,
      done: false,
      tiles,
      sentinel,
      preview: right,
      selectedId: null,
      selectedTile: null,
      observer: null,
      layout: tileLayout
    };
    state.teardown.push(() => tileLayout.dispose());
    const repaintListStatus = () => {
      let itemLabel;
      if (ctx.total === 0 && ctx.loaded === 0) {
        itemLabel = pluralLabel(0, "item", "items");
      } else if (ctx.total > ctx.loaded && ctx.loaded > 0) {
        itemLabel = sprintf(
          // translators: 1: visible item count, 2: total item count.
          __("%1$d of %2$d items", "desktop-mode"),
          ctx.loaded,
          ctx.total
        );
      } else {
        itemLabel = pluralLabel(
          Math.max(ctx.total, ctx.loaded),
          "item",
          "items"
        );
      }
      const segments = [
        { id: "count", label: itemLabel, align: "start", sort: 10 }
      ];
      if (ctx.totalPages > 1) {
        segments.push({
          id: "page",
          label: sprintf(
            // translators: 1: current page, 2: total pages.
            __("Page %1$d of %2$d", "desktop-mode"),
            Math.max(ctx.page, 1),
            ctx.totalPages
          ),
          align: "end",
          sort: 10
        });
      }
      paintStatus(state, segments, {
        view: "list",
        entityId: entity.id
      });
    };
    repaintListStatus();
    const sentinelIsVisible = () => {
      const sr = sentinel.getBoundingClientRect();
      const rr = left.getBoundingClientRect();
      const slack = 200;
      return sr.top < rr.bottom + slack && sr.bottom > rr.top - slack;
    };
    const loadMore = async () => {
      if (ctx.loading || ctx.done) {
        return;
      }
      ctx.loading = true;
      const nextPage = ctx.page + 1;
      const isFirst = nextPage === 1;
      showSpinner(tiles, isFirst);
      try {
        const result = await fetchEntityList(entity, {
          page: nextPage,
          perPage: cfg.perPage
        });
        ctx.page = nextPage;
        ctx.totalPages = result.totalPages;
        ctx.total = result.total;
        hideSpinner(tiles);
        if (result.items.length === 0 && isFirst) {
          renderListEmpty(tiles, entity);
          ctx.done = true;
          repaintListStatus();
          return;
        }
        for (const item of result.items) {
          tiles.appendChild(buildEntityTile(state, ctx, entity, item));
          ctx.loaded += 1;
        }
        if (ctx.page >= ctx.totalPages) {
          ctx.done = true;
        }
        repaintListStatus();
      } catch (err) {
        hideSpinner(tiles);
        const msg = err instanceof Error ? err.message : __("Unknown error.", "desktop-mode");
        renderListError(tiles, msg);
        ctx.done = true;
      } finally {
        ctx.loading = false;
      }
      if (!ctx.done) {
        requestAnimationFrame(() => {
          if (sentinelIsVisible()) {
            void loadMore();
          }
        });
      }
    };
    if (typeof IntersectionObserver !== "undefined") {
      ctx.observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              void loadMore();
            }
          }
        },
        { root: left, rootMargin: "200px 0px" }
      );
      ctx.observer.observe(sentinel);
      state.teardown.push(() => ctx.observer?.disconnect());
    }
    void loadMore();
  }
  function renderListEmpty(host, entity) {
    const empty = document.createElement("div");
    empty.className = "desktop-mode-my-wordpress__empty";
    empty.textContent = sprintf(
      // translators: %s is an entity-type label (e.g. "Posts", "Pages").
      __("No %s yet.", "desktop-mode"),
      entity.label.toLowerCase()
    );
    host.appendChild(empty);
  }
  function renderListError(host, message) {
    const err = document.createElement("div");
    err.className = "desktop-mode-my-wordpress__error";
    err.textContent = message;
    host.appendChild(err);
  }
  function showSpinner(host, isFirst) {
    const id = isFirst ? "desktop-mode-my-wordpress__spinner--first" : "desktop-mode-my-wordpress__spinner--more";
    if (host.querySelector(`[data-spinner="${id}"]`)) {
      return;
    }
    const wrap = document.createElement("div");
    wrap.dataset.spinner = id;
    wrap.className = isFirst ? "desktop-mode-my-wordpress__spinner desktop-mode-my-wordpress__spinner--first" : "desktop-mode-my-wordpress__spinner";
    const spinner = document.createElement("wpd-spinner");
    wrap.appendChild(spinner);
    host.appendChild(wrap);
  }
  function hideSpinner(host) {
    host.querySelectorAll("[data-spinner]").forEach((n) => n.remove());
  }
  function buildEntityTile(state, ctx, entity, item) {
    const titleText = stripTags(item.title.rendered) || __("(no title)", "desktop-mode");
    const tile = buildIconTile({
      role: "entry",
      icon: entity.icon,
      label: titleText
    });
    tile.dataset.entryId = String(item.id);
    tile.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) {
        return;
      }
      const dragManager = getDragManager();
      if (!dragManager) {
        return;
      }
      dragManager.start({
        payload: {
          type: "shortcut",
          source: tile,
          data: {
            kind: "post",
            ref: String(item.id),
            title: titleText,
            icon: entity.icon
          },
          ghost: {
            offsetX: e.clientX - tile.getBoundingClientRect().left,
            offsetY: e.clientY - tile.getBoundingClientRect().top
          }
        },
        origin: e,
        onClickOnly: () => {
          hideTooltip();
        }
      });
    });
    const lock = item.desktop_mode_lock ?? null;
    if (lock) {
      tile.classList.add("desktop-mode-my-wordpress__tile--locked");
      const badge = document.createElement("span");
      badge.className = "desktop-mode-my-wordpress__tile-lock dashicons dashicons-lock";
      badge.setAttribute("aria-hidden", "true");
      tile.appendChild(badge);
      const lockedAriaLabel = __(
        "%1$s — currently being edited by %2$s",
        "desktop-mode"
      );
      tile.setAttribute(
        "aria-label",
        sprintf(lockedAriaLabel, titleText, lock.userName)
      );
    }
    let tooltip = null;
    const showTooltip = (ev) => {
      if (!tooltip) {
        tooltip = buildTooltip(titleText, item);
      }
      document.body.appendChild(tooltip);
      positionTooltip(tooltip, ev);
    };
    const moveTooltip = (ev) => {
      if (tooltip && tooltip.isConnected) {
        positionTooltip(tooltip, ev);
      }
    };
    const hideTooltip = () => {
      if (tooltip && tooltip.isConnected) {
        tooltip.remove();
      }
    };
    tile.addEventListener("mouseenter", showTooltip);
    tile.addEventListener("mousemove", moveTooltip);
    tile.addEventListener("mouseleave", hideTooltip);
    state.teardown.push(hideTooltip);
    const tileKey = `entry:${item.id}`;
    ctx.layout.place(tile, tileKey, {
      name: titleText,
      date: item.date || (/* @__PURE__ */ new Date(0)).toISOString()
    });
    tile.addEventListener("click", () => {
      selectTile(state, ctx, tile, entity, item.id);
    });
    tile.addEventListener("dblclick", (e) => {
      e.preventDefault();
      hideTooltip();
      openEditor(entity, item.id, titleText);
    });
    tile.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      hideTooltip();
      openTileMenu(state, ctx, entity, item, titleText, {
        x: e.clientX,
        y: e.clientY
      });
    });
    return tile;
  }
  function buildTooltip(title, item) {
    const tip = document.createElement("div");
    tip.className = "desktop-mode-my-wordpress__tooltip";
    tip.setAttribute("role", "tooltip");
    const heading = document.createElement("div");
    heading.className = "desktop-mode-my-wordpress__tooltip-title";
    heading.textContent = title;
    tip.appendChild(heading);
    const lock = item.desktop_mode_lock ?? null;
    if (lock) {
      const banner = document.createElement("div");
      banner.className = "desktop-mode-my-wordpress__tooltip-lock";
      const icon = document.createElement("span");
      icon.className = "dashicons dashicons-lock";
      icon.setAttribute("aria-hidden", "true");
      banner.appendChild(icon);
      const text = document.createElement("span");
      text.textContent = sprintf(
        // translators: %s is the user name currently editing the post.
        __("%s is currently editing", "desktop-mode"),
        lock.userName
      );
      banner.appendChild(text);
      tip.appendChild(banner);
    }
    const thumb = getThumbnail(item);
    if (thumb) {
      const img = document.createElement("img");
      img.className = "desktop-mode-my-wordpress__tooltip-thumb";
      img.src = thumb;
      img.alt = "";
      tip.appendChild(img);
    }
    const excerpt = stripTags(item.excerpt?.rendered ?? "");
    if (excerpt) {
      const p = document.createElement("p");
      p.className = "desktop-mode-my-wordpress__tooltip-excerpt";
      p.textContent = excerpt.length > 240 ? excerpt.slice(0, 237) + "…" : excerpt;
      tip.appendChild(p);
    }
    return tip;
  }
  function positionTooltip(tip, ev) {
    const offset = 16;
    let x = ev.clientX + offset;
    let y = ev.clientY + offset;
    const rect = tip.getBoundingClientRect();
    if (x + rect.width > window.innerWidth - 8) {
      x = Math.max(8, ev.clientX - rect.width - offset);
    }
    if (y + rect.height > window.innerHeight - 8) {
      y = Math.max(8, ev.clientY - rect.height - offset);
    }
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }
  function selectTile(state, ctx, tile, entity, id) {
    if (ctx.selectedTile) {
      ctx.selectedTile.classList.remove(
        "desktop-mode-my-wordpress__tile--selected"
      );
    }
    tile.classList.add("desktop-mode-my-wordpress__tile--selected");
    ctx.selectedTile = tile;
    ctx.selectedId = id;
    void renderPreview(state, ctx, entity, id);
  }
  async function renderPreview(state, ctx, entity, id) {
    showPreviewLoading(ctx.preview);
    let detail;
    try {
      detail = await fetchEntityDetail(entity, id);
    } catch (err) {
      ctx.preview.replaceChildren();
      if (ctx.selectedId !== id) {
        return;
      }
      showPreviewError(ctx.preview, err);
      return;
    }
    if (ctx.selectedId !== id) {
      return;
    }
    appendPostArticle(ctx.preview, detail, entity, {
      onExplore: () => {
        navigate(state, {
          kind: "detail",
          entityId: entity.id,
          postId: detail.id,
          postTitle: stripTags(detail.title.rendered)
        });
      }
    });
  }
  function showPreviewLoading(host) {
    host.replaceChildren();
    const loading = document.createElement("div");
    loading.className = "desktop-mode-my-wordpress__preview-loading";
    const spinner = document.createElement("wpd-spinner");
    spinner.setAttribute("size", "128");
    loading.appendChild(spinner);
    host.appendChild(loading);
  }
  function showPreviewError(host, err) {
    host.replaceChildren();
    const box = document.createElement("div");
    box.className = "desktop-mode-my-wordpress__error";
    box.textContent = err instanceof Error ? err.message : __("Unknown error.", "desktop-mode");
    host.appendChild(box);
  }
  function appendPostArticle(host, detail, entity, opts = {}) {
    host.replaceChildren();
    const article = document.createElement("article");
    article.className = "desktop-mode-my-wordpress__article";
    const heading = document.createElement("h2");
    heading.className = "desktop-mode-my-wordpress__article-title";
    heading.textContent = stripTags(detail.title.rendered);
    article.appendChild(heading);
    const meta = buildPostMetaLine(detail);
    if (meta) {
      article.appendChild(meta);
    }
    const thumb = getThumbnail(detail);
    if (thumb) {
      const img = document.createElement("img");
      img.className = "desktop-mode-my-wordpress__article-hero";
      img.src = thumb;
      img.alt = "";
      article.appendChild(img);
    }
    const content = document.createElement("div");
    content.className = "desktop-mode-my-wordpress__article-content";
    content.innerHTML = detail.content.rendered;
    article.appendChild(content);
    const footer = document.createElement("footer");
    footer.className = "desktop-mode-my-wordpress__article-footer";
    if (opts.onExplore) {
      const exploreBtn = document.createElement("wpd-button");
      exploreBtn.setAttribute("variant", "secondary");
      exploreBtn.textContent = __("Explore details", "desktop-mode");
      exploreBtn.title = __(
        "See author, comments, categories, tags, attached media, and revisions for this entry.",
        "desktop-mode"
      );
      exploreBtn.addEventListener("click", () => {
        opts.onExplore?.();
      });
      footer.appendChild(exploreBtn);
    }
    const editBtn = document.createElement("wpd-button");
    editBtn.setAttribute("variant", "primary");
    editBtn.textContent = __("Open in editor", "desktop-mode");
    editBtn.addEventListener("click", () => {
      openEditor(entity, detail.id, stripTags(detail.title.rendered));
    });
    footer.appendChild(editBtn);
    article.appendChild(footer);
    host.appendChild(article);
  }
  function buildPostMetaLine(detail) {
    const parts = [];
    const author = detail._embedded?.author?.[0];
    if (author?.name) {
      parts.push(author.name);
    }
    if (detail.date) {
      try {
        parts.push(
          new Date(detail.date).toLocaleDateString(void 0, {
            year: "numeric",
            month: "long",
            day: "numeric"
          })
        );
      } catch {
        parts.push(detail.date);
      }
    }
    if (detail.status && detail.status !== "publish") {
      parts.push(detail.status);
    }
    if (parts.length === 0) {
      return null;
    }
    const line = document.createElement("p");
    line.className = "desktop-mode-my-wordpress__article-meta";
    line.textContent = parts.join(" · ");
    return line;
  }
  function renderDetail(state, entity, postId, postTitle) {
    const split = document.createElement("div");
    split.className = "desktop-mode-my-wordpress__split";
    const left = document.createElement("div");
    left.className = "desktop-mode-my-wordpress__list";
    const tiles = document.createElement("div");
    tiles.className = "desktop-mode-my-wordpress__tiles desktop-mode-my-wordpress__canvas";
    tiles.setAttribute("role", "list");
    left.appendChild(tiles);
    const right = document.createElement("div");
    right.className = "desktop-mode-my-wordpress__preview";
    showPreviewLoading(right);
    split.appendChild(left);
    split.appendChild(right);
    state.body.appendChild(split);
    const layout = createTileLayout(
      tiles,
      `detail:${entity.id}:${postId}`
    );
    const menu = attachIconCanvasMenu(tiles, {
      scope: `my-wordpress:${entity.id}:detail:${postId}`,
      onSort: (mode) => layout.sort(mode)
    });
    state.teardown.push(() => menu.dispose());
    state.teardown.push(() => layout.dispose());
    const spinnerWrap = document.createElement("div");
    spinnerWrap.className = "desktop-mode-my-wordpress__spinner";
    spinnerWrap.appendChild(document.createElement("wpd-spinner"));
    tiles.appendChild(spinnerWrap);
    void (async () => {
      let detail;
      try {
        detail = await fetchEntityDetail(entity, postId);
      } catch (err) {
        tiles.removeChild(spinnerWrap);
        renderListError(
          tiles,
          err instanceof Error ? err.message : __("Unknown error.", "desktop-mode")
        );
        showPreviewError(right, err);
        return;
      }
      if (state.route.kind !== "detail" || state.route.postId !== postId) {
        return;
      }
      tiles.removeChild(spinnerWrap);
      const select = createTileSelector();
      const subFolders = [];
      let dateCounter = 0;
      const nextDate = () => new Date(2020, 0, 1 + dateCounter++).toISOString();
      const author = detail._embedded?.author?.[0];
      subFolders.push({
        relation: "author",
        label: author?.name ? sprintf(
          // translators: %s is an author display name.
          __("Author · %s", "desktop-mode"),
          author.name
        ) : __("Author", "desktop-mode"),
        icon: "dashicons-admin-users",
        count: 1,
        disabled: !detail.author,
        synthDate: nextDate()
      });
      const contributors = detail.desktop_mode_contributors ?? [];
      if (contributors.length > 0) {
        subFolders.push({
          relation: "contributors",
          label: sprintf(
            // translators: %d is a count of additional contributor users.
            _n(
              "Contributors · %d",
              "Contributors · %d",
              contributors.length
            ),
            contributors.length
          ),
          icon: "dashicons-groups",
          count: contributors.length,
          synthDate: nextDate()
        });
      }
      const commentsHref = (detail._links?.replies ?? [])[0];
      const commentCountFromLink = typeof commentsHref?.count === "number" ? commentsHref.count : null;
      const repliesEmbed = detail._embedded?.replies?.[0] ?? [];
      const commentCount = commentCountFromLink ?? repliesEmbed.length;
      subFolders.push({
        relation: "comments",
        label: sprintf(
          // translators: %d is a comment count.
          _n("Comments · %d", "Comments · %d", commentCount),
          commentCount
        ),
        icon: "dashicons-admin-comments",
        count: commentCount,
        disabled: detail.comment_status === "closed" && commentCount === 0,
        synthDate: nextDate()
      });
      const categoryIds = detail.categories ?? [];
      if (categoryIds.length > 0) {
        subFolders.push({
          relation: "categories",
          label: sprintf(
            // translators: %d is a category count.
            _n("Categories · %d", "Categories · %d", categoryIds.length),
            categoryIds.length
          ),
          icon: "dashicons-category",
          count: categoryIds.length,
          synthDate: nextDate()
        });
      }
      const tagIds = detail.tags ?? [];
      if (tagIds.length > 0) {
        subFolders.push({
          relation: "tags",
          label: sprintf(
            // translators: %d is a tag count.
            _n("Tags · %d", "Tags · %d", tagIds.length),
            tagIds.length
          ),
          icon: "dashicons-tag",
          count: tagIds.length,
          synthDate: nextDate()
        });
      }
      if (detail.featured_media && detail.featured_media > 0) {
        subFolders.push({
          relation: "media",
          label: __("Attached media", "desktop-mode"),
          icon: "dashicons-format-image",
          count: 1,
          synthDate: nextDate()
        });
      } else {
        subFolders.push({
          relation: "media",
          label: __("Attached media", "desktop-mode"),
          icon: "dashicons-admin-media",
          count: 0,
          synthDate: nextDate()
        });
      }
      subFolders.push({
        relation: "revisions",
        label: __("Revisions", "desktop-mode"),
        icon: "dashicons-backup",
        count: 0,
        synthDate: nextDate()
      });
      for (const sub of subFolders) {
        const tile = buildIconTile({
          role: "folder",
          icon: sub.icon,
          label: sub.label
        });
        tile.dataset.relation = sub.relation;
        if (sub.disabled) {
          tile.setAttribute("aria-disabled", "true");
        }
        const tileKey = `relation:${sub.relation}`;
        layout.place(tile, tileKey, {
          name: sub.label,
          date: sub.synthDate
        });
        tile.addEventListener("click", () => select(tile));
        if (!sub.disabled) {
          tile.addEventListener("dblclick", (e) => {
            e.preventDefault();
            navigate(state, {
              kind: "sub-list",
              entityId: entity.id,
              postId,
              postTitle,
              relation: sub.relation
            });
          });
        }
        tiles.appendChild(tile);
      }
      appendPostArticle(right, detail, entity);
      const segments = [
        {
          id: "count",
          label: pluralLabel(
            subFolders.length,
            "folder",
            "folders"
          ),
          align: "start",
          sort: 10
        }
      ];
      if (detail.status) {
        segments.push({
          id: "status",
          label: detail.status,
          align: "end",
          sort: 10
        });
      }
      paintStatus(state, segments, {
        view: "detail",
        entityId: entity.id,
        postId
      });
    })();
    paintStatus(
      state,
      [
        {
          id: "loading",
          label: __("Loading…", "desktop-mode"),
          align: "start",
          sort: 10
        }
      ],
      { view: "detail", entityId: entity.id, postId }
    );
  }
  function renderSubList(state, entity, postId, postTitle, relation) {
    const split = document.createElement("div");
    split.className = "desktop-mode-my-wordpress__split";
    const left = document.createElement("div");
    left.className = "desktop-mode-my-wordpress__list";
    const tiles = document.createElement("div");
    tiles.className = "desktop-mode-my-wordpress__tiles desktop-mode-my-wordpress__canvas";
    tiles.setAttribute("role", "list");
    left.appendChild(tiles);
    const right = document.createElement("div");
    right.className = "desktop-mode-my-wordpress__preview";
    const previewEmpty = document.createElement("div");
    previewEmpty.className = "desktop-mode-my-wordpress__preview-empty";
    previewEmpty.textContent = __(
      "Select an item to preview it here.",
      "desktop-mode"
    );
    right.appendChild(previewEmpty);
    split.appendChild(left);
    split.appendChild(right);
    state.body.appendChild(split);
    const layout = createTileLayout(
      tiles,
      `sub-list:${entity.id}:${postId}:${relation}`
    );
    const menu = attachIconCanvasMenu(tiles, {
      scope: `my-wordpress:${entity.id}:${relation}:${postId}`,
      onSort: (mode) => layout.sort(mode)
    });
    state.teardown.push(() => menu.dispose());
    state.teardown.push(() => layout.dispose());
    const spinnerWrap = document.createElement("div");
    spinnerWrap.className = "desktop-mode-my-wordpress__spinner";
    spinnerWrap.appendChild(document.createElement("wpd-spinner"));
    tiles.appendChild(spinnerWrap);
    paintStatus(
      state,
      [
        {
          id: "loading",
          label: __("Loading…", "desktop-mode"),
          align: "start",
          sort: 10
        }
      ],
      { view: "sub-list", entityId: entity.id, postId, relation }
    );
    void (async () => {
      let items;
      try {
        items = await loadSubItems(entity, postId, relation);
      } catch (err) {
        tiles.removeChild(spinnerWrap);
        renderListError(
          tiles,
          err instanceof Error ? err.message : __("Unknown error.", "desktop-mode")
        );
        return;
      }
      if (state.route.kind !== "sub-list" || state.route.postId !== postId || state.route.relation !== relation) {
        return;
      }
      tiles.removeChild(spinnerWrap);
      paintStatus(
        state,
        [
          {
            id: "count",
            label: pluralLabel(items.length, "item", "items"),
            align: "start",
            sort: 10
          }
        ],
        {
          view: "sub-list",
          entityId: entity.id,
          postId,
          relation
        }
      );
      if (items.length === 0) {
        renderListEmptyMessage(
          tiles,
          emptySubListMessage(relation)
        );
        return;
      }
      let selectedKey = null;
      let selectedTile = null;
      for (const item of items) {
        const tile = buildIconTile({
          role: "entry",
          icon: item.icon,
          label: item.label
        });
        tile.dataset.subItemId = item.id;
        const tileKey = `sub:${item.id}`;
        layout.place(tile, tileKey, {
          name: item.label,
          date: item.date
        });
        tile.addEventListener("click", () => {
          if (selectedTile) {
            selectedTile.classList.remove(
              "desktop-mode-my-wordpress__tile--selected"
            );
          }
          tile.classList.add(
            "desktop-mode-my-wordpress__tile--selected"
          );
          selectedTile = tile;
          selectedKey = tileKey;
          showPreviewLoading(right);
          Promise.resolve(item.preview()).then((node) => {
            if (selectedKey !== tileKey) {
              return;
            }
            right.replaceChildren(node);
          }).catch((err) => {
            if (selectedKey !== tileKey) {
              return;
            }
            showPreviewError(right, err);
          });
        });
        tiles.appendChild(tile);
      }
    })();
  }
  function renderListEmptyMessage(host, message) {
    const empty = document.createElement("div");
    empty.className = "desktop-mode-my-wordpress__empty";
    empty.textContent = message;
    host.appendChild(empty);
  }
  function emptySubListMessage(relation) {
    switch (relation) {
      case "comments":
        return __("No comments on this post yet.", "desktop-mode");
      case "categories":
        return __("No categories assigned.", "desktop-mode");
      case "tags":
        return __("No tags assigned.", "desktop-mode");
      case "media":
        return __("No media attached to this post.", "desktop-mode");
      case "revisions":
        return __("No revisions yet.", "desktop-mode");
      case "author":
        return __("No author available.", "desktop-mode");
      case "contributors":
        return __("No additional contributors.", "desktop-mode");
      default:
        return __("Nothing to show.", "desktop-mode");
    }
  }
  async function loadSubItems(entity, postId, relation) {
    if (relation === "comments") {
      const comments = await fetchComments(postId);
      return comments.map(commentToView);
    }
    if (relation === "media") {
      const detail = await fetchEntityDetail(entity, postId);
      const ids = /* @__PURE__ */ new Set();
      if (detail.featured_media && detail.featured_media > 0) {
        ids.add(detail.featured_media);
      }
      extractContentMediaIds(detail.content?.rendered ?? "").forEach(
        (id) => ids.add(id)
      );
      const [batched, parentAttached] = await Promise.all([
        fetchMediaByIds(Array.from(ids)).catch(() => []),
        fetchAttachedMedia(postId).catch(() => [])
      ]);
      const seen = /* @__PURE__ */ new Set();
      const merged = [];
      const featuredId = detail.featured_media ?? 0;
      const orderedFromBatch = batched.slice().sort((a, b) => {
        if (a.id === featuredId && b.id !== featuredId) {
          return -1;
        }
        if (b.id === featuredId && a.id !== featuredId) {
          return 1;
        }
        return 0;
      });
      for (const m of [...orderedFromBatch, ...parentAttached]) {
        if (seen.has(m.id)) {
          continue;
        }
        seen.add(m.id);
        merged.push(m);
      }
      return merged.map(mediaToView);
    }
    if (relation === "categories" || relation === "tags") {
      const detail = await fetchEntityDetail(entity, postId);
      const ids = relation === "categories" ? detail.categories ?? [] : detail.tags ?? [];
      const terms = await fetchTerms(
        relation === "categories" ? "categories" : "tags",
        ids
      );
      return terms.map(termToView);
    }
    if (relation === "author") {
      const detail = await fetchEntityDetail(entity, postId);
      if (!detail.author) {
        return [];
      }
      const user = await fetchUser(detail.author);
      return [userToView(user)];
    }
    if (relation === "contributors") {
      const detail = await fetchEntityDetail(entity, postId);
      const contribs = detail.desktop_mode_contributors ?? [];
      return contribs.map(contributorToView);
    }
    if (relation === "revisions") {
      const revs = await fetchRevisions(entity, postId);
      const ordered = revs.slice().sort((a, b) => {
        const ta = Date.parse(a.modified || a.date || "");
        const tb = Date.parse(b.modified || b.date || "");
        return tb - ta;
      });
      return ordered.map((r) => revisionToView(r, entity, postId));
    }
    return [];
  }
  function commentToView(c) {
    const author = c.author_name || __("Anonymous", "desktop-mode");
    return {
      id: `comment:${c.id}`,
      icon: "dashicons-admin-comments",
      label: author,
      date: c.date,
      preview: async () => renderCommentDossier(c)
    };
  }
  async function renderCommentDossier(c) {
    let stats = null;
    try {
      stats = await fetchCommentStats(c.id);
    } catch {
      stats = null;
    }
    const wrap = document.createElement("div");
    wrap.className = "desktop-mode-my-wordpress__article desktop-mode-my-wordpress__comment";
    if (!stats) {
      appendCommentHeader(wrap, {
        authorName: c.author_name || __("Anonymous", "desktop-mode"),
        avatarUrl: c.author_avatar_urls ? pickAvatar(c.author_avatar_urls) ?? "" : "",
        authorLink: "",
        authorWebsite: "",
        status: c.status || "approved",
        date: c.date,
        editLink: "",
        totalApproved: 0
      });
      const body2 = document.createElement("div");
      body2.className = "desktop-mode-my-wordpress__article-content desktop-mode-my-wordpress__comment-body";
      body2.innerHTML = c.content.rendered;
      wrap.appendChild(body2);
      return wrap;
    }
    const { author, comment, post, parent, replies } = stats;
    appendCommentHeader(wrap, {
      authorName: author.displayName || author.name || __("Anonymous", "desktop-mode"),
      avatarUrl: author.avatarUrl,
      authorLink: author.profileLink ?? "",
      authorWebsite: author.url ?? "",
      status: comment.status,
      date: comment.date,
      editLink: comment.editLink,
      totalApproved: author.totalApprovedComments
    });
    if (parent) {
      const quote = document.createElement("blockquote");
      quote.className = "desktop-mode-my-wordpress__comment-quote";
      const lead = document.createElement("div");
      lead.className = "desktop-mode-my-wordpress__comment-quote-lead";
      lead.textContent = sprintf(
        // translators: %s is the parent comment's author name.
        __("In reply to %s", "desktop-mode"),
        parent.authorName
      );
      quote.appendChild(lead);
      const excerpt = document.createElement("p");
      excerpt.textContent = parent.excerpt || "";
      quote.appendChild(excerpt);
      wrap.appendChild(quote);
    }
    const body = document.createElement("div");
    body.className = "desktop-mode-my-wordpress__article-content desktop-mode-my-wordpress__comment-body";
    body.innerHTML = comment.rendered;
    wrap.appendChild(body);
    if (post) {
      const section = document.createElement("section");
      section.className = "desktop-mode-my-wordpress__user-section";
      const h = document.createElement("h3");
      h.textContent = __("On post", "desktop-mode");
      section.appendChild(h);
      const card = document.createElement("div");
      card.className = "desktop-mode-my-wordpress__comment-post";
      const titleEl = document.createElement("a");
      titleEl.className = "desktop-mode-my-wordpress__comment-post-title";
      titleEl.href = post.link;
      titleEl.target = "_blank";
      titleEl.rel = "noopener noreferrer";
      titleEl.textContent = post.title || `#${post.id}`;
      card.appendChild(titleEl);
      const meta = document.createElement("div");
      meta.className = "desktop-mode-my-wordpress__comment-post-meta";
      const parts = [];
      parts.push(formatDate(post.date));
      if (post.author?.name) {
        parts.push(post.author.name);
      }
      if (post.status && post.status !== "publish") {
        parts.push(post.status);
      }
      meta.textContent = parts.join(" · ");
      card.appendChild(meta);
      section.appendChild(card);
      wrap.appendChild(section);
    }
    if (replies.length > 0) {
      const section = document.createElement("section");
      section.className = "desktop-mode-my-wordpress__user-section";
      const h = document.createElement("h3");
      h.textContent = sprintf(
        // translators: %d is the number of direct replies to a comment.
        _n("Reply (%d)", "Replies (%d)", replies.length),
        replies.length
      );
      section.appendChild(h);
      const list = document.createElement("ul");
      list.className = "desktop-mode-my-wordpress__comment-replies";
      for (const r of replies) {
        const li = document.createElement("li");
        li.className = "desktop-mode-my-wordpress__comment-reply";
        if (r.avatarUrl) {
          const img = document.createElement("img");
          img.src = r.avatarUrl;
          img.alt = "";
          img.className = "desktop-mode-my-wordpress__comment-reply-avatar";
          li.appendChild(img);
        }
        const txt = document.createElement("div");
        txt.className = "desktop-mode-my-wordpress__comment-reply-text";
        const head = document.createElement("div");
        head.className = "desktop-mode-my-wordpress__comment-reply-head";
        const who = document.createElement("span");
        who.className = "desktop-mode-my-wordpress__comment-reply-name";
        who.textContent = r.authorName || __("Anonymous", "desktop-mode");
        head.appendChild(who);
        const when = document.createElement("span");
        when.className = "desktop-mode-my-wordpress__comment-reply-when";
        when.textContent = formatDate(r.date);
        head.appendChild(when);
        txt.appendChild(head);
        const ex = document.createElement("p");
        ex.className = "desktop-mode-my-wordpress__comment-reply-excerpt";
        ex.textContent = r.excerpt || "";
        txt.appendChild(ex);
        li.appendChild(txt);
        list.appendChild(li);
      }
      section.appendChild(list);
      wrap.appendChild(section);
    }
    if (comment.ip || comment.userAgent) {
      const dl = document.createElement("dl");
      dl.className = "desktop-mode-my-wordpress__user-milestones";
      if (comment.ip) {
        const dt = document.createElement("dt");
        dt.textContent = __("IP", "desktop-mode");
        dl.appendChild(dt);
        const dd = document.createElement("dd");
        dd.textContent = comment.ip;
        dl.appendChild(dd);
      }
      if (comment.userAgent) {
        const dt = document.createElement("dt");
        dt.textContent = __("User agent", "desktop-mode");
        dl.appendChild(dt);
        const dd = document.createElement("dd");
        dd.textContent = comment.userAgent;
        dl.appendChild(dd);
      }
      wrap.appendChild(dl);
    }
    return wrap;
  }
  function appendCommentHeader(host, header) {
    const wrap = document.createElement("header");
    wrap.className = "desktop-mode-my-wordpress__user-header";
    if (header.avatarUrl) {
      const img = document.createElement("img");
      img.src = header.avatarUrl;
      img.alt = "";
      img.className = "desktop-mode-my-wordpress__user-avatar";
      wrap.appendChild(img);
    }
    const right = document.createElement("div");
    right.className = "desktop-mode-my-wordpress__user-headline";
    const h = document.createElement("h2");
    h.className = "desktop-mode-my-wordpress__article-title";
    h.textContent = header.authorName;
    right.appendChild(h);
    const badges = document.createElement("div");
    badges.className = "desktop-mode-my-wordpress__user-roles";
    const status = document.createElement("span");
    status.className = "desktop-mode-my-wordpress__user-role desktop-mode-my-wordpress__comment-status--" + (header.status || "approved");
    status.textContent = header.status || "approved";
    badges.appendChild(status);
    const dateBadge = document.createElement("span");
    dateBadge.className = "desktop-mode-my-wordpress__user-role desktop-mode-my-wordpress__comment-date-badge";
    dateBadge.textContent = formatDate(header.date);
    badges.appendChild(dateBadge);
    if (header.totalApproved > 1) {
      const totalBadge = document.createElement("span");
      totalBadge.className = "desktop-mode-my-wordpress__user-role";
      totalBadge.textContent = sprintf(
        // translators: %d is a comment count for a particular author.
        _n(
          "%d comment site-wide",
          "%d comments site-wide",
          header.totalApproved
        ),
        header.totalApproved
      );
      badges.appendChild(totalBadge);
    }
    right.appendChild(badges);
    const links = document.createElement("div");
    links.className = "desktop-mode-my-wordpress__user-links";
    if (header.authorLink) {
      const a = document.createElement("a");
      a.href = header.authorLink;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = __("Author archive", "desktop-mode");
      links.appendChild(a);
    }
    if (header.authorWebsite) {
      const a = document.createElement("a");
      a.href = header.authorWebsite;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = __("Website", "desktop-mode");
      links.appendChild(a);
    }
    if (header.editLink) {
      const a = document.createElement("a");
      a.href = header.editLink;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = __("Moderate", "desktop-mode");
      links.appendChild(a);
    }
    if (links.childElementCount > 0) {
      right.appendChild(links);
    }
    wrap.appendChild(right);
    host.appendChild(wrap);
  }
  function userToView(u) {
    return {
      id: `user:${u.id}`,
      icon: "dashicons-admin-users",
      label: u.name || u.slug || `#${u.id}`,
      date: (/* @__PURE__ */ new Date(0)).toISOString(),
      preview: async () => {
        const fallbackName = u.name || u.slug || `#${u.id}`;
        const fallbackAvatar = pickAvatar(u.avatar_urls) ?? "";
        return renderUserDossier({
          userId: u.id,
          fallbackName,
          fallbackAvatar,
          fallbackDescription: u.description ?? ""
        });
      }
    };
  }
  function contributorToView(c) {
    return {
      id: `contributor:${c.userId}`,
      icon: "dashicons-admin-users",
      label: c.userName || `#${c.userId}`,
      date: (/* @__PURE__ */ new Date(0)).toISOString(),
      preview: async () => renderUserDossier({
        userId: c.userId,
        fallbackName: c.userName,
        fallbackAvatar: c.userAvatarUrl,
        fallbackDescription: ""
      })
    };
  }
  async function renderUserDossier(opts) {
    let stats = null;
    try {
      stats = await fetchUserStats(opts.userId);
    } catch {
      stats = null;
    }
    const wrap = document.createElement("div");
    wrap.className = "desktop-mode-my-wordpress__article desktop-mode-my-wordpress__user";
    if (!stats) {
      let basic = null;
      try {
        basic = await fetchUser(opts.userId);
      } catch {
        basic = null;
      }
      appendUserHeader(wrap, {
        name: basic?.name ?? opts.fallbackName,
        avatarUrl: basic && pickAvatar(basic.avatar_urls) || opts.fallbackAvatar,
        roles: [],
        website: "",
        link: basic?.link ?? ""
      });
      const desc = basic?.description ?? opts.fallbackDescription;
      if (desc) {
        const bio = document.createElement("div");
        bio.className = "desktop-mode-my-wordpress__user-bio";
        bio.textContent = desc;
        wrap.appendChild(bio);
      }
      return wrap;
    }
    const { profile, counts, recent, topTerms, milestones, activity } = stats;
    appendUserHeader(wrap, {
      name: profile.name || opts.fallbackName,
      avatarUrl: profile.avatarUrl || opts.fallbackAvatar,
      roles: profile.roleLabels ?? [],
      website: profile.website,
      link: profile.link
    });
    if (profile.description) {
      const bio = document.createElement("div");
      bio.className = "desktop-mode-my-wordpress__user-bio";
      bio.textContent = profile.description;
      wrap.appendChild(bio);
    }
    const cards = document.createElement("div");
    cards.className = "desktop-mode-my-wordpress__user-stats";
    cards.appendChild(
      buildStatCard(
        counts.posts.total.toLocaleString(),
        __("Posts", "desktop-mode"),
        counts.posts.publish > 0 ? sprintf(
          // translators: %d is a published-post count.
          __("%d published", "desktop-mode"),
          counts.posts.publish
        ) : ""
      )
    );
    cards.appendChild(
      buildStatCard(
        counts.pages.total.toLocaleString(),
        __("Pages", "desktop-mode"),
        counts.pages.publish > 0 ? sprintf(
          // translators: %d is a published-page count.
          __("%d published", "desktop-mode"),
          counts.pages.publish
        ) : ""
      )
    );
    cards.appendChild(
      buildStatCard(
        counts.commentsReceived.toLocaleString(),
        __("Comments received", "desktop-mode"),
        ""
      )
    );
    cards.appendChild(
      buildStatCard(
        counts.commentsLeft.toLocaleString(),
        __("Comments left", "desktop-mode"),
        ""
      )
    );
    wrap.appendChild(cards);
    const spark = buildActivitySparkline(activity);
    if (spark) {
      wrap.appendChild(spark);
    }
    const milestoneRow = buildMilestonesRow(profile, milestones);
    if (milestoneRow) {
      wrap.appendChild(milestoneRow);
    }
    if (recent.length > 0) {
      const section = document.createElement("section");
      section.className = "desktop-mode-my-wordpress__user-section";
      const h = document.createElement("h3");
      h.textContent = __("Recent posts", "desktop-mode");
      section.appendChild(h);
      const ul = document.createElement("ul");
      ul.className = "desktop-mode-my-wordpress__user-recent";
      for (const r of recent) {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = r.link;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = r.title || `#${r.id}`;
        li.appendChild(a);
        const meta = document.createElement("span");
        meta.className = "desktop-mode-my-wordpress__user-recent-meta";
        meta.textContent = `${formatDate(r.date)} · ${r.status}`;
        li.appendChild(meta);
        ul.appendChild(li);
      }
      section.appendChild(ul);
      wrap.appendChild(section);
    }
    if (topTerms.length > 0) {
      const section = document.createElement("section");
      section.className = "desktop-mode-my-wordpress__user-section";
      const h = document.createElement("h3");
      h.textContent = __("Top categories & tags", "desktop-mode");
      section.appendChild(h);
      const chips = document.createElement("div");
      chips.className = "desktop-mode-my-wordpress__user-chips";
      for (const t of topTerms) {
        const chip = document.createElement("span");
        chip.className = "desktop-mode-my-wordpress__user-chip " + (t.taxonomy === "post_tag" ? "desktop-mode-my-wordpress__user-chip--tag" : "desktop-mode-my-wordpress__user-chip--category");
        const name = document.createElement("span");
        name.textContent = t.name;
        chip.appendChild(name);
        const count = document.createElement("span");
        count.className = "desktop-mode-my-wordpress__user-chip-count";
        count.textContent = String(t.count);
        chip.appendChild(count);
        chips.appendChild(chip);
      }
      section.appendChild(chips);
      wrap.appendChild(section);
    }
    return wrap;
  }
  function appendUserHeader(host, header) {
    const wrap = document.createElement("header");
    wrap.className = "desktop-mode-my-wordpress__user-header";
    if (header.avatarUrl) {
      const img = document.createElement("img");
      img.src = header.avatarUrl;
      img.alt = "";
      img.className = "desktop-mode-my-wordpress__user-avatar";
      wrap.appendChild(img);
    }
    const right = document.createElement("div");
    right.className = "desktop-mode-my-wordpress__user-headline";
    const h = document.createElement("h2");
    h.className = "desktop-mode-my-wordpress__article-title";
    h.textContent = header.name;
    right.appendChild(h);
    if (header.roles.length > 0) {
      const rolesRow = document.createElement("div");
      rolesRow.className = "desktop-mode-my-wordpress__user-roles";
      for (const r of header.roles) {
        const badge = document.createElement("span");
        badge.className = "desktop-mode-my-wordpress__user-role";
        badge.textContent = r;
        rolesRow.appendChild(badge);
      }
      right.appendChild(rolesRow);
    }
    const links = document.createElement("div");
    links.className = "desktop-mode-my-wordpress__user-links";
    if (header.link) {
      const a = document.createElement("a");
      a.href = header.link;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = __("Author archive", "desktop-mode");
      links.appendChild(a);
    }
    if (header.website) {
      const a = document.createElement("a");
      a.href = header.website;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = __("Website", "desktop-mode");
      links.appendChild(a);
    }
    if (links.childElementCount > 0) {
      right.appendChild(links);
    }
    wrap.appendChild(right);
    host.appendChild(wrap);
  }
  function buildStatCard(value, label, caption) {
    const card = document.createElement("div");
    card.className = "desktop-mode-my-wordpress__user-stat";
    const v = document.createElement("span");
    v.className = "desktop-mode-my-wordpress__user-stat-value";
    v.textContent = value;
    card.appendChild(v);
    const l = document.createElement("span");
    l.className = "desktop-mode-my-wordpress__user-stat-label";
    l.textContent = label;
    card.appendChild(l);
    if (caption) {
      const c = document.createElement("span");
      c.className = "desktop-mode-my-wordpress__user-stat-caption";
      c.textContent = caption;
      card.appendChild(c);
    }
    return card;
  }
  function buildActivitySparkline(activity) {
    if (activity.length === 0) {
      return null;
    }
    const now = /* @__PURE__ */ new Date();
    const months = [];
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const found = activity.find((a) => a.ym === ym);
      months.push({
        ym,
        count: found?.count ?? 0,
        label: d.toLocaleString(void 0, { month: "short" })
      });
    }
    const max = Math.max(1, ...months.map((m) => m.count));
    const wrap = document.createElement("section");
    wrap.className = "desktop-mode-my-wordpress__user-section desktop-mode-my-wordpress__user-spark";
    const h = document.createElement("h3");
    h.textContent = __("Activity (last 12 months)", "desktop-mode");
    wrap.appendChild(h);
    const chart = document.createElement("div");
    chart.className = "desktop-mode-my-wordpress__user-spark-chart";
    for (const m of months) {
      const col = document.createElement("div");
      col.className = "desktop-mode-my-wordpress__user-spark-col";
      const bar = document.createElement("div");
      bar.className = "desktop-mode-my-wordpress__user-spark-bar";
      bar.style.height = `${Math.round(m.count / max * 100)}%`;
      bar.title = sprintf(
        // translators: 1: month label, 2: post count.
        __("%1$s · %2$d posts", "desktop-mode"),
        m.label,
        m.count
      );
      if (m.count === 0) {
        bar.classList.add("desktop-mode-my-wordpress__user-spark-bar--empty");
      }
      col.appendChild(bar);
      const lbl = document.createElement("span");
      lbl.className = "desktop-mode-my-wordpress__user-spark-label";
      lbl.textContent = m.label;
      col.appendChild(lbl);
      chart.appendChild(col);
    }
    wrap.appendChild(chart);
    return wrap;
  }
  function buildMilestonesRow(profile, milestones) {
    const items = [];
    if (profile.registered) {
      items.push({
        label: __("Member since", "desktop-mode"),
        value: formatYearMonth(profile.registered)
      });
    }
    if (milestones.firstPublished) {
      items.push({
        label: __("First published", "desktop-mode"),
        value: formatYearMonth(milestones.firstPublished)
      });
    }
    if (milestones.lastPublished) {
      items.push({
        label: __("Last published", "desktop-mode"),
        value: formatYearMonth(milestones.lastPublished)
      });
    }
    if (items.length === 0) {
      return null;
    }
    const dl = document.createElement("dl");
    dl.className = "desktop-mode-my-wordpress__user-milestones";
    for (const item of items) {
      const dt = document.createElement("dt");
      dt.textContent = item.label;
      dl.appendChild(dt);
      const dd = document.createElement("dd");
      dd.textContent = item.value;
      dl.appendChild(dd);
    }
    return dl;
  }
  function formatYearMonth(iso) {
    if (!iso) {
      return "";
    }
    try {
      return new Date(iso).toLocaleString(void 0, {
        year: "numeric",
        month: "long"
      });
    } catch {
      return iso;
    }
  }
  function pickAvatar(avatars) {
    if (!avatars) {
      return null;
    }
    return avatars["96"] ?? avatars["48"] ?? avatars["24"] ?? Object.values(avatars)[0] ?? null;
  }
  function termToView(t) {
    return {
      id: `term:${t.id}`,
      icon: t.taxonomy === "post_tag" ? "dashicons-tag" : "dashicons-category",
      label: t.name,
      date: (/* @__PURE__ */ new Date(0)).toISOString(),
      preview: async () => renderTermDossier(t)
    };
  }
  async function renderTermDossier(t) {
    let stats = null;
    try {
      stats = await fetchTermStats(t.taxonomy, t.id);
    } catch {
      stats = null;
    }
    const wrap = document.createElement("div");
    wrap.className = "desktop-mode-my-wordpress__article desktop-mode-my-wordpress__term";
    if (!stats) {
      appendTermHeader(wrap, {
        name: t.name,
        taxonomyLabel: t.taxonomy,
        isTag: t.taxonomy === "post_tag",
        count: t.count ?? 0,
        link: t.link ?? "",
        parentName: ""
      });
      if (t.description) {
        const body = document.createElement("div");
        body.className = "desktop-mode-my-wordpress__user-bio";
        body.innerHTML = t.description;
        wrap.appendChild(body);
      }
      return wrap;
    }
    const { profile, counts, recent, topAuthors, coTerms, milestones, activity } = stats;
    appendTermHeader(wrap, {
      name: profile.name,
      taxonomyLabel: profile.taxonomyLabel || profile.taxonomy,
      isTag: profile.taxonomy === "post_tag",
      count: profile.storedCount,
      link: profile.link,
      parentName: profile.parentName ?? ""
    });
    if (profile.description) {
      const bio = document.createElement("div");
      bio.className = "desktop-mode-my-wordpress__user-bio";
      bio.innerHTML = profile.description;
      wrap.appendChild(bio);
    }
    const cards = document.createElement("div");
    cards.className = "desktop-mode-my-wordpress__user-stats";
    cards.appendChild(
      buildStatCard(
        counts.posts.total.toLocaleString(),
        __("Posts", "desktop-mode"),
        counts.posts.publish > 0 ? sprintf(
          // translators: %d is a published-post count.
          __("%d published", "desktop-mode"),
          counts.posts.publish
        ) : ""
      )
    );
    cards.appendChild(
      buildStatCard(
        counts.commentsReceived.toLocaleString(),
        __("Comments", "desktop-mode"),
        ""
      )
    );
    cards.appendChild(
      buildStatCard(
        counts.distinctAuthors.toLocaleString(),
        __("Authors", "desktop-mode"),
        counts.distinctAuthors === 1 ? __("one contributor", "desktop-mode") : ""
      )
    );
    wrap.appendChild(cards);
    const spark = buildActivitySparkline(activity);
    if (spark) {
      wrap.appendChild(spark);
    }
    const milestoneRow = buildTermMilestonesRow(milestones);
    if (milestoneRow) {
      wrap.appendChild(milestoneRow);
    }
    if (topAuthors.length > 0) {
      const section = document.createElement("section");
      section.className = "desktop-mode-my-wordpress__user-section";
      const h = document.createElement("h3");
      h.textContent = __("Top contributors", "desktop-mode");
      section.appendChild(h);
      const grid = document.createElement("div");
      grid.className = "desktop-mode-my-wordpress__term-authors";
      for (const a of topAuthors) {
        const card = document.createElement("div");
        card.className = "desktop-mode-my-wordpress__term-author";
        if (a.userAvatarUrl) {
          const img = document.createElement("img");
          img.src = a.userAvatarUrl;
          img.alt = "";
          img.className = "desktop-mode-my-wordpress__term-author-avatar";
          card.appendChild(img);
        }
        const text = document.createElement("div");
        text.className = "desktop-mode-my-wordpress__term-author-text";
        const name = document.createElement("span");
        name.className = "desktop-mode-my-wordpress__term-author-name";
        name.textContent = a.userName;
        text.appendChild(name);
        const count = document.createElement("span");
        count.className = "desktop-mode-my-wordpress__term-author-count";
        count.textContent = sprintf(
          // translators: %d is a post count.
          _n("%d post", "%d posts", a.count),
          a.count
        );
        text.appendChild(count);
        card.appendChild(text);
        grid.appendChild(card);
      }
      section.appendChild(grid);
      wrap.appendChild(section);
    }
    if (recent.length > 0) {
      const section = document.createElement("section");
      section.className = "desktop-mode-my-wordpress__user-section";
      const h = document.createElement("h3");
      h.textContent = __("Recent posts", "desktop-mode");
      section.appendChild(h);
      const ul = document.createElement("ul");
      ul.className = "desktop-mode-my-wordpress__user-recent";
      for (const r of recent) {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = r.link;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = r.title || `#${r.id}`;
        li.appendChild(a);
        const meta = document.createElement("span");
        meta.className = "desktop-mode-my-wordpress__user-recent-meta";
        meta.textContent = `${formatDate(r.date)} · ${r.status}${r.author?.name ? " · " + r.author.name : ""}`;
        li.appendChild(meta);
        ul.appendChild(li);
      }
      section.appendChild(ul);
      wrap.appendChild(section);
    }
    if (coTerms.length > 0) {
      const section = document.createElement("section");
      section.className = "desktop-mode-my-wordpress__user-section";
      const h = document.createElement("h3");
      h.textContent = profile.taxonomy === "post_tag" ? __("Often paired tags", "desktop-mode") : __("Often paired categories", "desktop-mode");
      section.appendChild(h);
      const chips = document.createElement("div");
      chips.className = "desktop-mode-my-wordpress__user-chips";
      for (const co of coTerms) {
        const chip = document.createElement("span");
        chip.className = "desktop-mode-my-wordpress__user-chip " + (profile.taxonomy === "post_tag" ? "desktop-mode-my-wordpress__user-chip--tag" : "desktop-mode-my-wordpress__user-chip--category");
        const name = document.createElement("span");
        name.textContent = co.name;
        chip.appendChild(name);
        const count = document.createElement("span");
        count.className = "desktop-mode-my-wordpress__user-chip-count";
        count.textContent = String(co.count);
        chip.appendChild(count);
        chips.appendChild(chip);
      }
      section.appendChild(chips);
      wrap.appendChild(section);
    }
    return wrap;
  }
  function appendTermHeader(host, header) {
    const wrap = document.createElement("header");
    wrap.className = "desktop-mode-my-wordpress__term-header";
    const iconHost = document.createElement("span");
    iconHost.className = "desktop-mode-my-wordpress__term-icon " + (header.isTag ? "desktop-mode-my-wordpress__term-icon--tag" : "desktop-mode-my-wordpress__term-icon--category");
    const iconGlyph = document.createElement("span");
    iconGlyph.style.cssText = "font-family:dashicons;font-size:32px;line-height:1;display:inline-block;";
    iconGlyph.textContent = header.isTag ? "" : "";
    iconHost.appendChild(iconGlyph);
    wrap.appendChild(iconHost);
    const right = document.createElement("div");
    right.className = "desktop-mode-my-wordpress__user-headline";
    const h = document.createElement("h2");
    h.className = "desktop-mode-my-wordpress__article-title";
    h.textContent = header.name;
    right.appendChild(h);
    const meta = document.createElement("div");
    meta.className = "desktop-mode-my-wordpress__user-roles";
    const taxBadge = document.createElement("span");
    taxBadge.className = "desktop-mode-my-wordpress__user-role " + (header.isTag ? "desktop-mode-my-wordpress__user-role--tag" : "desktop-mode-my-wordpress__user-role--category");
    taxBadge.textContent = header.taxonomyLabel;
    meta.appendChild(taxBadge);
    if (header.parentName) {
      const parent = document.createElement("span");
      parent.className = "desktop-mode-my-wordpress__user-role";
      parent.textContent = sprintf(
        // translators: %s is the name of the parent category.
        __("in %s", "desktop-mode"),
        header.parentName
      );
      meta.appendChild(parent);
    }
    right.appendChild(meta);
    if (header.link) {
      const links = document.createElement("div");
      links.className = "desktop-mode-my-wordpress__user-links";
      const a = document.createElement("a");
      a.href = header.link;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = __("View archive", "desktop-mode");
      links.appendChild(a);
      right.appendChild(links);
    }
    wrap.appendChild(right);
    host.appendChild(wrap);
  }
  function buildTermMilestonesRow(milestones) {
    const items = [];
    if (milestones.firstPosted) {
      items.push({
        label: __("First post", "desktop-mode"),
        value: formatYearMonth(milestones.firstPosted)
      });
    }
    if (milestones.lastPosted) {
      items.push({
        label: __("Last post", "desktop-mode"),
        value: formatYearMonth(milestones.lastPosted)
      });
    }
    if (items.length === 0) {
      return null;
    }
    const dl = document.createElement("dl");
    dl.className = "desktop-mode-my-wordpress__user-milestones";
    for (const item of items) {
      const dt = document.createElement("dt");
      dt.textContent = item.label;
      dl.appendChild(dt);
      const dd = document.createElement("dd");
      dd.textContent = item.value;
      dl.appendChild(dd);
    }
    return dl;
  }
  function mediaToView(m) {
    const isImage = m.mime_type.startsWith("image/");
    return {
      id: `media:${m.id}`,
      icon: isImage ? "dashicons-format-image" : "dashicons-media-default",
      label: stripTags(m.title.rendered) || `#${m.id}`,
      date: m.date,
      preview: () => {
        const wrap = document.createElement("div");
        wrap.className = "desktop-mode-my-wordpress__article";
        const h = document.createElement("h2");
        h.className = "desktop-mode-my-wordpress__article-title";
        h.textContent = stripTags(m.title.rendered) || `#${m.id}`;
        wrap.appendChild(h);
        const meta = document.createElement("p");
        meta.className = "desktop-mode-my-wordpress__article-meta";
        meta.textContent = `${m.mime_type} · ${formatDate(m.date)}`;
        wrap.appendChild(meta);
        if (isImage) {
          const img = document.createElement("img");
          img.className = "desktop-mode-my-wordpress__article-hero";
          const sizes = m.media_details?.sizes;
          img.src = sizes?.large?.source_url ?? sizes?.medium?.source_url ?? m.source_url;
          img.alt = m.alt_text ?? "";
          wrap.appendChild(img);
        } else {
          const link = document.createElement("p");
          const a = document.createElement("a");
          a.href = m.source_url;
          a.textContent = m.source_url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          link.appendChild(a);
          wrap.appendChild(link);
        }
        return wrap;
      }
    };
  }
  function revisionToView(r, entity, postId) {
    const label = stripTags(r.title?.rendered ?? "") || formatDate(r.date);
    return {
      id: `revision:${r.id}`,
      icon: "dashicons-backup",
      label,
      date: r.modified || r.date,
      preview: async () => {
        let detail = null;
        try {
          detail = await fetchRevision(entity, postId, r.id);
        } catch {
          detail = null;
        }
        const wrap = document.createElement("article");
        wrap.className = "desktop-mode-my-wordpress__article";
        const h = document.createElement("h2");
        h.className = "desktop-mode-my-wordpress__article-title";
        h.textContent = stripTags(detail?.title?.rendered ?? r.title?.rendered ?? "") || label;
        wrap.appendChild(h);
        const meta = document.createElement("p");
        meta.className = "desktop-mode-my-wordpress__article-meta";
        meta.textContent = sprintf(
          // translators: %s is a formatted date.
          __("Saved %s", "desktop-mode"),
          formatDate(detail?.modified || detail?.date || r.modified || r.date)
        );
        wrap.appendChild(meta);
        const html = detail?.content?.rendered ?? "";
        if (html) {
          const content = document.createElement("div");
          content.className = "desktop-mode-my-wordpress__article-content";
          content.innerHTML = html;
          wrap.appendChild(content);
        } else {
          const empty = document.createElement("p");
          empty.className = "desktop-mode-my-wordpress__article-meta";
          empty.textContent = detail ? __("This revision has no rendered content.", "desktop-mode") : __(
            "Couldn’t load the revision content. You may not have permission to view it.",
            "desktop-mode"
          );
          wrap.appendChild(empty);
        }
        return wrap;
      }
    };
  }
  function formatDate(iso) {
    if (!iso) {
      return "";
    }
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }
  function openEditor(entity, id, title) {
    const url = buildEditUrl(id);
    openIframeWindow({
      id: `${entity.id}-edit-${id}`,
      url,
      title,
      icon: entity.icon
    });
  }
  function openTileMenu(state, ctx, entity, item, title, pos) {
    closeAnyTileMenu();
    const menu = document.createElement("wpd-context-menu");
    menu.setAttribute("open", "");
    menu.classList.add("desktop-mode-my-wordpress__menu");
    menu.style.left = `${pos.x}px`;
    menu.style.top = `${pos.y}px`;
    const addOption = (id, label, icon, danger = false) => {
      const opt = document.createElement("wpd-context-menu-option");
      opt.dataset.menuItemId = id;
      opt.setAttribute("value", id);
      opt.setAttribute("icon", sanitizeClass(icon));
      if (danger) {
        opt.setAttribute("danger", "");
      }
      opt.textContent = label;
      menu.appendChild(opt);
    };
    addOption(
      "open",
      __("Open in editor", "desktop-mode"),
      "dashicons-edit"
    );
    addOption(
      "navigate-into",
      __("Navigate into", "desktop-mode"),
      "dashicons-category"
    );
    addOption(
      "trash",
      __("Move to Trash", "desktop-mode"),
      "dashicons-trash",
      true
    );
    menu.addEventListener("wpd-context-menu-pick", (e) => {
      const detail = e.detail;
      closeAnyTileMenu();
      if (detail.id === "open") {
        openEditor(entity, item.id, title);
        return;
      }
      if (detail.id === "navigate-into") {
        navigate(state, {
          kind: "detail",
          entityId: entity.id,
          postId: item.id,
          postTitle: title
        });
        return;
      }
      if (detail.id === "trash") {
        void confirmTrash(state, ctx, entity, item.id, title);
      }
    });
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${Math.max(
        0,
        window.innerWidth - rect.width - 8
      )}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${Math.max(
        0,
        window.innerHeight - rect.height - 8
      )}px`;
    }
    queueMicrotask(() => {
      const onDocPointerDown = (ev) => {
        const target = ev.target;
        if (target instanceof Node && menu.contains(target)) {
          return;
        }
        closeAnyTileMenu();
      };
      const onDocKey = (ev) => {
        if (ev.key === "Escape") {
          closeAnyTileMenu();
        }
      };
      document.addEventListener("pointerdown", onDocPointerDown, true);
      document.addEventListener("keydown", onDocKey);
      menu.addEventListener("tile-menu-closed", () => {
        document.removeEventListener(
          "pointerdown",
          onDocPointerDown,
          true
        );
        document.removeEventListener("keydown", onDocKey);
      });
    });
  }
  function closeAnyTileMenu() {
    document.querySelectorAll("wpd-context-menu.desktop-mode-my-wordpress__menu").forEach((n) => {
      n.dispatchEvent(new CustomEvent("tile-menu-closed"));
      n.remove();
    });
  }
  async function confirmTrash(state, ctx, entity, id, title) {
    const ok = await wpdConfirmGlobal({
      title: __("Move to Trash", "desktop-mode"),
      message: sprintf(
        // translators: %s is the entry title.
        __('Move "%s" to Trash?', "desktop-mode"),
        title
      ),
      confirmLabel: __("Move to Trash", "desktop-mode"),
      cancelLabel: __("Cancel", "desktop-mode"),
      danger: true
    });
    if (!ok) {
      return;
    }
    try {
      await trashEntity(entity, id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : __("Unknown error.", "desktop-mode");
      showToast(msg);
      return;
    }
    const tile = ctx.tiles.querySelector(
      `[data-entry-id="${id}"]`
    );
    tile?.remove();
    if (ctx.selectedId === id) {
      ctx.selectedId = null;
      ctx.selectedTile = null;
      ctx.preview.replaceChildren();
      const empty = document.createElement("div");
      empty.className = "desktop-mode-my-wordpress__preview-empty";
      empty.textContent = __(
        "Select an entry to preview it here.",
        "desktop-mode"
      );
      ctx.preview.appendChild(empty);
    }
  }
  function showToast(message) {
    const toast = window.wp?.desktop?.toast;
    if (typeof toast === "function") {
      toast({ message });
      return;
    }
    console.info("[my-wordpress]", message);
  }
  function renderUserEntityList(state, entity) {
    const cfg = getConfig();
    const split = document.createElement("div");
    split.className = "desktop-mode-my-wordpress__split";
    const left = document.createElement("div");
    left.className = "desktop-mode-my-wordpress__list";
    const tiles = document.createElement("div");
    tiles.className = "desktop-mode-my-wordpress__tiles desktop-mode-my-wordpress__canvas desktop-mode-my-wordpress__canvas--users";
    tiles.setAttribute("role", "list");
    left.appendChild(tiles);
    const sentinel = document.createElement("div");
    sentinel.className = "desktop-mode-my-wordpress__sentinel";
    sentinel.setAttribute("aria-hidden", "true");
    left.appendChild(sentinel);
    const right = document.createElement("div");
    right.className = "desktop-mode-my-wordpress__preview";
    const previewEmpty = document.createElement("div");
    previewEmpty.className = "desktop-mode-my-wordpress__preview-empty";
    previewEmpty.textContent = __(
      "Select a user to see their profile here.",
      "desktop-mode"
    );
    right.appendChild(previewEmpty);
    split.appendChild(left);
    split.appendChild(right);
    state.body.appendChild(split);
    const tileLayout = createTileLayout(tiles, `entity:${entity.id}`);
    const menu = attachIconCanvasMenu(tiles, {
      scope: `my-wordpress:${entity.id}`,
      onSort: (mode) => tileLayout.sort(mode)
    });
    state.teardown.push(() => menu.dispose());
    const ctx = {
      page: 0,
      totalPages: 1,
      total: 0,
      loaded: 0,
      loading: false,
      done: false,
      tiles,
      sentinel,
      preview: right,
      selectedId: null,
      selectedTile: null,
      observer: null,
      layout: tileLayout
    };
    state.teardown.push(() => tileLayout.dispose());
    const repaintListStatus = () => {
      let itemLabel;
      if (ctx.total === 0 && ctx.loaded === 0) {
        itemLabel = pluralLabel(0, "user", "users");
      } else if (ctx.total > ctx.loaded && ctx.loaded > 0) {
        itemLabel = sprintf(
          // translators: 1: visible user count, 2: total user count.
          __("%1$d of %2$d users", "desktop-mode"),
          ctx.loaded,
          ctx.total
        );
      } else {
        itemLabel = pluralLabel(
          Math.max(ctx.total, ctx.loaded),
          "user",
          "users"
        );
      }
      const segments = [
        { id: "count", label: itemLabel, align: "start", sort: 10 }
      ];
      if (ctx.totalPages > 1) {
        segments.push({
          id: "page",
          label: sprintf(
            // translators: 1: current page, 2: total pages.
            __("Page %1$d of %2$d", "desktop-mode"),
            Math.max(ctx.page, 1),
            ctx.totalPages
          ),
          align: "end",
          sort: 10
        });
      }
      paintStatus(state, segments, {
        view: "list",
        entityId: entity.id
      });
    };
    repaintListStatus();
    const sentinelIsVisible = () => {
      const sr = sentinel.getBoundingClientRect();
      const rr = left.getBoundingClientRect();
      const slack = 200;
      return sr.top < rr.bottom + slack && sr.bottom > rr.top - slack;
    };
    const loadMore = async () => {
      if (ctx.loading || ctx.done) {
        return;
      }
      ctx.loading = true;
      const nextPage = ctx.page + 1;
      const isFirst = nextPage === 1;
      showSpinner(tiles, isFirst);
      try {
        const result = await fetchUserList(entity, {
          page: nextPage,
          perPage: cfg.perPage
        });
        ctx.page = nextPage;
        ctx.totalPages = result.totalPages;
        ctx.total = result.total;
        hideSpinner(tiles);
        if (result.items.length === 0 && isFirst) {
          renderListEmptyMessage(
            tiles,
            __("No users to show.", "desktop-mode")
          );
          ctx.done = true;
          repaintListStatus();
          return;
        }
        for (const item of result.items) {
          tiles.appendChild(
            buildUserTile(state, ctx, entity, item)
          );
          ctx.loaded += 1;
        }
        if (ctx.page >= ctx.totalPages) {
          ctx.done = true;
        }
        repaintListStatus();
      } catch (err) {
        hideSpinner(tiles);
        const msg = err instanceof Error ? err.message : __("Unknown error.", "desktop-mode");
        renderListError(tiles, msg);
        ctx.done = true;
      } finally {
        ctx.loading = false;
      }
      if (!ctx.done) {
        requestAnimationFrame(() => {
          if (sentinelIsVisible()) {
            void loadMore();
          }
        });
      }
    };
    if (typeof IntersectionObserver !== "undefined") {
      ctx.observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              void loadMore();
            }
          }
        },
        { root: left, rootMargin: "200px 0px" }
      );
      ctx.observer.observe(sentinel);
      state.teardown.push(() => ctx.observer?.disconnect());
    }
    void loadMore();
  }
  function buildUserTile(state, ctx, entity, item) {
    const displayName = item.name || item.slug || `#${item.id}`;
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "desktop-mode-file-tile desktop-mode-my-wordpress__tile desktop-mode-my-wordpress__tile--user";
    tile.setAttribute("role", "listitem");
    tile.dataset.role = "user";
    tile.dataset.userId = String(item.id);
    const avatarWrap = document.createElement("span");
    avatarWrap.className = "desktop-mode-my-wordpress__user-tile-avatar";
    avatarWrap.setAttribute("aria-hidden", "true");
    const avatarUrl = pickAvatar(item.avatar_urls) ?? "";
    if (avatarUrl) {
      const img = document.createElement("img");
      img.src = avatarUrl;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      avatarWrap.appendChild(img);
    } else {
      const fallback = document.createElement("span");
      fallback.className = "desktop-mode-my-wordpress__user-tile-initials";
      fallback.textContent = initialsOf(displayName);
      avatarWrap.appendChild(fallback);
    }
    tile.appendChild(avatarWrap);
    const label = document.createElement("span");
    label.className = "desktop-mode-file-tile__label";
    label.textContent = displayName;
    tile.appendChild(label);
    const summary = item.desktop_mode_summary;
    const postCount = summary?.postCount ?? 0;
    const roleLabel = (summary?.roleLabels ?? [])[0] ?? "";
    if (roleLabel || postCount > 0) {
      const sub = document.createElement("span");
      sub.className = "desktop-mode-my-wordpress__user-tile-sub";
      const parts = [];
      if (roleLabel) {
        parts.push(roleLabel);
      }
      if (postCount > 0) {
        parts.push(
          sprintf(
            // translators: %d is a count of posts authored.
            _n("%d post", "%d posts", postCount),
            postCount
          )
        );
      }
      sub.textContent = parts.join(" · ");
      tile.appendChild(sub);
    }
    const tooltip = buildUserTooltip(displayName, item);
    let tooltipNode = null;
    const showTooltip = (ev) => {
      if (!tooltipNode) {
        tooltipNode = tooltip;
      }
      document.body.appendChild(tooltipNode);
      positionTooltip(tooltipNode, ev);
    };
    const moveTooltip = (ev) => {
      if (tooltipNode && tooltipNode.isConnected) {
        positionTooltip(tooltipNode, ev);
      }
    };
    const hideTooltip = () => {
      if (tooltipNode && tooltipNode.isConnected) {
        tooltipNode.remove();
      }
    };
    tile.addEventListener("mouseenter", showTooltip);
    tile.addEventListener("mousemove", moveTooltip);
    tile.addEventListener("mouseleave", hideTooltip);
    state.teardown.push(hideTooltip);
    tile.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) {
        return;
      }
      const dragManager = getDragManager();
      if (!dragManager) {
        return;
      }
      dragManager.start({
        payload: {
          type: "shortcut",
          source: tile,
          data: {
            kind: "user",
            ref: String(item.id),
            title: displayName,
            icon: "dashicons-admin-users"
          },
          ghost: {
            offsetX: e.clientX - tile.getBoundingClientRect().left,
            offsetY: e.clientY - tile.getBoundingClientRect().top
          }
        },
        origin: e,
        onClickOnly: () => {
          hideTooltip();
        }
      });
    });
    const tileKey = `entry:${item.id}`;
    ctx.layout.place(tile, tileKey, {
      name: displayName,
      // Order users by post count by default — the most active
      // surface first. Authoring date isn't available per-user,
      // so we synthesize a date that ranks more-prolific users
      // earlier when the canvas sort-by-date is selected.
      date: postCount > 0 ? new Date(2100, 0, 1 - postCount).toISOString() : (/* @__PURE__ */ new Date(0)).toISOString()
    });
    tile.addEventListener("click", () => {
      selectUserTile(state, ctx, tile, item);
    });
    tile.addEventListener("dblclick", (e) => {
      e.preventDefault();
      hideTooltip();
      navigate(state, {
        kind: "user-footprint",
        entityId: entity.id,
        userId: item.id,
        userName: displayName
      });
    });
    tile.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      hideTooltip();
      openUserTileMenu(state, entity, item, displayName, {
        x: e.clientX,
        y: e.clientY
      });
    });
    return tile;
  }
  function buildUserTooltip(name, item) {
    const tip = document.createElement("div");
    tip.className = "desktop-mode-my-wordpress__tooltip";
    tip.setAttribute("role", "tooltip");
    const heading = document.createElement("div");
    heading.className = "desktop-mode-my-wordpress__tooltip-title";
    heading.textContent = name;
    tip.appendChild(heading);
    const summary = item.desktop_mode_summary;
    const roleLabel = (summary?.roleLabels ?? [])[0];
    const postCount = summary?.postCount ?? 0;
    const lastActive = summary?.lastActive ?? "";
    const lines = [];
    if (roleLabel) {
      lines.push(roleLabel);
    }
    if (postCount > 0) {
      lines.push(
        sprintf(
          // translators: %d is a count of posts authored by a user.
          _n("%d post", "%d posts", postCount),
          postCount
        )
      );
    }
    if (lastActive) {
      lines.push(
        sprintf(
          // translators: %s is a relative or absolute date.
          __("Last published %s", "desktop-mode"),
          formatDate(lastActive)
        )
      );
    }
    for (const ln of lines) {
      const p = document.createElement("p");
      p.className = "desktop-mode-my-wordpress__tooltip-excerpt";
      p.textContent = ln;
      tip.appendChild(p);
    }
    const bio = (item.description ?? "").trim();
    if (bio) {
      const p = document.createElement("p");
      p.className = "desktop-mode-my-wordpress__tooltip-excerpt";
      p.textContent = bio.length > 200 ? bio.slice(0, 197) + "…" : bio;
      tip.appendChild(p);
    }
    return tip;
  }
  function selectUserTile(state, ctx, tile, item) {
    if (ctx.selectedTile) {
      ctx.selectedTile.classList.remove(
        "desktop-mode-my-wordpress__tile--selected"
      );
    }
    tile.classList.add("desktop-mode-my-wordpress__tile--selected");
    ctx.selectedTile = tile;
    ctx.selectedId = item.id;
    void renderUserPreviewPane(state, ctx, item);
  }
  async function renderUserPreviewPane(state, ctx, item) {
    const fallbackName = item.name || item.slug || `#${item.id}`;
    const fallbackAvatar = pickAvatar(item.avatar_urls) ?? "";
    const userId = item.id;
    showPreviewLoading(ctx.preview);
    let node;
    try {
      node = await renderUserDossier({
        userId,
        fallbackName,
        fallbackAvatar,
        fallbackDescription: item.description ?? ""
      });
    } catch (err) {
      if (ctx.selectedId !== userId) {
        return;
      }
      showPreviewError(ctx.preview, err);
      return;
    }
    if (ctx.selectedId !== userId) {
      return;
    }
    const footer = document.createElement("footer");
    footer.className = "desktop-mode-my-wordpress__article-footer";
    const footprintBtn = document.createElement("wpd-button");
    footprintBtn.setAttribute("variant", "primary");
    footprintBtn.textContent = __("View activity footprint", "desktop-mode");
    footprintBtn.title = __(
      "Open the full activity footprint surface for this user.",
      "desktop-mode"
    );
    footprintBtn.addEventListener("click", () => {
      navigate(state, {
        kind: "user-footprint",
        entityId: "users",
        userId,
        userName: fallbackName
      });
    });
    footer.appendChild(footprintBtn);
    const editBtn = document.createElement("wpd-button");
    editBtn.setAttribute("variant", "secondary");
    editBtn.textContent = __("Show profile", "desktop-mode");
    editBtn.title = __(
      "Open this user’s profile editor in a new window.",
      "desktop-mode"
    );
    editBtn.addEventListener("click", () => {
      openUserEditWindow(userId);
    });
    footer.appendChild(editBtn);
    node.appendChild(footer);
    ctx.preview.replaceChildren(node);
  }
  function openUserTileMenu(state, entity, item, name, pos) {
    closeAnyTileMenu();
    const menu = document.createElement("wpd-context-menu");
    menu.setAttribute("open", "");
    menu.classList.add("desktop-mode-my-wordpress__menu");
    menu.style.left = `${pos.x}px`;
    menu.style.top = `${pos.y}px`;
    const addOption = (id, label, icon) => {
      const opt = document.createElement("wpd-context-menu-option");
      opt.dataset.menuItemId = id;
      opt.setAttribute("value", id);
      opt.setAttribute("icon", sanitizeClass(icon));
      opt.textContent = label;
      menu.appendChild(opt);
    };
    addOption(
      "footprint",
      __("View activity footprint", "desktop-mode"),
      "dashicons-chart-area"
    );
    addOption(
      "open-profile",
      __("Show profile", "desktop-mode"),
      "dashicons-id-alt"
    );
    if (item.link) {
      addOption(
        "author-archive",
        __("View author archive", "desktop-mode"),
        "dashicons-external"
      );
    }
    menu.addEventListener("wpd-context-menu-pick", (e) => {
      const detail = e.detail;
      closeAnyTileMenu();
      if (detail.id === "footprint") {
        navigate(state, {
          kind: "user-footprint",
          entityId: entity.id,
          userId: item.id,
          userName: name
        });
        return;
      }
      if (detail.id === "open-profile") {
        openUserEditWindow(item.id);
        return;
      }
      if (detail.id === "author-archive" && item.link) {
        window.open(item.link, "_blank", "noopener,noreferrer");
      }
    });
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${Math.max(
        0,
        window.innerWidth - rect.width - 8
      )}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${Math.max(
        0,
        window.innerHeight - rect.height - 8
      )}px`;
    }
    queueMicrotask(() => {
      const onDocPointerDown = (ev) => {
        const target = ev.target;
        if (target instanceof Node && menu.contains(target)) {
          return;
        }
        closeAnyTileMenu();
      };
      const onDocKey = (ev) => {
        if (ev.key === "Escape") {
          closeAnyTileMenu();
        }
      };
      document.addEventListener("pointerdown", onDocPointerDown, true);
      document.addEventListener("keydown", onDocKey);
      menu.addEventListener("tile-menu-closed", () => {
        document.removeEventListener(
          "pointerdown",
          onDocPointerDown,
          true
        );
        document.removeEventListener("keydown", onDocKey);
      });
    });
  }
  function openUserEditWindow(userId) {
    if (!Number.isFinite(userId) || userId <= 0) {
      return;
    }
    const desktop = window.wp?.desktop;
    const createSharedStore = desktop?.createSharedStore;
    if (typeof createSharedStore === "function") {
      const store = createSharedStore(
        "desktop-mode/user-edit/target",
        () => ({ userId: null, requestedAt: 0, tabRequested: false })
      );
      store.state.userId = userId;
      store.state.requestedAt = Date.now();
      store.state.tabRequested = true;
      store.notify();
    }
    const opened = desktop?.openWindow?.("desktop-mode-user-edit", {
      source: "my-wordpress/user-tile"
    });
    if (!opened) {
      openIframeWindow({
        id: `user-edit-${userId}`,
        url: buildEditUserUrl(userId),
        title: __("Edit user", "desktop-mode"),
        icon: "dashicons-admin-users"
      });
    }
  }
  function initialsOf(name) {
    const parts = name.trim().split(/\s+/).filter((s) => s.length > 0);
    if (parts.length === 0) {
      return "?";
    }
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  function renderUserFootprint(state, entity, userId, userName) {
    const host = document.createElement("div");
    host.className = "desktop-mode-my-wordpress__footprint";
    state.body.appendChild(host);
    showPreviewLoading(host);
    paintStatus(
      state,
      [
        {
          id: "loading",
          label: __("Loading footprint…", "desktop-mode"),
          align: "start",
          sort: 10
        }
      ],
      { view: "detail", entityId: entity.id, postId: userId }
    );
    void (async () => {
      let payload;
      try {
        payload = await fetchUserFootprint(userId);
      } catch (err) {
        showPreviewError(host, err);
        paintStatus(
          state,
          [
            {
              id: "error",
              label: __("Could not load footprint.", "desktop-mode"),
              align: "start",
              sort: 10
            }
          ],
          { view: "detail", entityId: entity.id, postId: userId }
        );
        return;
      }
      if (state.route.kind !== "user-footprint" || state.route.userId !== userId) {
        return;
      }
      host.replaceChildren();
      host.appendChild(buildFootprintHero(payload));
      host.appendChild(buildFootprintHeadlineStats(payload));
      host.appendChild(buildFootprintCalendar(payload));
      host.appendChild(buildFootprintRhythm(payload));
      const monthCallout = buildFootprintMonthCallout(payload);
      if (monthCallout) {
        host.appendChild(monthCallout);
      }
      host.appendChild(buildFootprintTimeline(payload));
      host.appendChild(
        buildFootprintFooter(payload, userId)
      );
      paintStatus(
        state,
        [
          {
            id: "count",
            label: sprintf(
              // translators: 1: post total, 2: comment total.
              __(
                "%1$d posts · %2$d comments tracked",
                "desktop-mode"
              ),
              payload.totals.posts + payload.totals.pages,
              payload.totals.comments
            ),
            align: "start",
            sort: 10
          },
          {
            id: "range",
            label: sprintf(
              // translators: 1: window-start date, 2: window-end date.
              __(
                "Window %1$s → %2$s",
                "desktop-mode"
              ),
              formatShortDate(payload.range.from),
              formatShortDate(payload.range.to)
            ),
            align: "end",
            sort: 10
          }
        ],
        { view: "detail", entityId: entity.id, postId: userId }
      );
    })();
  }
  function buildFootprintHero(payload) {
    const hero = document.createElement("header");
    hero.className = "desktop-mode-my-wordpress__footprint-hero";
    const avatar = document.createElement("div");
    avatar.className = "desktop-mode-my-wordpress__footprint-avatar";
    if (payload.profile.avatarUrl) {
      const img = document.createElement("img");
      img.src = payload.profile.avatarUrl;
      img.alt = "";
      avatar.appendChild(img);
    } else {
      const span = document.createElement("span");
      span.className = "desktop-mode-my-wordpress__user-tile-initials";
      span.textContent = initialsOf(payload.profile.name);
      avatar.appendChild(span);
    }
    hero.appendChild(avatar);
    const text = document.createElement("div");
    text.className = "desktop-mode-my-wordpress__footprint-headline";
    const h = document.createElement("h1");
    h.className = "desktop-mode-my-wordpress__footprint-title";
    h.textContent = payload.profile.name;
    text.appendChild(h);
    const meta = document.createElement("div");
    meta.className = "desktop-mode-my-wordpress__footprint-meta";
    const roles = payload.profile.roleLabels ?? [];
    for (const r of roles) {
      const chip = document.createElement("span");
      chip.className = "desktop-mode-my-wordpress__user-role";
      chip.textContent = r;
      meta.appendChild(chip);
    }
    if (payload.profile.registered) {
      const since = document.createElement("span");
      since.className = "desktop-mode-my-wordpress__user-role desktop-mode-my-wordpress__footprint-since";
      since.textContent = sprintf(
        // translators: %s is a year-month label like "January 2023".
        __("Member since %s", "desktop-mode"),
        formatYearMonth(payload.profile.registered)
      );
      meta.appendChild(since);
    }
    text.appendChild(meta);
    if (payload.profile.link) {
      const links = document.createElement("div");
      links.className = "desktop-mode-my-wordpress__user-links";
      const a = document.createElement("a");
      a.href = payload.profile.link;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = __("Author archive", "desktop-mode");
      links.appendChild(a);
      text.appendChild(links);
    }
    hero.appendChild(text);
    return hero;
  }
  function buildFootprintHeadlineStats(payload) {
    const wrap = document.createElement("section");
    wrap.className = "desktop-mode-my-wordpress__footprint-section desktop-mode-my-wordpress__footprint-stats-row";
    const totalContent = payload.totals.posts + payload.totals.pages;
    wrap.appendChild(
      buildStatCard(
        totalContent.toLocaleString(),
        __("Total content", "desktop-mode"),
        payload.totals.posts > 0 && payload.totals.pages > 0 ? sprintf(
          // translators: 1: post count, 2: page count.
          __(
            "%1$d posts · %2$d pages",
            "desktop-mode"
          ),
          payload.totals.posts,
          payload.totals.pages
        ) : ""
      )
    );
    wrap.appendChild(
      buildStatCard(
        payload.totals.comments.toLocaleString(),
        __("Comments left", "desktop-mode"),
        ""
      )
    );
    const longestRange = payload.streak.longestRange;
    const longestCaption = longestRange.from && longestRange.to ? sprintf(
      // translators: 1: start date, 2: end date.
      __("%1$s → %2$s", "desktop-mode"),
      formatShortDate(longestRange.from),
      formatShortDate(longestRange.to)
    ) : "";
    wrap.appendChild(
      buildStatCard(
        sprintf(
          // translators: %d is the length in days of the user's longest publishing streak.
          _n(
            "%d day",
            "%d days",
            payload.streak.longest
          ),
          payload.streak.longest
        ),
        __("Longest streak", "desktop-mode"),
        longestCaption
      )
    );
    wrap.appendChild(
      buildStatCard(
        sprintf(
          // translators: %d is the length in days of the user's current active streak.
          _n("%d day", "%d days", payload.streak.current),
          payload.streak.current
        ),
        __("Current streak", "desktop-mode"),
        payload.streak.current === 0 ? __("No activity today", "desktop-mode") : __("Including today", "desktop-mode")
      )
    );
    return wrap;
  }
  function buildFootprintCalendar(payload) {
    const section = document.createElement("section");
    section.className = "desktop-mode-my-wordpress__footprint-section desktop-mode-my-wordpress__footprint-calendar-section";
    const h = document.createElement("h3");
    h.textContent = __("A year of activity", "desktop-mode");
    section.appendChild(h);
    const calendar = document.createElement("div");
    calendar.className = "desktop-mode-my-wordpress__footprint-calendar";
    const maxIntensity = payload.daily.reduce((m, d) => {
      const v = d.posts + d.comments;
      return v > m ? v : m;
    }, 0);
    const bucketize = (v) => {
      if (v <= 0) {
        return 0;
      }
      if (maxIntensity <= 0) {
        return 0;
      }
      const ratio = v / maxIntensity;
      if (ratio > 0.75) {
        return 4;
      }
      if (ratio > 0.5) {
        return 3;
      }
      if (ratio > 0.25) {
        return 2;
      }
      return 1;
    };
    const dates = payload.daily.map((d) => /* @__PURE__ */ new Date(d.date + "T00:00:00Z"));
    if (dates.length === 0) {
      const empty = document.createElement("p");
      empty.className = "desktop-mode-my-wordpress__article-meta";
      empty.textContent = __(
        "No activity recorded in the last year.",
        "desktop-mode"
      );
      section.appendChild(empty);
      return section;
    }
    const firstDow = dates[0].getUTCDay();
    const grid = document.createElement("div");
    grid.className = "desktop-mode-my-wordpress__footprint-grid";
    const placeCell = (el, linearDayOffset) => {
      const dow = linearDayOffset % 7;
      const week = Math.floor(linearDayOffset / 7);
      el.style.gridRow = String(dow + 2);
      el.style.gridColumn = String(week + 2);
    };
    const weekdaySource = [
      // 2024-12-02 was a Monday (UTC).
      new Date(Date.UTC(2024, 11, 2)),
      // Mon
      new Date(Date.UTC(2024, 11, 4)),
      // Wed
      new Date(Date.UTC(2024, 11, 6))
      // Fri
    ];
    const weekdayRows = [2, 4, 6];
    for (let i = 0; i < weekdaySource.length; i += 1) {
      const lbl = document.createElement("span");
      lbl.className = "desktop-mode-my-wordpress__footprint-weekday";
      lbl.textContent = weekdaySource[i].toLocaleDateString(void 0, {
        weekday: "short"
      });
      lbl.style.gridColumn = "1";
      lbl.style.gridRow = String(weekdayRows[i] + 1);
      grid.appendChild(lbl);
    }
    for (let i = 0; i < firstDow; i += 1) {
      const blank = document.createElement("span");
      blank.className = "desktop-mode-my-wordpress__footprint-cell desktop-mode-my-wordpress__footprint-cell--pad";
      blank.setAttribute("aria-hidden", "true");
      placeCell(blank, i);
      grid.appendChild(blank);
    }
    let lastMonth = -1;
    for (let i = 0; i < payload.daily.length; i += 1) {
      const d = dates[i];
      const m = d.getUTCMonth();
      if (m === lastMonth) {
        continue;
      }
      lastMonth = m;
      const linear = firstDow + i;
      const week = Math.floor(linear / 7);
      if (week === 0 && linear % 7 !== 0) {
        continue;
      }
      const lbl = document.createElement("span");
      lbl.className = "desktop-mode-my-wordpress__footprint-month";
      lbl.textContent = d.toLocaleDateString(void 0, { month: "short" });
      lbl.style.gridRow = "1";
      lbl.style.gridColumn = String(week + 2);
      grid.appendChild(lbl);
    }
    for (let i = 0; i < payload.daily.length; i += 1) {
      const d = payload.daily[i];
      const intensity = bucketize(d.posts + d.comments);
      const cell = document.createElement("span");
      cell.className = `desktop-mode-my-wordpress__footprint-cell desktop-mode-my-wordpress__footprint-cell--l${intensity}`;
      cell.title = sprintf(
        // translators: 1: date, 2: post count, 3: comment count.
        __(
          "%1$s — %2$d posts, %3$d comments",
          "desktop-mode"
        ),
        formatLongDate(d.date),
        d.posts,
        d.comments
      );
      cell.dataset.date = d.date;
      placeCell(cell, firstDow + i);
      grid.appendChild(cell);
    }
    calendar.appendChild(grid);
    const legend = document.createElement("div");
    legend.className = "desktop-mode-my-wordpress__footprint-legend";
    const less = document.createElement("span");
    less.className = "desktop-mode-my-wordpress__footprint-legend-label";
    less.textContent = __("Less", "desktop-mode");
    legend.appendChild(less);
    for (let i = 0; i <= 4; i += 1) {
      const sw = document.createElement("span");
      sw.className = `desktop-mode-my-wordpress__footprint-cell desktop-mode-my-wordpress__footprint-cell--l${i}`;
      legend.appendChild(sw);
    }
    const more = document.createElement("span");
    more.className = "desktop-mode-my-wordpress__footprint-legend-label";
    more.textContent = __("More", "desktop-mode");
    legend.appendChild(more);
    calendar.appendChild(legend);
    section.appendChild(calendar);
    return section;
  }
  function buildFootprintRhythm(payload) {
    const section = document.createElement("section");
    section.className = "desktop-mode-my-wordpress__footprint-section desktop-mode-my-wordpress__footprint-rhythm";
    const h = document.createElement("h3");
    h.textContent = __("Publishing rhythm", "desktop-mode");
    section.appendChild(h);
    const grid = document.createElement("div");
    grid.className = "desktop-mode-my-wordpress__footprint-rhythm-grid";
    const weekdayWrap = document.createElement("div");
    weekdayWrap.className = "desktop-mode-my-wordpress__footprint-chart";
    const weekdayCap = document.createElement("div");
    weekdayCap.className = "desktop-mode-my-wordpress__footprint-chart-caption";
    weekdayCap.textContent = __("By weekday", "desktop-mode");
    weekdayWrap.appendChild(weekdayCap);
    const weekdayLabels = [
      __("S", "desktop-mode"),
      __("M", "desktop-mode"),
      __("T", "desktop-mode"),
      __("W", "desktop-mode"),
      __("T", "desktop-mode"),
      __("F", "desktop-mode"),
      __("S", "desktop-mode")
    ];
    const weekdayFull = [
      __("Sunday", "desktop-mode"),
      __("Monday", "desktop-mode"),
      __("Tuesday", "desktop-mode"),
      __("Wednesday", "desktop-mode"),
      __("Thursday", "desktop-mode"),
      __("Friday", "desktop-mode"),
      __("Saturday", "desktop-mode")
    ];
    weekdayWrap.appendChild(
      buildBarChart(payload.weekday, weekdayLabels, weekdayFull)
    );
    grid.appendChild(weekdayWrap);
    const hourWrap = document.createElement("div");
    hourWrap.className = "desktop-mode-my-wordpress__footprint-chart";
    const hourCap = document.createElement("div");
    hourCap.className = "desktop-mode-my-wordpress__footprint-chart-caption";
    hourCap.textContent = __("By hour of day (site time)", "desktop-mode");
    hourWrap.appendChild(hourCap);
    const hourLabels = [
      "0",
      "",
      "",
      "3",
      "",
      "",
      "6",
      "",
      "",
      "9",
      "",
      "",
      "12",
      "",
      "",
      "15",
      "",
      "",
      "18",
      "",
      "",
      "21",
      "",
      ""
    ];
    const hourFull = Array.from(
      { length: 24 },
      (_, i) => sprintf(
        // translators: %d is an hour of the day (0-23).
        __("%d:00", "desktop-mode"),
        i
      )
    );
    hourWrap.appendChild(
      buildBarChart(payload.hour, hourLabels, hourFull)
    );
    grid.appendChild(hourWrap);
    section.appendChild(grid);
    return section;
  }
  function buildBarChart(values, labels, titles) {
    const chart = document.createElement("div");
    chart.className = "desktop-mode-my-wordpress__footprint-bars";
    const max = Math.max(1, ...values);
    values.forEach((v, i) => {
      const col = document.createElement("div");
      col.className = "desktop-mode-my-wordpress__footprint-bar-col";
      const bar = document.createElement("div");
      bar.className = "desktop-mode-my-wordpress__footprint-bar";
      bar.style.height = `${Math.round(v / max * 100)}%`;
      bar.title = sprintf(
        // translators: 1: bucket label, 2: count.
        __(
          "%1$s · %2$d",
          "desktop-mode"
        ),
        titles[i] ?? labels[i] ?? String(i),
        v
      );
      if (v === 0) {
        bar.classList.add(
          "desktop-mode-my-wordpress__footprint-bar--empty"
        );
      }
      col.appendChild(bar);
      const lbl = document.createElement("span");
      lbl.className = "desktop-mode-my-wordpress__footprint-bar-label";
      lbl.textContent = labels[i] ?? "";
      col.appendChild(lbl);
      chart.appendChild(col);
    });
    return chart;
  }
  function buildFootprintMonthCallout(payload) {
    const m = payload.totals.mostProlificMonth;
    if (!m) {
      return null;
    }
    const section = document.createElement("section");
    section.className = "desktop-mode-my-wordpress__footprint-section desktop-mode-my-wordpress__footprint-callout";
    const label = document.createElement("span");
    label.className = "desktop-mode-my-wordpress__footprint-callout-label";
    label.textContent = __("Most prolific month", "desktop-mode");
    section.appendChild(label);
    const value = document.createElement("h3");
    value.className = "desktop-mode-my-wordpress__footprint-callout-value";
    value.textContent = formatYearMonth(m.ym + "-01T00:00:00Z");
    section.appendChild(value);
    const detail = document.createElement("p");
    detail.className = "desktop-mode-my-wordpress__footprint-callout-detail";
    detail.textContent = sprintf(
      // translators: %d is a post count.
      _n(
        "%d post published — their personal record.",
        "%d posts published — their personal record.",
        m.n
      ),
      m.n
    );
    section.appendChild(detail);
    return section;
  }
  function buildFootprintTimeline(payload) {
    const section = document.createElement("section");
    section.className = "desktop-mode-my-wordpress__footprint-section desktop-mode-my-wordpress__footprint-timeline-section";
    const h = document.createElement("h3");
    h.textContent = __("Recent activity", "desktop-mode");
    section.appendChild(h);
    if (payload.timeline.length === 0) {
      const empty = document.createElement("p");
      empty.className = "desktop-mode-my-wordpress__article-meta";
      empty.textContent = __("Nothing to show yet.", "desktop-mode");
      section.appendChild(empty);
      return section;
    }
    const list = document.createElement("ul");
    list.className = "desktop-mode-my-wordpress__footprint-timeline";
    for (const ev of payload.timeline) {
      const li = document.createElement("li");
      li.className = `desktop-mode-my-wordpress__footprint-event desktop-mode-my-wordpress__footprint-event--${ev.kind}`;
      const dot = document.createElement("span");
      dot.className = "desktop-mode-my-wordpress__footprint-dot";
      const icon = document.createElement("span");
      icon.className = "dashicons " + (ev.kind === "comment" ? "dashicons-admin-comments" : "dashicons-admin-post");
      icon.setAttribute("aria-hidden", "true");
      dot.appendChild(icon);
      li.appendChild(dot);
      const body = document.createElement("div");
      body.className = "desktop-mode-my-wordpress__footprint-event-body";
      const title = ev.title || __("(no title)", "desktop-mode");
      const titleNode = ev.link ? document.createElement("a") : document.createElement("span");
      titleNode.className = "desktop-mode-my-wordpress__footprint-event-title";
      titleNode.textContent = ev.kind === "comment" ? sprintf(
        // translators: %s is a post title the user commented on.
        __("Commented on “%s”", "desktop-mode"),
        title
      ) : title;
      if (ev.link && titleNode instanceof HTMLAnchorElement) {
        titleNode.href = ev.link;
        titleNode.target = "_blank";
        titleNode.rel = "noopener noreferrer";
      }
      body.appendChild(titleNode);
      const meta = document.createElement("span");
      meta.className = "desktop-mode-my-wordpress__footprint-event-meta";
      const parts = [formatLongDate(ev.date)];
      if (ev.status && ev.status !== "publish" && ev.status !== "approved") {
        parts.push(ev.status);
      }
      meta.textContent = parts.join(" · ");
      body.appendChild(meta);
      li.appendChild(body);
      list.appendChild(li);
    }
    section.appendChild(list);
    return section;
  }
  function buildFootprintFooter(payload, userId, userName) {
    const footer = document.createElement("footer");
    footer.className = "desktop-mode-my-wordpress__footprint-section desktop-mode-my-wordpress__footprint-footer";
    const archiveBtn = document.createElement("wpd-button");
    archiveBtn.setAttribute("variant", "ghost");
    archiveBtn.textContent = __("View author archive", "desktop-mode");
    archiveBtn.addEventListener("click", () => {
      if (payload.profile.link) {
        window.open(payload.profile.link, "_blank", "noopener,noreferrer");
      }
    });
    if (!payload.profile.link) {
      archiveBtn.setAttribute("disabled", "");
    }
    footer.appendChild(archiveBtn);
    const editBtn = document.createElement("wpd-button");
    editBtn.setAttribute("variant", "primary");
    editBtn.textContent = __("Show profile", "desktop-mode");
    editBtn.addEventListener("click", () => {
      openUserEditWindow(userId);
    });
    footer.appendChild(editBtn);
    return footer;
  }
  function formatShortDate(iso) {
    if (!iso) {
      return "";
    }
    try {
      return new Date(iso).toLocaleDateString(void 0, {
        month: "short",
        day: "numeric"
      });
    } catch {
      return iso;
    }
  }
  function formatLongDate(iso) {
    if (!iso) {
      return "";
    }
    try {
      return new Date(iso).toLocaleDateString(void 0, {
        year: "numeric",
        month: "short",
        day: "numeric"
      });
    } catch {
      return iso;
    }
  }
  function sanitizeClass(raw) {
    return (raw || "").replace(/[^a-zA-Z0-9_-]/g, "");
  }
  function extractContentMediaIds(html) {
    if (!html || typeof html !== "string") {
      return [];
    }
    const ids = [];
    const seen = /* @__PURE__ */ new Set();
    const push = (raw) => {
      const id = parseInt(raw, 10);
      if (Number.isFinite(id) && id > 0 && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    };
    const wpImage = /\bwp-image-(\d+)\b/g;
    let m;
    while ((m = wpImage.exec(html)) !== null) {
      push(m[1]);
    }
    const captionShort = /\[caption[^\]]*id="attachment_(\d+)"/g;
    while ((m = captionShort.exec(html)) !== null) {
      push(m[1]);
    }
    return ids;
  }
  function createTileSelector() {
    let selected = null;
    return (tile) => {
      if (selected === tile) {
        return;
      }
      if (selected) {
        selected.classList.remove(
          "desktop-mode-my-wordpress__tile--selected"
        );
      }
      tile.classList.add("desktop-mode-my-wordpress__tile--selected");
      selected = tile;
    };
  }
  const TILE_W = 96;
  const TILE_H = 92;
  const TILE_PAD = 16;
  function createTileLayout(host, scope) {
    const positions = loadPositions(scope);
    const entries = [];
    const occupied = /* @__PURE__ */ new Set();
    host.classList.add("desktop-mode-my-wordpress__canvas--positioned");
    const cellOf = (x, y) => ({
      col: Math.max(0, Math.round((x - TILE_PAD) / TILE_W)),
      row: Math.max(0, Math.round((y - TILE_PAD) / TILE_H))
    });
    const occupyAt = (x, y) => {
      const { col, row } = cellOf(x, y);
      occupied.add(`${col},${row}`);
    };
    const releaseAt = (x, y) => {
      const { col, row } = cellOf(x, y);
      occupied.delete(`${col},${row}`);
    };
    const recomputeHostHeight = () => {
      let maxBottom = 0;
      for (const child of Array.from(host.children)) {
        if (!(child instanceof HTMLElement)) {
          continue;
        }
        if (!child.classList.contains("desktop-mode-file-tile")) {
          continue;
        }
        const top = parseFloat(child.style.top || "0");
        maxBottom = Math.max(maxBottom, top + TILE_H);
      }
      host.style.minHeight = `${Math.max(0, maxBottom + TILE_PAD)}px`;
    };
    const nextFreeCell = (cols) => {
      for (let n = 0; ; n += 1) {
        const col = n % cols;
        const row = Math.floor(n / cols);
        if (!occupied.has(`${col},${row}`)) {
          return { col, row };
        }
      }
    };
    const place = (tile, key, sortable) => {
      const saved = positions[key];
      const width = host.clientWidth > 0 ? host.clientWidth : TILE_PAD + 5 * TILE_W;
      const cols = Math.max(
        1,
        Math.floor((width - TILE_PAD) / TILE_W)
      );
      const fits = saved && saved.x + TILE_W <= width;
      const entry = {
        key,
        tile,
        sortable,
        userPlaced: !!fits
      };
      entries.push(entry);
      let x;
      let y;
      if (fits && saved) {
        x = saved.x;
        y = saved.y;
      } else {
        if (saved && !fits) {
          delete positions[key];
          savePositions(scope, positions);
        }
        const cell = nextFreeCell(cols);
        x = TILE_PAD + cell.col * TILE_W;
        y = TILE_PAD + cell.row * TILE_H;
      }
      occupyAt(x, y);
      applyTilePosition(tile, x, y);
      recomputeHostHeight();
    };
    const commit = (tile, key, x, y) => {
      const oldX = parseFloat(tile.style.left || "0");
      const oldY = parseFloat(tile.style.top || "0");
      releaseAt(oldX, oldY);
      applyTilePosition(tile, x, y);
      occupyAt(x, y);
      positions[key] = { x, y };
      savePositions(scope, positions);
      const entry = entries.find((e) => e.key === key);
      if (entry) {
        entry.userPlaced = true;
      }
      recomputeHostHeight();
    };
    const reflow = () => {
      const width = host.clientWidth > 0 ? host.clientWidth : TILE_PAD + 5 * TILE_W;
      const cols = Math.max(
        1,
        Math.floor((width - TILE_PAD) / TILE_W)
      );
      const overflowing = entries.some((entry) => {
        const left = parseFloat(entry.tile.style.left || "0");
        return left + TILE_W > width;
      });
      if (overflowing) {
        for (const k of Object.keys(positions)) {
          delete positions[k];
        }
        savePositions(scope, positions);
        for (const entry of entries) {
          entry.userPlaced = false;
        }
      }
      occupied.clear();
      for (const entry of entries) {
        if (!entry.userPlaced) {
          continue;
        }
        const left = parseFloat(entry.tile.style.left || "0");
        const top = parseFloat(entry.tile.style.top || "0");
        occupyAt(left, top);
      }
      let autoCount = 0;
      for (const entry of entries) {
        if (entry.userPlaced) {
          continue;
        }
        const cell = nextFreeCell(cols);
        const x = TILE_PAD + cell.col * TILE_W;
        const y = TILE_PAD + cell.row * TILE_H;
        applyTilePosition(entry.tile, x, y);
        occupyAt(x, y);
        autoCount += 1;
      }
      recomputeHostHeight();
      doAction("desktop-mode.icon-canvas.reflow", {
        scope,
        cols,
        autoCount,
        overflowing
      });
    };
    const sort = (mode) => {
      const sorted = entries.slice().sort((a, b) => {
        switch (mode) {
          case "name-asc":
            return a.sortable.name.localeCompare(b.sortable.name);
          case "name-desc":
            return b.sortable.name.localeCompare(a.sortable.name);
          case "date-asc":
            return Date.parse(a.sortable.date) - Date.parse(b.sortable.date);
          case "date-desc":
            return Date.parse(b.sortable.date) - Date.parse(a.sortable.date);
          default:
            return 0;
        }
      });
      const width = host.clientWidth > 0 ? host.clientWidth : TILE_PAD + 5 * TILE_W;
      const cols = Math.max(
        1,
        Math.floor((width - TILE_PAD) / TILE_W)
      );
      for (const k of Object.keys(positions)) {
        delete positions[k];
      }
      occupied.clear();
      sorted.forEach((entry, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const x = TILE_PAD + col * TILE_W;
        const y = TILE_PAD + row * TILE_H;
        applyTilePosition(entry.tile, x, y);
        occupyAt(x, y);
        positions[entry.key] = { x, y };
        entry.userPlaced = true;
      });
      savePositions(scope, positions);
      for (const entry of sorted) {
        host.appendChild(entry.tile);
      }
      recomputeHostHeight();
    };
    let lastWidth = host.clientWidth;
    let resizeObserver = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        const w = host.clientWidth;
        if (w === lastWidth) {
          return;
        }
        lastWidth = w;
        reflow();
      });
      resizeObserver.observe(host);
    }
    return {
      host,
      scope,
      place,
      commit,
      sort,
      reflow,
      dispose: () => {
        resizeObserver?.disconnect();
        resizeObserver = null;
      }
    };
  }
  function applyTilePosition(tile, x, y) {
    tile.style.left = `${Math.round(x)}px`;
    tile.style.top = `${Math.round(y)}px`;
  }
  function loadPositions(scope) {
    try {
      const raw = window.localStorage.getItem(storageKey(scope));
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  function savePositions(scope, positions) {
    try {
      window.localStorage.setItem(
        storageKey(scope),
        JSON.stringify(positions)
      );
    } catch {
    }
  }
  function storageKey(scope) {
    return `desktop-mode-my-wordpress:positions:${scope}`;
  }
  let activeState = null;
  let pendingRoute = null;
  function renderInto(body) {
    const root = body.querySelector(ROOT_SEL);
    if (!root) {
      return;
    }
    const breadcrumbsHost = root.querySelector(BREADCRUMBS_SEL);
    const bodyHost = root.querySelector(BODY_SEL);
    const statusHost = root.querySelector(STATUS_SEL);
    if (!breadcrumbsHost || !bodyHost || !statusHost) {
      return;
    }
    const state = {
      route: { kind: "root" },
      body: bodyHost,
      root,
      breadcrumbs: breadcrumbsHost,
      statusBar: statusHost,
      teardown: []
    };
    activeState = state;
    const closeHandler = (e) => {
      const detail = e.detail;
      if (detail?.windowId === WINDOW_ID) {
        clearTeardown(state);
        closeAnyTileMenu();
        if (activeState === state) {
          activeState = null;
        }
        document.removeEventListener("desktop-mode-window-closed", closeHandler);
      }
    };
    document.addEventListener("desktop-mode-window-closed", closeHandler);
    state.teardown.push(() => closeAnyTileMenu());
    const initialRoute = pendingRoute ?? { kind: "root" };
    pendingRoute = null;
    navigate(state, initialRoute);
  }
  const callback = (body) => {
    try {
      renderInto(body);
    } catch (err) {
      console.error("[my-wordpress] render failed:", err);
    }
  };
  window.desktopModeNativeWindows = window.desktopModeNativeWindows || {};
  window.desktopModeNativeWindows[WINDOW_ID] = callback;
  function openDetail(args) {
    const route = {
      kind: "detail",
      entityId: args.entityId,
      postId: args.postId,
      postTitle: args.postTitle
    };
    if (activeState) {
      navigate(activeState, route);
      return;
    }
    pendingRoute = route;
    const desktop = window.wp?.desktop;
    desktop?.openWindow?.(WINDOW_ID, { source: "my-wordpress/open-detail" });
  }
  const desktopGlobal = window.wp?.desktop;
  if (desktopGlobal) {
    desktopGlobal.myWordpress = { openDetail };
  }
})();
