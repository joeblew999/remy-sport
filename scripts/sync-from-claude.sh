#!/usr/bin/env bash
# Sync the design prototype from a Claude project export into this repo.
#
# Flow:
#   1. In claude.ai, open the Remy Sport project and download it as a zip
#      (Project menu → Download).
#   2. Run this script. With no args it picks the newest *.zip in ~/Downloads;
#      pass an explicit path to override.
#
#   ./scripts/sync-from-claude.sh
#   ./scripts/sync-from-claude.sh ~/Downloads/remy-sport-design.zip
#
# It extracts the project's `app/` folder into this repo's
# `docs/design/prototype/`, replacing what's there. Review with `git diff`
# before committing.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$REPO_ROOT/docs/design/prototype"
SRC_SUBDIR="app"

# --- locate the zip --------------------------------------------------------
if [[ $# -ge 1 ]]; then
  ZIP="$1"
else
  ZIP="$(ls -t "$HOME/Downloads"/*.zip 2>/dev/null | head -n 1 || true)"
  if [[ -z "$ZIP" ]]; then
    echo "error: no zip found in ~/Downloads — pass a path explicitly" >&2
    echo "usage: $0 [path/to/project.zip]" >&2
    exit 1
  fi
  echo "› using newest zip: $ZIP"
fi

[[ -f "$ZIP" ]] || { echo "error: not a file: $ZIP" >&2; exit 1; }

# --- inspect the zip -------------------------------------------------------
# Project zips wrap everything in a single top-level folder. Find it, then
# verify it contains the app/ subdir we want.
TOP="$(unzip -Z1 "$ZIP" | awk -F/ 'NF>1 {print $1; exit}')"
if [[ -z "$TOP" ]]; then
  echo "error: zip has no top-level folder — wrong file?" >&2
  exit 1
fi

if ! unzip -Z1 "$ZIP" | grep -q "^$TOP/$SRC_SUBDIR/"; then
  echo "error: zip does not contain $TOP/$SRC_SUBDIR/ — wrong project?" >&2
  exit 1
fi

# --- extract to a temp dir, then swap --------------------------------------
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "› extracting $TOP/$SRC_SUBDIR/ …"
unzip -q "$ZIP" "$TOP/$SRC_SUBDIR/*" -d "$TMP"

mkdir -p "$DEST"
# Wipe DEST contents (but keep the dir) so removed files actually disappear
find "$DEST" -mindepth 1 -delete

# Copy extracted contents into DEST
cp -R "$TMP/$TOP/$SRC_SUBDIR/." "$DEST/"

# --- summarize -------------------------------------------------------------
echo
echo "✓ synced into $DEST"
echo
( cd "$REPO_ROOT" && git status --short -- docs/design/prototype )
echo
echo "next: review with \`git diff docs/design/prototype\`, then commit."
