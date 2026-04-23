# Releasing `wp-desktop-mode`

Maintainer guide for cutting a GitHub Release. Users download the resulting zip from `/releases/latest/download/wp-desktop-mode.zip`.

## TL;DR

```bash
./bin/bump-version.sh 0.5.0
git commit -am "chore: bump to 0.5.0" && git push origin trunk
# wait for CI green
git tag v0.5.0 && git push origin v0.5.0
```

The pushed tag fires [`.github/workflows/release.yml`](.github/workflows/release.yml), which builds, packages, and publishes the Release.

## What gets automated

| Step | Where it runs |
|---|---|
| Version bump across the three tracked spots | `bin/bump-version.sh` — locally |
| Lint, typecheck, JS + PHP tests | `ci.yml` — on push to `trunk` |
| Build JS bundles (`assets/js/desktop{,.min}.js`) | `release.yml` — on `v*` tag |
| Package plugin zip | `release.yml` — runs `bin/package.sh` |
| Create Release, upload zip, generate notes | `release.yml` — via `gh release create` |

## Version locations

Three places, kept in sync by `bin/bump-version.sh`:

- `package.json` → `"version"` (and `package-lock.json` via `npm version`)
- `wp-desktop-mode.php` → plugin header `Version:`
- `wp-desktop-mode.php` → `WPDM_VERSION` constant

The release workflow re-reads all three at tag time and fails with a clear error if they don't match the tag. This catches "forgot to bump one".

## Versioning scheme

Semver: `vMAJOR.MINOR.PATCH`.

- **PATCH** — bug fixes, no API changes.
- **MINOR** — new hooks / JS API / features. Backwards-compatible.
- **MAJOR** — breaking changes to documented PHP hooks, JS API, or the chromeless bridge protocol. Bump with care; plugins extend this shell.

Tags always carry the `v` prefix (`v0.5.0`, not `0.5.0`). `package.json` and the plugin header store the bare number.

## Pre-releases

Hyphenated versions are published as GitHub pre-releases, so `/releases/latest` keeps pointing at the last stable:

```bash
./bin/bump-version.sh 0.5.0-rc.1
git commit -am "chore: bump to 0.5.0-rc.1" && git push origin trunk
git tag v0.5.0-rc.1 && git push origin v0.5.0-rc.1
```

## Manual packaging

For local testing without publishing:

```bash
npm run package   # builds + writes wp-desktop-mode.zip at the repo root
```

The zip has the exact contents the workflow uploads. `bin/package.sh` by itself skips the build and errors if the compiled JS is missing — use `npm run package` unless you know the build is already current.

## Troubleshooting

**`Version mismatch — tag 'X' vs package.json=Y header=Y WPDM_VERSION=Y`**
You pushed a tag without running `bin/bump-version.sh` first, or you bumped but didn't push the bump commit before tagging. Fix locally, delete the broken tag (`git push --delete origin vX.Y.Z`), re-tag from the correct commit, push again.

**Workflow succeeded but `desktop.min.js` is missing from the zip**
Shouldn't happen — `bin/package.sh` errors out if the build artifacts aren't present, and `release.yml` runs `npm run build` before calling it. If you see this, the build probably produced zero-byte files; check the `Build` step log.

**Release created but with no notes / empty notes**
`--generate-notes` pulls from merged PRs since the last tag. If there are none (first release, or only direct pushes to `trunk`), the notes will be sparse. Edit the Release in the GitHub UI after the fact.

## First-time setup checks

Before cutting the first release, confirm:

- Repo Settings → Actions → General → Workflow permissions is set to **Read and write permissions** (needed for `gh release create`).
- The `v*` tag pattern isn't blocked by a branch/tag protection rule.
- CI is passing on `trunk`. Tag from a known-green commit.
