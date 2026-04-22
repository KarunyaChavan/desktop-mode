#!/usr/bin/env bash
#
# Build a WordPress-installable plugin zip from HEAD.
#
# Why not `git archive --format=zip` directly? Git's zip output stores
# Unix mode 0600 for files / 0700 for dirs — after extraction by the WP
# plugin installer, those files are unreadable by the web-server user.
# Round-tripping through `tar` + `zip` lands the entries at the tools'
# defaults (0644 / 0755), which is what WordPress expects.

set -euo pipefail

prefix="wp-desktop-mode"
out="${1:-$prefix.zip}"
root=$(pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

git archive --prefix="$prefix/" HEAD | tar -x -C "$tmp"
( cd "$tmp" && zip -qr "$root/$out" "$prefix" )

echo "Wrote $out"
