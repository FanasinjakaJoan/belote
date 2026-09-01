'use strict';
/**
 * Deployment checks: PWA wiring, offline shell, static bundle and server headers.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const http = require('http');

process.env.PORT = 3133;
require('../server/index.js');

const ROOT = path.join(__dirname, '..');
const errors = [];
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { errors.push(m); console.log('  ✗ ' + m); } };
const get = async (p) => {
  const r = await fetch('http://127.0.0.1:3133' + p);
  return { status: r.status, headers: r.headers, text: r.ok ? await r.text() : '', buf: null };
};

(async function run() {
  console.log('deployment');

  // ── served by the Node server ────────────────────────────────────────────
  for (const p of ['/', '/manifest.webmanifest', '/sw.js', '/js/engine.js', '/js/rooms.js',
                   '/js/local.js', '/js/config.js', '/icons/icon-192.png', '/icons/icon-512.png',
                   '/icons/maskable-512.png', '/icons/icon-180.png']) {
    const r = await get(p);
    ok(r.status === 200, 'serves ' + p);
  }
  const icon = await get('/icons/icon-192.png');
  ok(/max-age=\d{5,}/.test(icon.headers.get('cache-control') || ''), 'icons are cached long-term');
  const sw = await get('/sw.js');
  ok((sw.headers.get('content-type') || '').includes('javascript'), 'service worker has a JS content type');

  // ── manifest sanity ──────────────────────────────────────────────────────
  const mf = JSON.parse((await get('/manifest.webmanifest')).text);
  ok(mf.name && mf.short_name, 'manifest has names');
  ok(['fullscreen', 'standalone'].includes(mf.display), 'manifest display is app-like: ' + mf.display);
  ok(mf.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any'), 'manifest has a 512 any icon');
  ok(mf.icons.some((i) => i.purpose === 'maskable'), 'manifest has a maskable icon');
  for (const i of mf.icons) {
    const r = await get('/' + i.src);
    ok(r.status === 200, 'manifest icon exists: ' + i.src);
  }

  // ── index wiring ─────────────────────────────────────────────────────────
  const html = (await get('/')).text;
  ok(html.includes('rel="manifest"'), 'index links the manifest');
  ok(html.includes('apple-touch-icon'), 'index has an apple-touch-icon');
  ok(html.includes('apple-mobile-web-app-capable'), 'index has iOS standalone meta');
  ok(html.includes('viewport-fit=cover'), 'index opts into safe-area insets');
  for (const s of ['js/engine.js', 'js/rooms.js', 'js/local.js', 'js/config.js'])
    ok(html.includes(s), 'index loads ' + s);

  // ── the service worker precaches everything index.html needs ─────────────
  const swSrc = fs.readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8');
  const needed = [...html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)].map((m) => m[1]);
  for (const n of new Set(needed)) ok(swSrc.includes("'" + n + "'"), 'service worker precaches ' + n);

  // ── shared rules module really is shared ─────────────────────────────────
  const E = require('../public/js/engine');
  ok(typeof E.legalCards === 'function', 'server requires the same engine the browser loads');
  const sandbox = { window: {}, globalThis: undefined };
  const vm = require('vm');
  const ctx = vm.createContext({ setTimeout, clearTimeout, setInterval, clearInterval, Math, Date, console });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'public', 'js', 'engine.js'), 'utf8'), ctx, { filename: 'engine.js' });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'public', 'js', 'rooms.js'), 'utf8'), ctx, { filename: 'rooms.js' });
  ok(ctx.BeloteEngine && ctx.BeloteRooms, 'engine + rooms expose browser globals (no module system)');

  // a whole solo game can run with no Node/server APIs at all
  const room = new ctx.BeloteRooms.Room({ code: 'T', mode: 'solo', target: 301, hostId: 'me' });
  room.addPlayer('me', 'Me', 0);
  room.start();
  const v = room.view('me');
  ok(v.type === 'state' && v.g.hand.length === 5, 'browser-side room deals a hand offline');
  room.destroy();

  // ── static bundle ────────────────────────────────────────────────────────
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'build-static.js'), '--server', 'https://example.test'], { encoding: 'utf8' });
  ok(r.status === 0, 'static bundle builds');
  const dist = path.join(ROOT, 'dist');
  for (const f of ['index.html', 'sw.js', 'manifest.webmanifest', '.nojekyll', 'js/engine.js', 'js/rooms.js', 'icons/icon-512.png'])
    ok(fs.existsSync(path.join(dist, f)), 'dist contains ' + f);
  const cfg = fs.readFileSync(path.join(dist, 'js', 'config.js'), 'utf8');
  ok(/staticBuild:\s*true/.test(cfg), 'dist config is marked static');
  ok(cfg.includes('https://example.test'), 'dist config carries the server URL');
  ok(!/staticBuild:\s*true/.test(fs.readFileSync(path.join(ROOT, 'public', 'js', 'config.js'), 'utf8')), 'source config untouched');

  // ── the committed Pages bundle works from a project sub-path ─────────────
  spawnSync(process.execPath, [path.join(ROOT, 'tools', 'build-static.js'), '--out', 'docs'], { encoding: 'utf8' });
  const docs = path.join(ROOT, 'docs');
  ok(fs.existsSync(path.join(docs, 'index.html')), 'docs/ bundle is present for GitHub Pages');
  const sub = http.createServer((req, res) => {
    let u = req.url.split('?')[0];
    if (!u.startsWith('/belote/')) { res.writeHead(404); return res.end(); }
    u = u.slice(7) === '/' ? '/index.html' : u.slice(7);
    fs.readFile(path.join(docs, u), (e, b) => {
      if (e) { res.writeHead(404); return res.end(); }
      res.writeHead(200); res.end(b);
    });
  });
  await new Promise((r) => sub.listen(3134, '127.0.0.1', r));
  const base = 'http://127.0.0.1:3134/belote/';
  const page = await (await fetch(base)).text();
  const refs = [...page.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|data:)/.test(u));
  let broken = 0;
  for (const r of new Set(refs)) if (!(await fetch(new URL(r, base))).ok) broken++;
  const dmf = await (await fetch(new URL('manifest.webmanifest', base))).json();
  for (const i of dmf.icons) if (!(await fetch(new URL(i.src, base))).ok) broken++;
  ok(broken === 0, 'every asset resolves when hosted under /belote/ (relative paths)');
  sub.close();

  // ── deployment descriptors ───────────────────────────────────────────────
  for (const f of ['Dockerfile', 'render.yaml', 'fly.toml', 'Procfile', 'railway.json',
                   'capacitor.config.json', 'deploy/github-workflows/ci.yml',
                   'deploy/github-workflows/pages.yml', 'deploy/github-workflows/android.yml'])
    ok(fs.existsSync(path.join(ROOT, f)), 'ships ' + f);
  for (const f of fs.readdirSync(path.join(ROOT, 'deploy', 'github-workflows'))) {
    const y = fs.readFileSync(path.join(ROOT, 'deploy', 'github-workflows', f), 'utf8');
    ok(/^name:\s+\S/m.test(y) && /^jobs:/m.test(y) && /^on:/m.test(y), f + ' is a well-formed workflow');
  }
  const cap = JSON.parse(fs.readFileSync(path.join(ROOT, 'capacitor.config.json'), 'utf8'));
  ok(cap.webDir === 'dist', 'capacitor points at the static bundle');
  ok(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(cap.appId), 'capacitor appId is a valid package name');

  console.log('');
  if (errors.length) { console.log('FAILURES:\n' + errors.map((e) => ' - ' + e).join('\n')); process.exit(1); }
  console.log('deployment OK\n');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
