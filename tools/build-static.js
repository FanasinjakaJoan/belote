'use strict';
/**
 * Static bundle builder — copies public/ into dist/ and flips the build config
 * to "no server of its own". Used for GitHub Pages and for the Capacitor
 * mobile app, where solo play runs fully offline and online play points at a
 * server URL (BELOTE_SERVER, or entered by the player in the Join screen).
 *
 *   node tools/build-static.js [--server https://belote.example.com] [--out docs]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'public');
const outArg = (() => {
  const i = process.argv.indexOf('--out');
  return i > -1 ? process.argv[i + 1] : 'dist';
})();
const OUT = path.join(ROOT, outArg);

const argServer = (() => {
  const i = process.argv.indexOf('--server');
  return i > -1 ? process.argv[i + 1] : process.env.BELOTE_SERVER || '';
})();

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name), d = path.join(to, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
copyDir(SRC, OUT);

// point the bundle at an external server (if any) and mark it as static
const cfg = path.join(OUT, 'js', 'config.js');
fs.writeFileSync(cfg, fs.readFileSync(cfg, 'utf8')
  .replace(/server:\s*''/, "server: " + JSON.stringify(argServer.replace(/\/+$/, '')))
  .replace(/staticBuild:\s*false/, 'staticBuild: true'));

// GitHub Pages must not run Jekyll over the bundle
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    e.isDirectory() ? walk(p) : files.push(p);
  }
})(OUT);
const bytes = files.reduce((a, f) => a + fs.statSync(f).size, 0);

console.log(outArg + '/ built — ' + files.length + ' files, ' + (bytes / 1024).toFixed(0) + ' kB');
console.log('multiplayer server: ' + (argServer || '(none — solo only until the player sets one)'));
