# WP Desktop Mode

Renders the WordPress admin as a desktop operating system. Admin screens become draggable, resizable, minimizable **windows** floating on a **desktop** with a **dock**. Purely opt-in per user.

---

## How to run it

### 1. Install dependencies

From the plugin directory:

```bash
cd src/wp-content/plugins/wp-desktop-mode
npm install
```

### 2. Build the TypeScript bundle

The plugin uses **[Vite](https://vitejs.dev/)** in library mode. esbuild handles transpile and minify, so builds finish in ~70 ms per bundle.

**Full build** — produces both bundles:

```bash
npm run build
```

Writes:

- `assets/js/desktop.js` — unminified IIFE, loaded when `SCRIPT_DEBUG` is `true`.
- `assets/js/desktop.min.js` — esbuild-minified IIFE, loaded otherwise.

**Development watch** — auto-recompiles the unminified bundle on save:

```bash
npm run dev
```

Leave it running in a separate terminal; refresh the browser after each save. Set `define( 'SCRIPT_DEBUG', true )` in `wp-config.php` so WordPress picks up the unminified bundle during development.

### 3. Start a WordPress environment

From the parent repository root (this plugin lives inside a Core checkout used as its dev host):

```bash
# from the repo root
npm run env:start      # boot Docker (nginx + PHP + MySQL)
npm run env:install    # install WordPress
```

Site: **http://localhost:8889**
Admin: **http://localhost:8889/wp-admin/**
Credentials: `admin` / `password`

Stop the environment:

```bash
npm run env:stop
```

### 4. Activate & toggle

1. Log in at `/wp-admin`.
2. **Plugins → WP Desktop Mode → Activate**.
3. Click the **desktop** icon in the admin bar's top-right corner.
4. The admin reloads inside the desktop shell.

Click the same icon again to return to classic admin.

### 5. Run the tests

```bash
npm run test:php        # PHPUnit, @group desktop-mode
```

Or, inside the Docker container:

```bash
docker exec wordpress-alcazaba-php-1 bash -c \
  'export WP_TESTS_DIR=/var/www/tests/phpunit && cd /var/www && \
   vendor/bin/phpunit -c src/wp-content/plugins/wp-desktop-mode/tests/phpunit/phpunit.xml.dist \
   --group desktop-mode'
```

---

## What it does

- Admin pages render inside **windows** — drag, resize, minimize, maximize, close, fullscreen, detach to tab.
- Left-edge **dock** built from the admin menu.
- Per-user opt-in — the classic admin stays fully functional for users who don't enable it.
- Session persistence — your window layout survives page reloads.
- Zero Core patches — every feature is wired via public WordPress hooks.

## Requirements

- WordPress **6.0+**
- PHP **7.4+**

## For plugin authors

**This plugin is built to be extended.** Every significant behavior is hookable. Drop an icon on the desktop, add a dock item, gate desktop mode by role, react to window events — all from your own plugin, zero patches here.

**See [`docs/`](./docs/README.md) — the developer documentation index.**

Quick links:

- [Getting Started](./docs/getting-started.md) — the five-minute tour for plugin authors.
- [Hooks Reference](./docs/hooks-reference.md) — every action and filter we fire, with signatures and examples.
- [JavaScript Reference](./docs/javascript-reference.md) — CustomEvents, `window.wp.desktop` API, and the iframe `postMessage` bridge.
- [Architecture](./docs/architecture.md) — how the pieces fit together.
- [Examples](./docs/examples/) — copy-paste recipes.

## License

GPLv2 or later. See [LICENSE](https://www.gnu.org/licenses/gpl-2.0.html).
