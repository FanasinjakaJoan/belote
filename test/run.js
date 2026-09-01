'use strict';
/* Runs every suite in its own process (each integration suite boots a server). */
const { spawnSync } = require('child_process');
const suites = ['engine.test.js', 'client.test.js', 'multiplayer.test.js', 'deploy.test.js'];
let failed = 0;
for (const s of suites) {
  console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 50 - s.length)));
  const r = spawnSync(process.execPath, [__dirname + '/' + s], { stdio: 'inherit' });
  if (r.status !== 0) { failed++; }
}
console.log('\n' + (failed ? '✗ ' + failed + ' suite(s) failed' : '✓ all suites passed') + '\n');
process.exit(failed ? 1 : 0);
