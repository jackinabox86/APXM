#!/bin/bash
# SessionStart hook: install pnpm dependencies so tsc/vitest work in
# Claude Code web sessions.
#
# Blocker this works around: package.json pins `@prun/link` to a
# `git+ssh://` URL pointing at a private repo. Web containers have no SSH
# client and no SSH key, so `pnpm install` fails before any other deps are
# fetched. Same trick as the GitHub Actions workaround: rewrite SSH URLs
# to authenticated HTTPS via $GITHUB_TOKEN.
set -euo pipefail

# Only run inside Claude Code remote (web) sessions. Local devs already
# have their own SSH config and shouldn't have their git rewrite rules
# clobbered by this hook.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Rewrite SSH GitHub URLs to authenticated HTTPS when a token is
# available. Without a token we still rewrite to plain HTTPS so the
# attempt fails with a clear auth error instead of a "no ssh" error —
# and any *public* git deps continue to work.
if [ -n "${GITHUB_TOKEN:-}" ]; then
  REWRITE="https://x-access-token:${GITHUB_TOKEN}@github.com/"
else
  echo "[session-start] GITHUB_TOKEN not set; private git deps (@prun/link) will fail to clone." >&2
  REWRITE="https://github.com/"
fi
# Clear any prior rewrites for this base and add both SSH-style variants
# (git@github.com: and ssh://git@github.com/). Use --add so the second
# entry doesn't overwrite the first.
git config --global --unset-all "url.${REWRITE}.insteadof" 2>/dev/null || true
git config --global --add "url.${REWRITE}.insteadof" "git@github.com:"
git config --global --add "url.${REWRITE}.insteadof" "ssh://git@github.com/"

# Install via pnpm. `--prefer-offline` is harmless on a cold container
# and helps when the layer is re-used. We don't pass --frozen-lockfile
# so that container-side resolution differences don't hard-fail.
if command -v pnpm >/dev/null 2>&1; then
  pnpm install --prefer-offline
else
  corepack enable >/dev/null 2>&1 || true
  corepack prepare pnpm@10.28.2 --activate >/dev/null 2>&1 || true
  pnpm install --prefer-offline
fi
