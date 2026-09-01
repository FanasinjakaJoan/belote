'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { RoomManager } = require('./rooms');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const manager = new RoomManager();

// ───────────────────────────────────────────────────────── static files ──
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';

  if (p === '/api/rooms') {
    res.writeHead(200, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ rooms: manager.list() }));
  }
  if (p === '/api/health') {
    res.writeHead(200, { 'content-type': MIME['.json'] });
    return res.end(JSON.stringify({ ok: true, rooms: manager.rooms.size }));
  }

  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('not found');
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(buf);
  });
});

// ────────────────────────────────────────────────────────── websockets ──
const wss = new WebSocketServer({ server, path: '/ws' });

/** @type {Map<import('ws').WebSocket, {id:string,name:string,room:import('./rooms').Room|null,off:Function|null}>} */
const clients = new Map();

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function pushState(room) {
  for (const [ws, c] of clients) {
    if (c.room === room) send(ws, room.view(c.id));
  }
  room.flushFx();
}

function joinRoom(ws, c, room, preferredSeat) {
  leaveRoom(ws, c);
  const seat = room.addPlayer(c.id, c.name, preferredSeat);
  if (seat < 0) { send(ws, { type: 'error', err: 'Table is full' }); return false; }
  c.room = room;
  c.off = room.onChange(() => pushState(room));
  send(ws, { type: 'joined', code: room.code, seat, mode: room.mode });
  pushState(room);
  return true;
}

function leaveRoom(ws, c) {
  if (!c.room) return;
  const room = c.room;
  if (c.off) c.off();
  c.off = null;
  c.room = null;
  room.disconnect(c.id);
  pushState(room);
}

wss.on('connection', (ws) => {
  const c = { id: crypto.randomUUID(), name: 'Player', room: null, off: null, alive: true };
  clients.set(ws, c);
  send(ws, { type: 'hello', id: c.id });

  ws.on('pong', () => { c.alive = true; });

  const identify = (pid) => {
    if (typeof pid === 'string' && /^[a-zA-Z0-9-]{8,40}$/.test(pid) && !c.room) c.id = pid;
  };

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    const room = c.room;
    switch (m.type) {
      case 'identify':
        identify(m.pid);
        send(ws, { type: 'hello', id: c.id });
        break;

      case 'name':
        c.name = String(m.name || 'Player').slice(0, 14) || 'Player';
        if (room) { const s = room.seats[room.seatOf(c.id)]; if (s) s.name = c.name; room.emit(); }
        break;

      case 'solo': {
        const r = manager.create({
          mode: 'solo', target: clampTarget(m.target), difficulty: pickDiff(m.difficulty), hostId: c.id,
        });
        if (joinRoom(ws, c, r, 0)) r.start();
        break;
      }
      case 'create': {
        const r = manager.create({
          mode: 'online', target: clampTarget(m.target), difficulty: pickDiff(m.difficulty), hostId: c.id,
        });
        joinRoom(ws, c, r, 0);
        break;
      }
      case 'join': {
        const r = manager.get(m.code);
        if (!r) return send(ws, { type: 'error', err: 'No table with code ' + String(m.code || '').toUpperCase() });
        if (r.mode === 'solo') return send(ws, { type: 'error', err: 'That table is a solo game' });
        joinRoom(ws, c, r, m.seat);
        break;
      }
      case 'quick': {
        const open = manager.list();
        const r = open.length ? manager.get(open[0].code) : manager.create({ mode: 'online', target: 501, hostId: c.id });
        joinRoom(ws, c, r, null);
        break;
      }
      case 'startGame':
        if (room && room.hostId === c.id) room.start();
        break;
      case 'bid':
        if (room) {
          const res = room.bid(c.id, m.action);
          if (!res.ok) send(ws, { type: 'nope', err: res.err });
        }
        break;
      case 'play':
        if (room) {
          const res = room.play(c.id, m.card);
          if (!res.ok) send(ws, { type: 'nope', err: res.err });
        }
        break;
      case 'nextRound':
        if (room) room.nextRound();
        break;
      case 'restart':
        if (room && (room.mode === 'solo' || room.hostId === c.id)) room.restart();
        break;
      case 'pause':
        if (room) room.setPaused(!!m.value);
        break;
      case 'leave':
        leaveRoom(ws, c);
        break;
      case 'chat':
        if (room) {
          const seat = room.seatOf(c.id);
          const text = String(m.text || '').slice(0, 120);
          for (const [w, cc] of clients) if (cc.room === room) send(w, { type: 'chat', seat, name: c.name, text });
        }
        break;
      case 'ping':
        send(ws, { type: 'pong', t: m.t });
        break;
    }
  });

  ws.on('close', () => {
    leaveRoom(ws, c);
    clients.delete(ws);
  });
  ws.on('error', () => {});
});

function clampTarget(t) {
  const n = Number(t) || 501;
  return [301, 501, 701, 1001].includes(n) ? n : 501;
}
function pickDiff(d) {
  return ['easy', 'normal', 'hard'].includes(d) ? d : 'normal';
}

const interval = setInterval(() => {
  for (const [ws, c] of clients) {
    if (!c.alive) { ws.terminate(); continue; }
    c.alive = false;
    try { ws.ping(); } catch {}
  }
}, 30_000);
interval.unref?.();

server.listen(PORT, HOST, () => {
  console.log(`♠ Belote Royale running at http://${HOST}:${PORT}`);
});
