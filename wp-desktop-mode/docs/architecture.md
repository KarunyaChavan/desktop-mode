# Architecture

A high-level tour, mostly so hook reference + examples make sense.

## The big picture

```
Browser tab
├── Parent shell  (wp-admin, desktop class on body)
│   ├── Admin bar            — classic WP toolbar + desktop-mode toggle
│   ├── Dock                 — left edge, icons from $menu
│   ├── Desktop area         — wallpaper; hosts windows + desktop icons
│   │   ├── Window A         — <iframe src="edit.php?wp_desktop=1">
│   │   ├── Window B         — <iframe src="upload.php?wp_desktop=1">
│   │   └── Window C (native)— <div> with plugin-rendered content
│   └── Taskbar (planned)    — per-window tabs + clock
│
└── Each iframe renders a chromeless admin page
    — real WordPress request, stripped of wp-admin chrome
```

## PHP flow (per request)

1. `admin_init` — portal redirect logic decides whether to keep the request where it is or send the user to `/wp-desktop/`.
2. `admin_body_class` — the `wp-desktop-active` or `wp-desktop-chromeless` class is appended so CSS and JS can key off it.
3. `admin_enqueue_scripts` — CSS and JS are registered on a per-mode basis (shell assets in desktop mode, chromeless overrides in iframes).
4. `in_admin_header @ 5` — the shell markup is injected right after the admin bar (`<div id="wp-desktop-shell">`).
5. `admin_footer` — the chromeless bridge script is injected inside iframes so they can `postMessage` back to the shell.

Key server-side entry points:

| File | Purpose |
|---|---|
| `wp-desktop-mode.php` | Plugin bootstrap — loads the `includes/` files. |
| `includes/helpers.php` | `wpdm_is_enabled()`, `wpdm_is_chromeless_request()`, dock builder, chromeless admin-bar suppression. |
| `includes/ajax.php` | `wpdm_ajax_save()` — the `wp_ajax_save-desktop-mode` endpoint. |
| `includes/admin-bar.php` | Toggle node + inline JS click handler. |
| `includes/assets.php` | Registers CSS/JS handles on `init`. |
| `includes/render.php` | Shell markup, chromeless bridge emission, body classes. |
| `includes/portal.php` | Portal URL (`/wp-desktop/`) and redirect rules. |
| `includes/session.php` | REST endpoints for saving/restoring the per-user window session. |

## Browser flow

1. `/wp-admin/` loads → portal redirect sends the user to `/wp-desktop/`.
2. `/wp-desktop/` serves a real admin page (Dashboard by default) with the shell wrapped around it.
3. The shell's Vite-built TypeScript bundle (`desktop.js` in dev, `desktop.min.js` in prod) initializes:
   - Creates the `WindowManager`.
   - Creates the `Dock`.
   - Either restores the saved session (if one exists) **or** opens the current page in a new window.
   - Wires persistence — debounced `POST /wp-json/wp-desktop-mode/v1/session`.
4. When a dock icon is clicked, the manager opens a window whose iframe `src` is the admin URL with `?wp_desktop=1` appended.
5. The iframe renders WordPress normally, but the chromeless stylesheet hides the admin bar, side menu, and wp-footer.
6. The iframe `postMessage`s its title, navigation, and screen-meta state up to the parent.

## Two window types

### Iframe windows (default)

Used for **every existing admin page**. Zero plugin changes required — the chromeless request strips chrome and the iframe does the rest. Trade-off: no direct DOM access between parent and iframe (so cross-frame communication is `postMessage`-only).

### Native windows (Phase 7, planned)

Registered via `wp_register_desktop_window()` (planned API), their content renders **directly in the parent DOM** — no iframe. Good for lightweight tools where iframe isolation is overkill. The companion **Jorvy** plugin validates this end-to-end.

## Session persistence

Every window lifecycle event — open, close, focus, move, resize, state change — is pushed into a debounced writer that `POST`s the full stack to a REST endpoint. On next load, the shell reads the session and rebuilds the stack before the user sees anything (no "flash of default layout"). Clamping logic adapts window coordinates when the viewport shrinks.

REST surface:

- `GET  /wp-json/wp-desktop-mode/v1/session` — current user's saved session.
- `POST /wp-json/wp-desktop-mode/v1/session` — overwrite the session. Body: `{ session: { windows: [...], focused, updated } }`.
- `DELETE /wp-json/wp-desktop-mode/v1/session` — clear it.

All routes require a valid `X-WP-Nonce` (the standard REST nonce) and the current user to be logged in with capability `read`.

## CSS layering

```
assets/css/
├── variables.css    — Custom properties, color-scheme aware.
├── desktop.css      — Shell layout; hides classic chrome via body.wp-desktop-active.
├── windows.css      — Window chrome, animations, states.
├── dock.css         — Left-edge dock.
└── chromeless.css   — Loaded INSIDE iframes; scoped to body.wp-desktop-chromeless.
```

Never edit Core's `common.css` or color scheme files. Everything we need is exposed as a CSS Custom Property in `variables.css`.

## What comes next (phases 3–8)

- **Phase 3** — taskbar, multi-window orchestration, state sync improvements.
- **Phase 4** — polish: color schemes, animations, accessibility audit.
- **Phase 5–6** — mobile and tablet modes (`wp.desktop.mode` returns `'desktop' | 'tablet' | 'mobile'`).
- **Phase 7** — native windows + **Jorvy** (the reference plugin).
- **Phase 8** — **the North Star**: cross-window drag and drop. Media Library → Gutenberg in one gesture.

See [Hooks Reference](./hooks-reference.md) for the filter/action names each phase will introduce.
