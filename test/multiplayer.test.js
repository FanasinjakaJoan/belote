'use strict';
/**
 * Multiplayer integration test: host creates a table, a second human joins,
 * two AI fill the empty seats, and the four of them play a complete round.
 */
const WS = require('ws');
process.env.PORT = 3122;
require('../server/index.js');

const URL = 'ws://127.0.0.1:3122/ws';
const errors = [];
const log = (m) => console.log('  ' + m);
const ok = (c, m) => { if (c) log('✓ ' + m); else { errors.push(m); log('✗ ' + m); } };

function client(name) {
  const ws = new WS(URL);
  const c = { name, ws, state: null, seat: -1, code: null, plays: 0, bids: 0, msgs: [] };
  ws.on('open', () => ws.send(JSON.stringify({ type: 'name', name })));
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    c.msgs.push(m);
    if (m.type === 'joined') { c.seat = m.seat; c.code = m.code; }
    if (m.type === 'state') {
      c.state = m;
      const g = m.g;
      if (!g) return;
      if (!c.firstDeal && g.hand && g.hand.length === 8 && g.phase === 'maka') {
        c.firstDeal = { hand: g.hand.slice(), upcard: g.upcard, phase: g.phase };
      }
      const key = g.phase + g.roundNo + g.tricks.join() + g.turn + (g.hand || []).length;
      if (c.lastKey === key) return;
      c.lastKey = key;
      if (g.canBid) {
        c.bids++;
        // Bélote Gasy: bid Pique (16 dz) on the first opportunity, else pass;
        // decline every contre prompt.
        const action = g.phase === 'maka' && g.bidSeat == null
          ? { type: 'game', game: 'S' }
          : { type: 'pass' };
        setTimeout(() => send(c, 'bid', { action }), 60);
      }
      else if (g.phase === 'play' && g.turn === m.you && g.legal.length) {
        c.plays++;
        setTimeout(() => send(c, 'play', { card: g.legal[(Math.random() * g.legal.length) | 0] }), 60);
      }
    }
    if (m.type === 'nope' || m.type === 'error') errors.push(name + ' got ' + m.type + ': ' + m.err);
  });
  return c;
}
const send = (c, type, data) => c.ws.send(JSON.stringify(Object.assign({ type }, data)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(100); }
  return false;
};

(async function run() {
  console.log('multiplayer');
  const host = client('Hostine');
  await until(() => host.ws.readyState === 1);
  send(host, 'create', { target: 301, difficulty: 'normal' });
  await until(() => host.code);
  ok(!!host.code && host.code.length === 4, 'host created table ' + host.code);
  ok(host.seat === 0, 'host takes seat 0');

  const guest = client('Guestave');
  await until(() => guest.ws.readyState === 1);
  send(guest, 'join', { code: host.code });
  await until(() => guest.seat >= 0);
  ok(guest.seat === 1, 'guest is seated at 1, got ' + guest.seat);
  await until(() => host.state && host.state.room.humans === 2);
  ok(host.state.room.humans === 2, 'host sees 2 humans at the table');
  ok(host.state.room.seats.filter((s) => s.type === 'ai').length === 2, 'two AI fill the empty seats');
  ok(host.state.isHost && !guest.state.isHost, 'only the creator is host');

  // a stranger cannot start the game
  send(guest, 'startGame', {});
  await sleep(250);
  ok(!host.state.room.started, 'non-host cannot start the game');

  send(host, 'startGame', {});
  const started = await until(() => host.state.room.started && host.state.g);
  ok(started, 'host started the game');
  ok(host.firstDeal && host.firstDeal.hand.length === 8, 'host was dealt 8 cards');
  ok(guest.firstDeal && guest.firstDeal.hand.length === 8, 'guest was dealt 8 cards');
  ok(!host.firstDeal.hand.some((c) => guest.firstDeal.hand.includes(c)), 'hands are disjoint (no card leaks)');
  ok(host.firstDeal.upcard == null && guest.firstDeal.upcard == null, 'no turned-up card in Bélote Gasy');
  ok(!host.msgs.some((m) => m.type === 'state' && m.g && m.g.counts && m.g.hand && m.g.hand.length > 8),
    'a client is never sent more than its own eight cards');

  const dealt = await until(() => host.state.g.phase === 'play', 25000);
  ok(dealt, 'auction resolved and the contract is set: ' +
    (host.state.g.game || '?') + ' (x' + host.state.g.mult + ')');

  const done = await until(() => host.state.g.phase === 'roundEnd' || host.state.g.phase === 'gameOver', 90000);
  ok(done, 'the four players completed a full round');
  const r = host.state.g.lastResult;
  const want = r.mode === 'TA' ? 258 : r.mode === 'SA' ? 130 : 162;
  ok(r && r.raw[0] + r.raw[1] === want, 'round accounted for all its points (' + want + ')');
  ok(host.state.g.scores.some((s) => s > 0), 'match score advanced: ' + host.state.g.scores.join(' – '));

  // online tables roll into the next round without input
  const rolled = await until(() => host.state.g.roundNo === 2 || host.state.g.phase === 'gameOver', 20000);
  ok(rolled, 'online table auto-starts the next round');

  // disconnect handling: AI takes over the empty seat
  const seatOfGuest = guest.seat;
  guest.ws.close();
  await sleep(600);
  ok(host.state.room.seats[seatOfGuest].connected === false, 'host sees the guest drop');
  const keepsGoing = await until(() => host.state.g.turn !== seatOfGuest || host.state.g.phase !== 'play', 15000);
  ok(keepsGoing, 'the AI covers the empty seat so play continues');

  console.log('');
  if (errors.length) { console.log('FAILURES:\n' + errors.map((e) => ' - ' + e).join('\n')); process.exit(1); }
  console.log('multiplayer OK\n');
  process.exit(0);
})();
