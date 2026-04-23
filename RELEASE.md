# Releasing `wp-desktop-mode`

Maintainer guide. Users install by downloading `/releases/latest/download/wp-desktop-mode.zip`.

## Three ways to cut a release

All three end at the same place: a `vX.Y.Z` tag on origin, which fires the build-and-publish half of [`.github/workflows/release.yml`](.github/workflows/release.yml) to produce a GitHub Release with `wp-desktop-mode.zip` attached. Pick whichever is least friction at the moment.

### 1. GitHub UI — one click

Actions → **Release** workflow → **Run workflow** → type `0.5.0` → **Run workflow**.

The workflow bumps all three version locations on `trunk`, commits, tags, builds, and publishes. No local git needed. Best for quick releases from anywhere, including your phone.

> **Note**: requires the repo's branch protection / ruleset to allow `github-actions[bot]` to push to `trunk`. See [First-time setup](#first-time-setup-checks).

### 2. Local one-liner

```bash
./bin/release.sh 0.5.0
```

Bumps, commits, pushes to trunk, **waits for CI green**, tags, pushes tag. Aborts cleanly if the tree is dirty, you're not on trunk, or CI fails. Best when you want the extra "CI passed before tagging" guarantee.

Requires the `gh` CLI authenticated (`gh auth status`).

### 3. Manual, step by step

```bash
./bin/bump-version.sh 0.5.0
git commit -am "chore: bump to 0.5.0" && git push origin trunk
# wait for CI green on the bump commit
git tag v0.5.0 && git push origin v0.5.0
```

Full transparency, useful when something in the automation breaks.

## Pre-releases

Hyphenated versions publish as GitHub pre-releases, so `/releases/latest` keeps pointing at the last stable. The workflow detects the hyphen and sets `--prerelease` automatically. Drop the prerelease tag wherever the stable version goes:

- UI: type `0.5.0-rc1` in the Run workflow dialog.
- Local: `./bin/release.sh 0.5.0-rc1`.
- Manual: tag as `v0.5.0-rc1`.

## What each tool does

| Tool | Purpose |
|---|---|
| `bin/bump-version.sh <version>` | Syncs `package.json`, `package-lock.json`, plugin header, `WPDM_VERSION`. Used by both the UI workflow and the local script. |
| `bin/package.sh` | Packages `wp-desktop-mode.zip` from HEAD + current built JS. Errors if the build is stale. |
| `bin/release.sh <version>` | Full local release (Option 2). |
| `release.yml` — `workflow_dispatch` | Full UI release (Option 1). |
| `release.yml` — `push: tags: v*` | Build + publish. Fires for all three options. |

## Version locations

Three places, kept in sync by `bin/bump-version.sh`:

- `package.json` → `"version"` (and `package-lock.json` via `npm version`)
- `wp-desktop-mode.php` → plugin header `Version:`
- `wp-desktop-mode.php` → `WPDM_VERSION` constant

The `release` job re-reads all three at tag time and fails with a clear error if any doesn't match the tag. This catches "forgot to bump one".

## Versioning scheme

Semver: `vMAJOR.MINOR.PATCH`.

- **PATCH** — bug fixes, no API changes.
- **MINOR** — new hooks / JS API / features. Backwards-compatible.
- **MAJOR** — breaking changes to documented PHP hooks, JS API, or the chromeless bridge protocol. Bump with care; plugins extend this shell.

Tags carry the `v` prefix (`v0.5.0`); `package.json` and the plugin header store the bare number.

## Manual packaging

For local testing without publishing:

```bash
npm run package   # builds + writes wp-desktop-mode.zip at the repo root
```

The zip has the exact contents the workflow uploads.

## Troubleshooting

**`Version mismatch — tag 'X' vs package.json=Y header=Y WPDM_VERSION=Y`**
You pushed a tag without bumping first, or bumped but didn't push the bump commit before tagging. Fix locally, delete the broken tag (`git push --delete origin vX.Y.Z`), re-tag from the correct commit, push again.

**UI workflow fails at "Bump, commit, tag, push" with a permission error**
Your branch protection / ruleset forbids `github-actions[bot]` from pushing to `trunk`. Fix: add the bot to the ruleset's bypass actors (Settings → Rules → your trunk ruleset → Bypass list), or fall back to Option 2 / 3.

**`bin/release.sh` aborts with "working tree is dirty"**
Commit or stash your in-progress work first. The script refuses to bundle unrelated changes into the bump commit.

**Workflow succeeded but `desktop.min.js` is missing from the zip**
Shouldn't happen — `bin/package.sh` errors out if the build artifacts aren't present, and the release job runs `npm run build` before it. If you see this, the build probably produced zero-byte files; check the `Build` step log.

**Release created but with no notes / empty notes**
`--generate-notes` pulls from merged PRs since the last tag. If there are none (first release, or only direct pushes to `trunk`), the notes will be sparse. Edit the Release in the GitHub UI after the fact.

## First-time setup checks

Before cutting the first release, confirm:

- Repo Settings → Actions → General → Workflow permissions is set to **Read and write permissions** (needed for `gh release create` and for the UI workflow's pushes).
- For Option 1 (UI): the trunk ruleset / branch protection allows `github-actions[bot]` to push. If the repo enforces "Changes must be made through a pull request", add the bot to bypass actors, or use Option 2 / 3.
- The `v*` tag pattern isn't blocked by a tag protection rule.
- CI is passing on `trunk`. Options 1 and 3 trust you to eyeball this; Option 2 enforces it automatically.
