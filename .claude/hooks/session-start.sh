#!/bin/bash
set -uo pipefail

# claude-mem (https://github.com/thedotmack/claude-mem) gives Claude Code
# persistent memory/context across sessions. Only relevant for Claude Code
# on the web; skip on local runs.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

timeout 240 npx --yes claude-mem@latest install --provider claude --no-auto-start < /dev/null || true
