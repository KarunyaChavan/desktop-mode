#!/usr/bin/env bash
# End-to-end local release: bump, commit, push, wait for CI, tag, push tag.
# The tag push fires release.yml, which builds and publishes the Release.

set -euo pipefail

if [[ $# -ne 1 ]]; then
	echo "usage: $0 <version>  (e.g., 0.5.0 or 0.5.0-rc1)" >&2
	exit 1
fi

new="$1"
tag="v$new"

command -v gh >/dev/null || { echo "error: 'gh' CLI required (for CI polling)" >&2; exit 1; }

branch=$(git rev-parse --abbrev-ref HEAD)
if [[ "$branch" != "trunk" ]]; then
	echo "error: must be on trunk (currently on '$branch')" >&2
	exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
	echo "error: working tree is dirty. Commit or stash first." >&2
	exit 1
fi

git fetch origin trunk --quiet
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/trunk)" ]]; then
	echo "error: local trunk is out of sync with origin/trunk. Pull or push first." >&2
	exit 1
fi

./bin/bump-version.sh "$new"
git commit -am "chore: bump to $new"
git push origin trunk

sha=$(git rev-parse HEAD)
echo "Waiting for CI on $sha…"

# CI may take a couple of seconds to register the run after the push.
run_id=""
for _ in 1 2 3 4 5; do
	run_id=$(gh run list --branch trunk --workflow ci.yml --commit "$sha" --limit 1 --json databaseId -q '.[0].databaseId' 2>/dev/null || true)
	[[ -n "$run_id" ]] && break
	sleep 3
done

if [[ -z "$run_id" ]]; then
	echo "error: no CI run found for $sha after 15s" >&2
	exit 1
fi

gh run watch "$run_id" --exit-status

git tag "$tag"
git push origin "$tag"

echo "Tagged $tag. Release workflow now building — watch with:"
echo "  gh run watch \$(gh run list --workflow release.yml --limit 1 --json databaseId -q '.[0].databaseId')"
