'use strict';
/**
 * Headless client integration test.
 * Boots the real server, loads public/index.html in jsdom, stubs canvas/audio,
 * clicks "Play vs AI" and plays a whole round through the real UI code path.
 * Any client-side exception fails the run.
 */
const path = require('path');
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const PORT = 3111;
process.env.PORT = PORT;
require('../server/index.js');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + (e.stack || e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8')
  .replace(/<link[^>]*fonts\.[^>]*>/g, '');

const dom = new JSDOM(html, {
  url: `http://127.0.0.1:${PORT}/`,
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const win = dom.window;

// ── stubs ───────────────────────────────────────────────────────────────────
// Networking is deliberately BROKEN for this suite: solo play must work with
// no server at all (offline PWA / packaged mobile app).
win.WebSocket = function () { throw new Error('network is disabled in this test'); };
win.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({}, {
    get: (t, k) => (k === 'canvas' ? {} : typeof k === 'string' ? () => {} : undefined),
    set: () => true,
  });
};
win.AudioContext = function () {
  const node = () => ({
    connect() {}, start() {}, stop() {}, gain: param(), frequency: param(), type: '',
    buffer: null, getChannelData: () => new Float32Array(8),
  });
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  return {
    state: 'running', currentTime: 0, sampleRate: 44100, destination: {},
    resume() {}, createGain: node, createOscillator: node, createBiquadFilter: node,
    createBufferSource: node, createBuffer: () => ({ getChannelData: () => new Float32Array(8) }),
  };
};
win.matchMedia = (q) => ({ matches: q.includes('hover: hover'), addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
win.fetch = () => Promise.resolve({ json: () => Promise.resolve({ rooms: [] }) });
win.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
win.scrollTo = () => {};
Object.defineProperty(win.navigator, 'clipboard', { value: { writeText: async () => {} }, configurable: true });

const $ = (s) => win.document.querySelector(s);
const $$ = (s) => [...win.document.querySelectorAll(s)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function click(el) {
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
}
function tapCard(el) {
  el.dispatchEvent(new win.Event('pointerdown', { bubbles: true, cancelable: true }));
}
function key(k) {
  win.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}

(async function run() {
  await new Promise((r) => win.addEventListener('load', r));
  await sleep(600);

  const assert = (cond, msg) => { if (!cond) { errors.push('ASSERT: ' + msg); console.log('  ✗ ' + msg); } else console.log('  ✓ ' + msg); };

  console.log('client');
  assert($('#start').classList.contains('active'), 'start screen is visible on load');
  assert($('#hsTable').textContent.includes('No games yet'), 'empty hall of fame renders');

  // How-to-play opens and closes
  key('4');
  await sleep(50);
  assert($('#how').classList.contains('active'), 'keyboard "4" opens how-to-play');
  key('Escape');
  await sleep(50);
  assert($('#start').classList.contains('active'), 'Escape returns to the menu');

  // Start a solo game with keyboard
  let firstDeal = null;
  win.Net.on('state', (m) => {
    if (!firstDeal && m.g && m.g.hand && m.g.hand.length === 5) {
      firstDeal = { hand: m.g.hand.slice(), counts: m.g.counts.slice(), upcard: m.g.upcard };
    }
  });
  key('1');
  await sleep(1400);
  assert(!$('#start').classList.contains('active'), 'solo game hides the menu');
  assert(win.Net.mode === 'local', 'solo runs on the offline engine, not the network');
  assert(firstDeal && firstDeal.hand.length === 5, 'first deal gives five cards');
  assert(firstDeal && firstDeal.counts.every((n) => n === 5), 'all four seats get five cards');
  assert(firstDeal && !!firstDeal.upcard, 'a card is turned up for bidding');
  assert($$('#hand .card').length > 0, 'cards are rendered in the hand');
  assert($$('#opp-n .mini').length > 0, 'north opponent shows card backs');

  // Bid: take the upcard as soon as it is our turn (else pass through)
  let took = false;
  for (let i = 0; i < 40 && !took; i++) {
    if ($('#bidPanel').classList.contains('show')) {
      const take = $$('#bidActions .bid-btn').find((b) => b.classList.contains('take'));
      if (take) { click(take); took = true; }
      else { click($$('#bidActions .bid-btn').find((b) => b.textContent === 'Pass')); }
    }
    await sleep(300);
  }
  await sleep(2200);
  assert($('#trumpSuit').textContent !== '—', 'a trump was chosen: ' + $('#trumpSuit').textContent);
  assert($$('#hand .card').length === 8, 'hand completed to 8 cards, got ' + $$('#hand .card').length);

  // Play a full round through the UI
  let plays = 0, guard = 0;
  while (plays < 8 && guard++ < 400) {
    const playable = $$('#hand .card.playable');
    if (playable.length) {
      const before = $$('#hand .card').length;
      tapCard(playable[Math.floor(Math.random() * playable.length)]);
      plays++;
      await sleep(500);
      assert2(before - 1 >= $$('#hand .card').length, 'card left the hand');
    }
    if ($('#roundEnd').classList.contains('active')) break;
    await sleep(120);
  }
  function assert2(c, m) { if (!c) errors.push('ASSERT: ' + m); }
  assert(plays === 8, 'played all 8 cards through the UI (' + plays + ')');

  // wait for the round to close out
  for (let i = 0; i < 60 && !$('#roundEnd').classList.contains('active'); i++) await sleep(250);
  assert($('#roundEnd').classList.contains('active'), 'round-end overlay appears');
  assert(/—/.test($('#reBody').textContent), 'round-end shows a score breakdown');
  await sleep(900); // let the score roll-up animation settle
  const scoreSum = (+$('#scoreUs').textContent) + (+$('#scoreThem').textContent);
  assert(scoreSum > 0, 'scoreboard updated (' + $('#scoreUs').textContent + ' – ' + $('#scoreThem').textContent + ')');

  // Next round via keyboard
  key('Enter');
  await sleep(1200);
  assert(!$('#roundEnd').classList.contains('active'), 'Enter starts the next round');
  assert($('#roundNo').textContent === '2', 'round counter advanced to 2');

  // Pause / resume
  key('p');
  await sleep(150);
  assert($('#pause').classList.contains('active'), 'P pauses the game');
  key('p');
  await sleep(150);
  assert(!$('#pause').classList.contains('active'), 'P resumes the game');

  // Illegal play is rejected client-side
  const dead = $$('#hand .card.dead')[0];
  if (dead) {
    tapCard(dead);
    await sleep(60);
    assert($('#toast').classList.contains('show'), 'illegal card shows a warning toast');
  }

  // Mute toggle persists
  click($('#btnSound'));
  await sleep(30);
  assert($('#btnSound').classList.contains('off'), 'sound toggles off');
  click($('#btnSound'));

  // Highscore storage
  // the app shell declares itself installable
  assert(!!win.document.querySelector('link[rel="manifest"]'), 'manifest is linked');

  win.Store.addScore({ score: 501, opp: 320, rounds: 4, target: 501, difficulty: 'hard', won: 1, mode: 'solo' });
  assert(win.Store.highscores().length === 1, 'high score persisted');

  await sleep(200);
  console.log('');
  if (errors.length) {
    console.log('FAILURES:\n' + errors.map((e) => ' - ' + e).join('\n'));
    process.exit(1);
  }
  console.log('client integration OK\n');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
