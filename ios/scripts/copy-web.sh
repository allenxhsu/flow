#!/bin/sh
# Build phase: copy Flow's web app into the app bundle's web/ folder, which
# ShellScene serves as flow-app://app/…. Only what the page loads: the HTML,
# src/, ui-kit's CSS, fonts and JS, sync-kit's JS, and assets/ when there is
# one — never tests, the CLI, docs, e2e or anything Swift.
set -eu

REPO="${SRCROOT:?run from Xcode, or set SRCROOT to flow/ios}/.."
DEST="${TARGET_BUILD_DIR:?}/${UNLOCALIZED_RESOURCES_FOLDER_PATH:?}/web"

rm -rf "$DEST"
mkdir -p "$DEST"

for f in index.html replay.html toolkit-app.json; do
  if [ -f "$REPO/$f" ]; then cp "$REPO/$f" "$DEST/"; fi
done

copy_dir() { # copy_dir <folder, relative to the repo> [names to leave out…]
  from="$1"; shift
  [ -d "$REPO/$from" ] || return 0
  mkdir -p "$(dirname "$DEST/$from")"
  cp -R "$REPO/$from" "$DEST/$from"
  for name in "$@"; do rm -rf "$DEST/$from/$name"; done
  find "$DEST/$from" \( -name '.DS_Store' -o -name '*.test.*' -o -name '*.d.ts' \) -exec rm -f {} +
}

copy_dir src
copy_dir ui-kit swift adapters COPY.md
copy_dir sync-kit/js
copy_dir assets

test -f "$DEST/index.html" || { echo "error: web/index.html missing after copy" >&2; exit 1; }
echo "Flow web app → $DEST"
