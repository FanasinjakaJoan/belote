/* Transport layer: WebSocket for online tables, in-page engine for solo/offline. */
(function (w) {
  'use strict';

  const listeners = new Map();
  let ws = null, ready = false, tries = 0, queue = [], mode = 'idle';
  const el = document.getElementById('conn');

  /** Where the multiplayer server lives. Empty = same origin as the page. */
  function serverBase() {
    const cfg = (w.BELOTE_CONFIG && w.BELOTE_CONFIG.server) || '';
    let saved = '';
    try { saved = localStorage.getItem('belote.server') || ''; } catch {}
    const q = new URLSearchParams(location.search).get('server');
    if (q) { try { localStorage.setItem('belote.server', q); } catch {} return q; }
    return saved || cfg || '';
  }
  function setServer(url) {
    try { url ? localStorage.setItem('belote.server', url) : localStorage.removeItem('belote.server'); } catch {}
  }
  /** True when this build has no server of its own (static hosting / packaged app). */
  function onlineAvailable() {
    return !!serverBase() || (location.protocol === 'http:' || location.protocol === 'https:');
  }

  function url() {
    const base = serverBase();
    if (base) return base.replace(/^http/, 'ws').replace(/\/+$/, '') + '/ws';
    return (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws';
  }

  function status(txt, cls) {
    if (!el) return;
    el.textContent = txt;
    el.style.color = cls === 'bad' ? '#ff8b6b' : cls === 'ok' ? 'rgba(246,239,226,.42)' : '#e8c37a';
  }

  // ── local (offline) mode ────────────────────────────────────────────────
  function goLocal() {
    if (ws) { try { ws.close(); } catch {} ws = null; ready = false; }
    mode = 'local';
    w.LocalServer.open((m) => { emit(m.type, m); emit('*', m); });
    status('offline · solo', 'ok');
    emit('open');
  }

  // ── websocket mode ──────────────────────────────────────────────────────
  function connect() {
    if (mode === 'local') w.LocalServer.close();
    mode = 'ws';
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    status('connecting…');
    try { ws = new WebSocket(url()); } catch (e) { retry(); return; }

    ws.onopen = () => {
      ready = true; tries = 0;
      status('online', 'ok');
      emit('open');
      const q = queue; queue = [];
      q.forEach((m) => send(m.type, m));
    };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      emit(m.type, m); emit('*', m);
    };
    ws.onclose = () => {
      ready = false;
      emit('close');
      if (mode === 'ws') retry();
    };
    ws.onerror = () => status('connection lost', 'bad');
  }

  function retry() {
    if (mode !== 'ws') return;
    tries++;
    if (tries > 8) { status('no server — solo play still works', 'bad'); return; }
    status('reconnecting…', 'bad');
    setTimeout(() => { if (mode === 'ws') connect(); }, Math.min(800 * tries, 6000));
  }

  function send(type, data) {
    const msg = Object.assign({}, data, { type });
    if (mode === 'local') { w.LocalServer.send(msg); return true; }
    if (!ready || !ws || ws.readyState !== 1) { queue.push(msg); return false; }
    ws.send(JSON.stringify(msg));
    return true;
  }

  function on(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
    return () => listeners.get(type).delete(fn);
  }
  function emit(type, data) {
    const s = listeners.get(type);
    if (s) for (const fn of s) fn(data);
  }

  w.Net = {
    connect, goLocal, on, send, setServer, serverBase, onlineAvailable,
    get mode() { return mode; },
    get ready() { return mode === 'local' || ready; },
  };
})(window);
