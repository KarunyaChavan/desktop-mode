# Examples

Short, complete, copy-pasteable recipes. Each file is a working plugin snippet — drop it into a plugin file that starts with:

```php
<?php
/**
 * Plugin Name: My Desktop Extension
 */
defined( 'ABSPATH' ) || exit;
```

## Index

- [Add a dock item with a badge](./dock-badge.md)
- [Gate desktop mode by role](./gate-by-role.md)
- [React to window events](./react-to-window-events.md)
- [Style a specific admin page inside the iframe](./chromeless-style-override.md)
- [Inject data into `wpDesktopConfig`](./inject-shell-config.md)
- [Register a wallpaper (CSS + canvas)](./register-wallpaper.md)

If your use case isn't here, check [Hooks Reference](../hooks-reference.md) and [JavaScript Reference](../javascript-reference.md) — everything we fire is documented there.
