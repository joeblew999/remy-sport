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

# --- extract to a temp dir, then locate the export root --------------------
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "› extracting …"
unzip -q "$ZIP" -d "$TMP"

# The export root is whichever directory contains both app/ and biz/.
# Earlier exports had a wrapper folder (e.g. Remy-sports/{app,biz}); newer
# exports place app/ and biz/ at the zip root. Handle both.
ROOT=""
if [[ -d "$TMP/app" && -d "$TMP/biz" ]]; then
  ROOT="$TMP"
else
  for d in "$TMP"/*/; do
    if [[ -d "${d}app" && -d "${d}biz" ]]; then
      ROOT="${d%/}"
      break
    fi
  done
fi
if [[ -z "$ROOT" ]]; then
  echo "error: zip has no app/+biz/ structure — wrong project?" >&2
  exit 1
fi
if [[ ! -d "$ROOT/$SRC_SUBDIR" ]]; then
  echo "error: zip does not contain $SRC_SUBDIR/ — wrong project?" >&2
  exit 1
fi

# --- swap into DEST --------------------------------------------------------
mkdir -p "$DEST"
# Wipe DEST contents (but keep the dir) so removed files actually disappear
find "$DEST" -mindepth 1 -delete

# Copy extracted contents into DEST
cp -R "$ROOT/$SRC_SUBDIR/." "$DEST/"

# --- summarize -------------------------------------------------------------
echo
echo "✓ synced into $DEST"
echo
( cd "$REPO_ROOT" && git status --short -- docs/design/prototype )

# --- post-sync cleanup -----------------------------------------------------
# Remove remy-sport-design*.zip from ~/Downloads after a successful sync —
# the zip is transport-only and keeping older copies makes macOS auto-suffix
# '-2', '-3' on future downloads. Pattern is unique enough not to hit
# anything else. Skip cleanup if the user passed an explicit zip path
# (their file, their call). Set REMY_KEEP_ZIP=1 to opt out.
if [[ $# -eq 0 && -z "${REMY_KEEP_ZIP:-}" ]]; then
  echo
  shopt -s nullglob
  zips=("$HOME/Downloads"/remy-sport-design*.zip)
  shopt -u nullglob
  if (( ${#zips[@]} > 0 )); then
    rm -f "${zips[@]}"
    echo "› cleaned ~/Downloads/remy-sport-design*.zip (${#zips[@]} file$([[ ${#zips[@]} -ne 1 ]] && echo s))"
  fi
fi

echo
echo "next: review with \`git diff docs/design/prototype\`, then commit."
