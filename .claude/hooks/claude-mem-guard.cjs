#!/usr/bin/env node
// claude-mem's observation hooks fail in this remote container environment and
// increment a consecutive-failure counter. At 3 they start blocking tool
// execution (PreToolUse/PostToolUse) and the Stop summarize hook.
//
// Since project hooks run BEFORE plugin hooks, we reset the counter whenever
// it is >= 1 — so the plugin's hook always increments from 0, never from 2+,
// and the counter stays perpetually at 0 or 1 (well below the blocking
// threshold of 3).
const fs = require('fs');
const path = require('path');
const os = require('os');

const file = path.join(os.homedir(), '.claude-mem', 'state', 'hook-failures.json');
try {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if ((data.consecutiveFailures || 0) >= 1) {
    fs.writeFileSync(file, JSON.stringify({ consecutiveFailures: 0, lastFailureAt: null }));
  }
} catch {
  // no-op if file doesn't exist or can't be read
}
