var desktopModeRecycleBin = function(exports) {
  "use strict";
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
  const SHARED_STORES_SLOT = "__desktopModeSharedStores";
  function resolveSlot() {
    const w = window;
    let slot = w[SHARED_STORES_SLOT];
    if (!slot) {
      slot = /* @__PURE__ */ new Map();
      w[SHARED_STORES_SLOT] = slot;
    }
    return slot;
  }
  function createSharedStore(key, initialState) {
    const slot = resolveSlot();
    let record = slot.get(key);
    if (!record) {
      record = {
        state: initialState(),
        listeners: /* @__PURE__ */ new Set(),
        rebuild: initialState
      };
      slot.set(key, record);
    }
    const handle = {
      // `record.state` is the live reference. The getter on the
      // `state` field reads the latest value even if `reset()`
      // reassigned it to a fresh object.
      get state() {
        return record.state;
      },
      set state(next) {
        record.state = next;
      },
      getState() {
        return record.state;
      },
      notify() {
        for (const cb of Array.from(record.listeners)) {
          try {
            cb(record.state);
          } catch (err) {
            console.error(
              `[desktop-mode/shared-store:${key}] subscriber threw:`,
              err
            );
          }
        }
      },
      subscribe(cb) {
        record.listeners.add(cb);
        return () => {
          record.listeners.delete(cb);
        };
      },
      setState(patch) {
        const cur = record.state;
        if (typeof cur !== "object" || cur === null) {
          console.warn(
            `[desktop-mode/shared-store:${key}] setState called on a primitive store; use the state setter instead.`
          );
          return;
        }
        Object.assign(cur, patch);
        handle.notify();
      },
      reset() {
        const fresh = record.rebuild();
        const cur = record.state;
        if (typeof cur === "object" && cur !== null && typeof fresh === "object" && fresh !== null) {
          const target = cur;
          for (const k of Object.keys(target)) {
            delete target[k];
          }
          Object.assign(target, fresh);
        } else {
          record.state = fresh;
        }
        record.listeners.clear();
      }
    };
    return handle;
  }
  const LOG_PREFIX = "[desktop-mode-bin badge]";
  function log(...args) {
    try {
      if (window.localStorage?.getItem("desktopModeBinDebug")) {
        console.info(LOG_PREFIX, ...args);
      }
    } catch {
    }
  }
  const TARGET_ID = "desktop-mode-recycle-bin";
  function getDesktopApi() {
    return window.wp?.desktop;
  }
  const store = createSharedStore(
    "desktop-mode/recycle-bin/badge",
    () => ({
      current: 0,
      seenTs: 0,
      started: false,
      countUrl: ""
    })
  );
  function setRecycleBinBadge(next) {
    const safe = Math.max(0, Math.floor(next));
    const prev = store.state.current;
    store.state.current = safe;
    log("setRecycleBinBadge", { prev, next: safe });
    paintBadge(safe);
  }
  function paintBadge(count) {
    const desktop = getDesktopApi();
    const active = isBinWindowActive();
    const visible = active ? 0 : count;
    log("paintBadge", { count, visible, active });
    desktop?.dock?.setBadge?.(TARGET_ID, visible);
    desktop?.taskbar?.setBadge?.(TARGET_ID, visible);
    desktop?.icons?.setBadge?.(TARGET_ID, visible);
  }
  function isBinWindowActive() {
    return !!getDesktopApi()?.windowManager?.isActive?.(TARGET_ID);
  }
  const DEFAULT_MAX_ITERATIONS = 1e3;
  async function runEmptyLoop(options) {
    const { emptyBin: emptyBin2, onProgress, maxIterations = DEFAULT_MAX_ITERATIONS } = options;
    let purged = 0;
    let skipped = 0;
    let initialTotal = 0;
    let remaining = 0;
    let stoppedBecause = "iteration-cap";
    for (let i = 0; i < maxIterations; i++) {
      const result = await emptyBin2();
      purged += result.purged;
      skipped += result.skipped;
      remaining = result.remaining;
      if (i === 0) {
        initialTotal = purged + result.remaining;
      }
      onProgress?.({ purged, skipped, initialTotal });
      if (result.remaining === 0) {
        stoppedBecause = "empty";
        break;
      }
      if (result.purged === 0 && result.skipped > 0) {
        stoppedBecause = "no-progress";
        break;
      }
    }
    return { purged, skipped, initialTotal, remaining, stoppedBecause };
  }
  const EVENT_NAME = "desktop-mode-recycle-bin-changed";
  const HEARTBEAT_FIELD = "desktop_mode_recycle_bin_seen_ts";
  const POSTMESSAGE_TYPE = "desktop-mode-recycle-bin-changed";
  const state = {
    started: false,
    seenTs: 0,
    postMessageHandler: null,
    heartbeatSendHandler: null,
    heartbeatTickHandler: null
  };
  function dispatchChanged(source, ts) {
    const detail = {
      kind: "external",
      ok: 0,
      errors: [],
      source,
      ts
    };
    document.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
    const hooks = window.wp?.hooks;
    if (hooks && typeof hooks.doAction === "function") {
      hooks.doAction("desktop_mode.recycleBin.changed", detail);
    }
  }
  function start() {
    if (state.started) {
      return;
    }
    state.started = true;
    state.seenTs = Date.now();
    const expectedOrigin = window.location.origin;
    state.postMessageHandler = (e) => {
      if (e.origin !== expectedOrigin) {
        return;
      }
      const data = e.data;
      if (!data || data.type !== POSTMESSAGE_TYPE) {
        return;
      }
      const ts = typeof data.ts === "number" ? data.ts : Date.now();
      if (ts <= state.seenTs) {
        return;
      }
      state.seenTs = ts;
      dispatchChanged("chromeless", ts);
    };
    window.addEventListener("message", state.postMessageHandler);
    const $ = window.jQuery;
    if (!$) {
      return;
    }
    state.heartbeatSendHandler = (...args) => {
      const data = args[1];
      if (data) {
        data[HEARTBEAT_FIELD] = state.seenTs;
      }
    };
    $(document).on("heartbeat-send", state.heartbeatSendHandler);
    state.heartbeatTickHandler = (...args) => {
      const response = args[1];
      const block = response?.desktop_mode_recycle_bin;
      if (!block) {
        return;
      }
      const ts = typeof block.ts === "number" ? block.ts : 0;
      if (ts > state.seenTs) {
        state.seenTs = ts;
        if (block.changed) {
          dispatchChanged("heartbeat", ts);
        }
      }
    };
    $(document).on("heartbeat-tick", state.heartbeatTickHandler);
  }
  function stop() {
    if (!state.started) {
      return;
    }
    state.started = false;
    if (state.postMessageHandler) {
      window.removeEventListener("message", state.postMessageHandler);
      state.postMessageHandler = null;
    }
    const $ = window.jQuery;
    if ($) {
      if (state.heartbeatSendHandler) {
        $(document).off("heartbeat-send", state.heartbeatSendHandler);
      }
      if (state.heartbeatTickHandler) {
        $(document).off("heartbeat-tick", state.heartbeatTickHandler);
      }
    }
    state.heartbeatSendHandler = null;
    state.heartbeatTickHandler = null;
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
  function config() {
    const cfg = window.desktopModeRecycleBinConfig;
    if (!cfg) {
      throw new Error(
        "desktopModeRecycleBinConfig is missing — config blob did not reach the page. This typically means the recycle-bin script handle was lazy-loaded by desktop-mode without its `wp_localize_script` data being included in the payload. See docs/examples/window-with-config.md."
      );
    }
    return cfg;
  }
  async function request(url, init) {
    const cfg = config();
    const response = await trackedFetch(
      url,
      {
        ...init,
        credentials: "same-origin",
        headers: {
          "X-WP-Nonce": cfg.restNonce,
          Accept: "application/json",
          ...init.body ? { "Content-Type": "application/json" } : {},
          ...init.headers ?? {}
        }
      },
      { source: "desktop-mode/recycle-bin" }
    );
    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`;
      try {
        const json = await response.json();
        if (json && typeof json.message === "string") {
          message = json.message;
        }
      } catch {
      }
      throw new Error(message);
    }
    return await response.json();
  }
  function fetchList(params = {}) {
    const url = new URL(config().listUrl);
    if (params.page) {
      url.searchParams.set("page", String(params.page));
    }
    if (params.perPage) {
      url.searchParams.set("per_page", String(params.perPage));
    }
    if (params.type) {
      url.searchParams.set("type", params.type);
    }
    if (params.search) {
      url.searchParams.set("search", params.search);
    }
    return request(url.toString(), { method: "GET" });
  }
  function restoreItems(items) {
    return request(config().restoreUrl, {
      method: "POST",
      body: JSON.stringify({ items })
    });
  }
  function purgeItems(items) {
    return request(config().purgeUrl, {
      method: "POST",
      body: JSON.stringify({ items })
    });
  }
  function emptyBin() {
    return request(config().emptyUrl, {
      method: "POST",
      body: JSON.stringify({})
    });
  }
  function wpdConfirmGlobal(options) {
    const fn = window.wp?.desktop?.confirm;
    if (typeof fn !== "function") {
      return Promise.reject(
        new Error(
          "[desktop-mode] wp.desktop.confirm is missing — the main desktop bundle must load before the recycle-bin script."
        )
      );
    }
    return fn(options);
  }
  function mapRecycleTypeToFileType(recycleType) {
    if (recycleType === "attachment") {
      return "attachment";
    }
    if (recycleType === "comment") {
      return "comment";
    }
    return "post";
  }
  const ROOT = "[data-desktop-mode-recycle-bin-root]";
  const FILTER = "[data-desktop-mode-recycle-bin-filter]";
  const SEARCH = "[data-desktop-mode-recycle-bin-search]";
  const REFRESH = "[data-desktop-mode-recycle-bin-refresh]";
  const TABLE = "[data-desktop-mode-recycle-bin-table]";
  const BULK = "[data-desktop-mode-recycle-bin-bulk]";
  const COUNT = "[data-desktop-mode-recycle-bin-count]";
  const RESTORE_SEL = "[data-desktop-mode-recycle-bin-restore-selected]";
  const PIN_TO_DESKTOP = "[data-desktop-mode-recycle-bin-pin-to-desktop]";
  const PURGE_SEL = "[data-desktop-mode-recycle-bin-purge-selected]";
  const EMPTY_BTN = "[data-desktop-mode-recycle-bin-empty]";
  let currentRowActionRestore = () => {
  };
  let currentRowActionPurge = () => {
  };
  const rowActionRestore = (ref) => currentRowActionRestore(ref);
  const rowActionPurge = (ref) => currentRowActionPurge(ref);
  let cachedItems = null;
  function itemsFingerprint(items) {
    if (items.length === 0) {
      return "";
    }
    const parts = items.map((i) => `${i.id}:${i.deleted_at}`).sort();
    return parts.join("|");
  }
  function buildColumns() {
    const cols = [
      {
        key: "title",
        label: __("Title"),
        sortable: true,
        filter: "text",
        render: (_v, row) => {
          const wrap = document.createElement("span");
          wrap.style.cssText = "display:flex;align-items:center;gap:10px;min-width:0;";
          const showsThumb = row.preview && row.type === "attachment" && row.mime.startsWith("image/");
          if (showsThumb) {
            const img = document.createElement("img");
            img.src = row.preview;
            img.alt = "";
            img.loading = "lazy";
            img.style.cssText = "width:36px;height:36px;border-radius:4px;object-fit:cover;display:block;flex-shrink:0;";
            wrap.appendChild(img);
          }
          const stack = document.createElement("span");
          stack.style.cssText = "display:flex;flex-direction:column;gap:2px;min-width:0;";
          const title = document.createElement("span");
          title.style.cssText = "font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:320px;";
          title.textContent = row.title;
          title.title = row.title;
          stack.appendChild(title);
          if (row.subtitle) {
            const sub = document.createElement("span");
            sub.style.cssText = "font-size:12px;color:#50575e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:320px;";
            sub.textContent = row.subtitle;
            sub.title = row.subtitle;
            stack.appendChild(sub);
          }
          wrap.appendChild(stack);
          return wrap;
        }
      },
      // No explicit Type column — the title + the toolbar's type
      // filter tabs already convey the entity kind, and an extra
      // column inflates the row visually for no signal gain.
      {
        key: "deleted_at",
        label: __("Deleted"),
        sortable: true,
        width: "180px",
        sortValue: (row) => Date.parse(row.deleted_at + "Z") || 0,
        render: (_v, row) => {
          const el = document.createElement("wpd-relative-time");
          el.setAttribute("datetime", row.deleted_at);
          return el;
        }
      },
      {
        key: "deleted_by",
        label: __("By"),
        sortable: true,
        filter: "text",
        width: "160px",
        render: (_v, row) => row.deleted_by || "—"
      },
      {
        key: "__actions",
        label: "",
        width: "96px",
        align: "end",
        render: (_v, row) => {
          const wrap = document.createElement("span");
          wrap.style.cssText = "display:inline-flex;gap:4px;justify-content:flex-end;align-items:center;flex-wrap:nowrap;white-space:nowrap;line-height:1;";
          if (row.can_restore) {
            wrap.appendChild(makeRowButton({
              label: __("Restore"),
              icon: "restore",
              onClick: () => rowActionRestore({ id: row.id, type: row.type })
            }));
          }
          if (row.can_purge) {
            wrap.appendChild(makeRowButton({
              label: __("Delete forever"),
              icon: "trash",
              variant: "danger",
              onClick: () => rowActionPurge({ id: row.id, type: row.type })
            }));
          }
          return wrap;
        }
      }
    ];
    const hooks = window.wp?.hooks;
    if (hooks && typeof hooks.applyFilters === "function") {
      return hooks.applyFilters(
        "desktop_mode.recycleBin.columns",
        cols
      );
    }
    return cols;
  }
  const ICON_SVG = {
    restore: '<path d="M12 5V2L7 6l5 4V7c2.76 0 5 2.24 5 5 0 .83-.21 1.61-.57 2.3l1.46 1.46A6.96 6.96 0 0 0 19 12c0-3.87-3.13-7-7-7zm0 12c-2.76 0-5-2.24-5-5 0-.83.21-1.61.57-2.3L6.11 8.24A6.96 6.96 0 0 0 5 12c0 3.87 3.13 7 7 7v3l5-4-5-4v3z" fill="currentColor"/>',
    trash: '<path d="M9 3v1H4v2h1v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6h1V4h-5V3H9zm0 5h2v9H9V8zm4 0h2v9h-2V8z" fill="currentColor"/>'
  };
  function makeRowButton(opts) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("data-noclick", "");
    btn.setAttribute("aria-label", opts.label);
    btn.title = opts.label;
    const isDanger = opts.variant === "danger";
    const restColor = isDanger ? "#d63638" : "#50575e";
    const restBorder = isDanger ? "#d63638" : "#c3c4c7";
    const applyRest = () => {
      btn.style.background = "#fff";
      btn.style.color = restColor;
      btn.style.borderColor = restBorder;
    };
    const applyHover = () => {
      if (isDanger) {
        btn.style.background = "#d63638";
        btn.style.color = "#fff";
        btn.style.borderColor = "#d63638";
      } else {
        btn.style.background = "#f0f0f1";
        btn.style.color = "#1d2327";
        btn.style.borderColor = "#8c8f94";
      }
    };
    btn.style.cssText = [
      "display: inline-flex",
      "align-items: center",
      "justify-content: center",
      "flex: 0 0 30px",
      "width: 30px",
      "height: 30px",
      "padding: 0",
      "margin: 0",
      "border: 1px solid " + restBorder,
      "border-radius: 6px",
      "background: #fff",
      "color: " + restColor,
      "cursor: pointer",
      "box-sizing: border-box",
      "line-height: 1",
      "font: inherit",
      "transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease"
    ].join(";");
    btn.addEventListener("mouseenter", applyHover);
    btn.addEventListener("mouseleave", applyRest);
    btn.addEventListener("focus", applyHover);
    btn.addEventListener("blur", applyRest);
    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.style.display = "block";
    svg.innerHTML = ICON_SVG[opts.icon] ?? "";
    btn.appendChild(svg);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      opts.onClick();
    });
    return btn;
  }
  function renderRecycleBin(body) {
    const root = body.querySelector(ROOT);
    const table = body.querySelector(TABLE);
    if (!root || !table) {
      return;
    }
    const state2 = {
      filter: "",
      search: "",
      searchDebounce: null
    };
    currentRowActionRestore = (ref) => void handleRestore([ref]);
    currentRowActionPurge = (ref) => void handlePurge([ref]);
    table.columns = buildColumns();
    table.getRowId = (row) => row.id;
    let currentFingerprint = "";
    if (cachedItems) {
      table.data = cachedItems;
      currentFingerprint = itemsFingerprint(cachedItems);
      table.removeAttribute("loading");
    }
    let refreshSeq = 0;
    const refresh = async () => {
      const showSkeleton = !cachedItems;
      const mySeq = ++refreshSeq;
      if (showSkeleton) {
        table.toggleAttribute("loading", true);
      }
      try {
        const { items, total } = await fetchList({
          type: state2.filter,
          search: state2.search,
          perPage: 200
        });
        if (mySeq !== refreshSeq) {
          return;
        }
        const next = itemsFingerprint(items);
        if (next !== currentFingerprint) {
          table.data = items;
          currentFingerprint = next;
          cachedItems = items;
        } else {
          cachedItems = items;
        }
        setRecycleBinBadge(total);
      } catch (err) {
        if (mySeq !== refreshSeq) {
          return;
        }
        console.error("[recycle-bin] list failed", err);
        if (showSkeleton) {
          table.data = [];
          currentFingerprint = "";
        }
      } finally {
        if (mySeq === refreshSeq) {
          if (showSkeleton) {
            table.toggleAttribute("loading", false);
          }
          refreshBulkBar();
        }
      }
    };
    const bulk = root.querySelector(BULK);
    const countEl = root.querySelector(COUNT);
    const refreshBulkBar = () => {
      if (!bulk || !countEl) {
        return;
      }
      const selected = Array.from(table.selection ?? []);
      if (selected.length === 0) {
        bulk.hidden = true;
        return;
      }
      bulk.hidden = false;
      countEl.textContent = sprintf(
        /* translators: %d: selected row count. */
        __("%d selected"),
        selected.length
      );
    };
    const collectSelectedItems = () => {
      const sel = Array.from(table.selection ?? []);
      const idSet = new Set(sel.map((id) => Number(id)));
      const out = [];
      for (const row of table.data ?? []) {
        if (idSet.has(row.id)) {
          out.push({ id: row.id, type: row.type });
        }
      }
      return out;
    };
    const handleRestore = async (refs) => {
      if (refs.length === 0) {
        return;
      }
      const types = Array.from(new Set(refs.map((r) => r.type)));
      try {
        const result = await restoreItems(refs);
        emitDoneEvent("restore", result.ok, result.errors, types, result.ok);
      } catch (err) {
        console.error("[recycle-bin] restore failed", err);
      }
      table.clearSelection();
      await refresh();
    };
    const handlePinToDesktop = async (refs) => {
      if (refs.length === 0) {
        return;
      }
      const types = Array.from(new Set(refs.map((r) => r.type)));
      try {
        const restored = await restoreItems(refs);
        const filesApi = window.wp?.desktop?.files?.rest;
        if (filesApi) {
          let i = 0;
          for (const ref of refs) {
            if (!restored.ok.includes(ref.id)) {
              continue;
            }
            const desktopType = mapRecycleTypeToFileType(ref.type);
            if (!desktopType) {
              continue;
            }
            try {
              await filesApi.createPlacement({
                type: desktopType,
                ref: String(ref.id),
                x: 16 + i % 5 * 96,
                y: 16 + Math.floor(i / 5) * 110
              });
            } catch (err) {
              console.error("[recycle-bin] pin-to-desktop placement failed", err);
            }
            i += 1;
          }
        }
        emitDoneEvent("restore", restored.ok, restored.errors, types, restored.ok);
      } catch (err) {
        console.error("[recycle-bin] pin-to-desktop failed", err);
      }
      table.clearSelection();
      await refresh();
    };
    const handlePurge = async (refs) => {
      if (refs.length === 0) {
        return;
      }
      const ok = await wpdConfirmGlobal({
        title: __("Delete forever?"),
        message: sprintf(
          /* translators: %d: row count. */
          __("Permanently delete %d item(s)? This cannot be undone."),
          refs.length
        ),
        confirmLabel: __("Delete forever"),
        danger: true
      });
      if (!ok) {
        return;
      }
      const types = Array.from(new Set(refs.map((r) => r.type)));
      try {
        const result = await purgeItems(refs);
        emitDoneEvent("purge", result.ok, result.errors, types, result.ok);
      } catch (err) {
        console.error("[recycle-bin] purge failed", err);
      }
      table.clearSelection();
      await refresh();
    };
    const emptyButton = root.querySelector(EMPTY_BTN);
    let emptyButtonLabelEl = null;
    let emptyButtonOriginalLabel = "";
    if (emptyButton) {
      const trailingText = Array.from(emptyButton.childNodes).find(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== ""
      );
      emptyButtonOriginalLabel = (trailingText?.textContent ?? "").trim();
      emptyButtonLabelEl = document.createElement("span");
      emptyButtonLabelEl.setAttribute(
        "data-desktop-mode-recycle-bin-empty-label",
        ""
      );
      emptyButtonLabelEl.textContent = emptyButtonOriginalLabel;
      if (trailingText) {
        trailingText.replaceWith(emptyButtonLabelEl);
      } else {
        emptyButton.appendChild(emptyButtonLabelEl);
      }
    }
    const setEmptyButtonState = (mode, purged = 0, total = 0) => {
      if (!emptyButton || !emptyButtonLabelEl) {
        return;
      }
      if (mode === "idle") {
        emptyButton.removeAttribute("disabled");
        emptyButton.removeAttribute("aria-busy");
        emptyButtonLabelEl.textContent = emptyButtonOriginalLabel;
        return;
      }
      emptyButton.setAttribute("disabled", "");
      emptyButton.setAttribute("aria-busy", "true");
      emptyButtonLabelEl.textContent = mode === "starting" || total === 0 ? __("Emptying…") : sprintf(
        /* translators: 1: items purged so far, 2: items in bin when emptying began. */
        __("Emptying… %1$d of %2$d"),
        purged,
        total
      );
    };
    const handleEmpty = async () => {
      const ok = await wpdConfirmGlobal({
        title: __("Empty bin?"),
        message: __(
          "Empty the recycle bin? Every item visible in the current view will be permanently deleted."
        ),
        confirmLabel: __("Empty bin"),
        danger: true
      });
      if (!ok) {
        return;
      }
      const allTypes = Array.from(
        new Set((table.data ?? []).map((r) => r.type))
      );
      setEmptyButtonState("starting");
      try {
        const loop = await runEmptyLoop({
          emptyBin,
          onProgress: ({ purged, initialTotal }) => setEmptyButtonState("progress", purged, initialTotal)
        });
        emitDoneEvent(
          "empty",
          new Array(loop.purged).fill(0),
          loop.skipped > 0 ? [{
            id: 0,
            code: "desktop_mode_recycle_bin_skipped",
            message: sprintf(
              /* translators: %d: skipped count. */
              __("%d item(s) skipped (insufficient permissions)."),
              loop.skipped
            )
          }] : [],
          allTypes,
          []
        );
        if (loop.stoppedBecause === "empty") {
          setRecycleBinBadge(0);
        }
      } catch (err) {
        console.error("[recycle-bin] empty failed", err);
      } finally {
        setEmptyButtonState("idle");
      }
      await refresh();
    };
    root.querySelector(FILTER)?.addEventListener("wpd-pick", (e) => {
      const detail = e.detail;
      state2.filter = detail?.value ?? "";
      void refresh();
    });
    const search = root.querySelector(SEARCH);
    search?.addEventListener("wpd-input-change", (e) => {
      const value = e.detail?.value ?? "";
      state2.search = value;
      if (state2.searchDebounce !== null) {
        window.clearTimeout(state2.searchDebounce);
      }
      state2.searchDebounce = window.setTimeout(() => {
        void refresh();
      }, 250);
    });
    body.addEventListener("click", (e) => {
      const target = e.target;
      if (!target) {
        return;
      }
      if (target.closest(REFRESH)) {
        void refresh();
        return;
      }
      if (target.closest(RESTORE_SEL)) {
        void handleRestore(collectSelectedItems());
        return;
      }
      if (target.closest(PIN_TO_DESKTOP)) {
        void handlePinToDesktop(collectSelectedItems());
        return;
      }
      if (target.closest(PURGE_SEL)) {
        void handlePurge(collectSelectedItems());
        return;
      }
      if (target.closest(EMPTY_BTN)) {
        void handleEmpty();
      }
    });
    table.addEventListener("wpd-table-selection-change", () => {
      refreshBulkBar();
    });
    table.sort = { key: "deleted_at", direction: "desc" };
    start();
    let externalRefreshTimer = null;
    const onExternalChange = (e) => {
      const detail = e.detail;
      if (!detail?.source || detail.source === "local") {
        return;
      }
      if (externalRefreshTimer !== null) {
        window.clearTimeout(externalRefreshTimer);
      }
      externalRefreshTimer = window.setTimeout(() => {
        externalRefreshTimer = null;
        void refresh();
      }, 200);
    };
    document.addEventListener("desktop-mode-recycle-bin-changed", onExternalChange);
    const broadcastUnsubs = [];
    const api = window.wp?.desktop;
    if (api && typeof api.subscribe === "function") {
      const onDomainChanged = (payload) => {
        const detail = payload;
        if (detail?.source === "recycle-bin") {
          return;
        }
        if (externalRefreshTimer !== null) {
          window.clearTimeout(externalRefreshTimer);
        }
        externalRefreshTimer = window.setTimeout(() => {
          externalRefreshTimer = null;
          void refresh();
        }, 200);
      };
      broadcastUnsubs.push(
        api.subscribe("desktop-mode.post.changed", onDomainChanged),
        api.subscribe("desktop-mode.page.changed", onDomainChanged),
        api.subscribe("desktop-mode.attachment.changed", onDomainChanged),
        api.subscribe("desktop-mode.comment.changed", onDomainChanged),
        api.subscribe("desktop-mode.placement.changed", onDomainChanged),
        api.subscribe("desktop-mode.shortcut.changed", onDomainChanged),
        api.subscribe("desktop-mode.folder.changed", onDomainChanged)
      );
    }
    const onWindowClosed = (e) => {
      const detail = e.detail;
      if (detail?.windowId !== "desktop-mode-recycle-bin") {
        return;
      }
      stop();
      document.removeEventListener(
        "desktop-mode-recycle-bin-changed",
        onExternalChange
      );
      for (const unsub of broadcastUnsubs) {
        try {
          unsub();
        } catch (err) {
        }
      }
      broadcastUnsubs.length = 0;
      if (externalRefreshTimer !== null) {
        window.clearTimeout(externalRefreshTimer);
        externalRefreshTimer = null;
      }
      currentRowActionRestore = () => {
      };
      currentRowActionPurge = () => {
      };
      document.removeEventListener("desktop-mode-window-closed", onWindowClosed);
    };
    document.addEventListener("desktop-mode-window-closed", onWindowClosed);
    void refresh();
  }
  function emitDoneEvent(kind, ok, errors, affectedTypes = [], affectedIds = []) {
    const detail = { kind, ok: ok.length, errors, source: "local" };
    document.dispatchEvent(
      new CustomEvent("desktop-mode-recycle-bin-changed", { detail })
    );
    const hooks = window.wp?.hooks;
    if (hooks && typeof hooks.doAction === "function") {
      hooks.doAction("desktop_mode.recycleBin.changed", detail);
    }
    const api = window.wp?.desktop;
    if (api && typeof api.broadcast === "function" && affectedTypes.length > 0) {
      const action = kind === "restore" ? "untrashed" : "deleted";
      for (const type of affectedTypes) {
        api.broadcast(`desktop-mode.${type}.changed`, {
          source: "recycle-bin",
          action,
          ids: affectedIds
        });
      }
    }
  }
  const registry = window.desktopModeNativeWindows ?? (window.desktopModeNativeWindows = {});
  registry["desktop-mode-recycle-bin"] = (body) => {
    renderRecycleBin(body);
  };
  exports.mapRecycleTypeToFileType = mapRecycleTypeToFileType;
  exports.renderRecycleBin = renderRecycleBin;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  return exports;
}({});
