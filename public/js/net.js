/* Thin WebSocket client with auto-reconnect and a tiny event bus. */
(function (w) {
  'use strict';

  const listeners = new Map();
  let ws = null, ready = false, tries = 0, queue = [], closedByUs = false;
  const el = document.getElementById('conn');

  function status(txt, cls) {
    if (!el) return;
    el.textContent = txt;
    el.style.color = cls === 'bad' ? '#ff8b6b' : cls === 'ok' ? 'rgba(246,239,226,.42)' : '#e8c37a';
  }

  function url() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + location.host + '/ws';
  }

  function connect() {
    closedByUs = false;
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
      emit(m.type, m);
      emit('*', m);
    };
    ws.onclose = () => {
      ready = false;
      emit('close');
      if (!closedByUs) retry();
    };
    ws.onerror = () => { status('connection lost', 'bad'); };
  }

  function retry() {
    tries++;
    const delay = Math.min(800 * tries, 6000);
    status('reconnecting…', 'bad');
    setTimeout(connect, delay);
  }

  function send(type, data) {
    const msg = Object.assign({}, data, { type });
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

  w.Net = { connect, send, on, get ready() { return ready; } };
})(window);
