#!/bin/sh
# Build phase: copy Flow's web app into the app bundle's web/ folder, which
# ShellScene serves as flow-app://app/…. Only what the page loads: the HTML,
# src/, ui-kit's CSS, fonts and JS, sync-kit's JS, and assets/ when there is
# one — never tests, the CLI, docs, e2e or anything Swift.
#
# The iPhone app is Flow's Terminal (SPEC.md › Terminal: the iPhone app), so
# terminal.html becomes the bundle's index.html — shell-kit always opens
# index.html and has no option to open another page. The desktop and web app
# keep the repository's index.html as it is.
set -eu

REPO="${SRCROOT:?run from Xcode, or set SRCROOT to flow/ios}/.."
DEST="${TARGET_BUILD_DIR:?}/${UNLOCALIZED_RESOURCES_FOLDER_PATH:?}/web"

rm -rf "$DEST"
mkdir -p "$DEST"

cp "$REPO/terminal.html" "$DEST/index.html"
cp "$REPO/terminal.html" "$DEST/terminal.html"
if [ -f "$REPO/toolkit-app.json" ]; then cp "$REPO/toolkit-app.json" "$DEST/"; fi

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
grep -q 'src/terminal.js' "$DEST/index.html" || { echo "error: web/index.html is not the Terminal" >&2; exit 1; }
echo "Flow web app → $DEST"
