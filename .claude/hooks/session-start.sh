#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# ── Install mise ────────────────────────────────────────────────────────────
if ! command -v mise &>/dev/null; then
  if [ ! -f "$HOME/.local/bin/mise" ]; then
    curl -fsSL https://mise.run | sh
  fi
  export PATH="$HOME/.local/bin:$PATH"
fi

# Persist mise on PATH for the session
echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
echo "eval \"\$(mise activate bash)\"" >> "$CLAUDE_ENV_FILE"

# ── Trust project config & install tools ────────────────────────────────────
mise trust
mise install || GITHUB_TOKEN="" mise install

# ── Setup project + Playwright browsers ─────────────────────────────────────
eval "$(mise activate bash)"
mise run setup
mise run playwright:install
