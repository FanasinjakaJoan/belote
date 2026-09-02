'use strict';
const assert = require('assert');
const E = require('../public/js/engine');

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✓ ' + name); };

console.log('engine (Bélote Gasy)');

t('deck is 32 unique cards; totals 152 colour / 248 TA / 120 SA + dix de der', () => {
  const d = E.makeDeck();
  assert.strictEqual(d.length, 32);
  assert.strictEqual(new Set(d).size, 32);
  for (const s of E.SUITS) {
    assert.strictEqual(d.reduce((a, c) => a + E.cardPoints(c, 'C', s), 0), 152);
  }
  assert.strictEqual(d.reduce((a, c) => a + E.cardPoints(c, 'TA', null), 0), 248);
  assert.strictEqual(d.reduce((a, c) => a + E.cardPoints(c, 'SA', null), 0), 120);
});

t('dizaines rounding: units 1–5 down, 6–9 up', () => {
  assert.strictEqual(E.toDizaines(86), 9);
  assert.strictEqual(E.toDizaines(84), 8);
  assert.strictEqual(E.toDizaines(140), 14);
  assert.strictEqual(E.toDizaines(118), 12);
  assert.strictEqual(E.toDizaines(258), 26);
  assert.strictEqual(E.toDizaines(130), 13);
  assert.strictEqual(E.toDizaines(81), 8);
  assert.strictEqual(E.toDizaines(90), 9);
  assert.strictEqual(E.toDizaines(5), 0);
  assert.strictEqual(E.toDizaines(16), 2);
});

t('colour game: trump beats plain, higher trump beats lower', () => {
  const trick = [
    { seat: 0, card: 'AS' }, { seat: 1, card: 'TS' },
    { seat: 2, card: '7H' }, { seat: 3, card: '9H' },
  ];
  assert.strictEqual(E.trickWinnerIndex(trick, 'C', 'H'), 3);
  assert.strictEqual(E.trickWinnerIndex(trick, 'C', 'S'), 0);
  assert.strictEqual(E.trickWinnerIndex([{ seat: 0, card: 'JH' }, { seat: 1, card: '9H' }], 'C', 'H'), 0);
});

t('off-suit discard never wins in a colour game', () => {
  const trick = [{ seat: 0, card: '7S' }, { seat: 1, card: 'AD' }];
  assert.strictEqual(E.trickWinnerIndex(trick, 'C', 'C'), 0);
});

t('TA: no cutting — the led suit alone decides the winner', () => {
  const trick = [{ seat: 0, card: 'AS' }, { seat: 1, card: '9H' }];
  assert.strictEqual(E.trickWinnerIndex(trick, 'TA', null), 0);
  const trick2 = [{ seat: 0, card: 'JS' }, { seat: 1, card: 'AS' }];
  assert.strictEqual(E.trickWinnerIndex(trick2, 'TA', null), 0);
});

t('SA: no cutting — plain order of the led suit decides', () => {
  const trick = [{ seat: 0, card: 'AS' }, { seat: 1, card: 'TS' }, { seat: 2, card: 'JH' }];
  assert.strictEqual(E.trickWinnerIndex(trick, 'SA', null), 0);
  const trick2 = [{ seat: 0, card: 'KS' }, { seat: 1, card: 'AS' }];
  assert.strictEqual(E.trickWinnerIndex(trick2, 'SA', null), 1);
});

t('must follow suit', () => {
  const hand = ['AS', '7S', 'KH'];
  const legal = E.legalCards(hand, [{ seat: 0, card: '9S' }], 'C', 'C');
  assert.deepStrictEqual(legal.sort(), ['7S', 'AS']);
});

t('must over-trump when trump is led (monter)', () => {
  const hand = ['JC', '7C', 'AS'];
  const legal = E.legalCards(hand, [{ seat: 0, card: '9C' }], 'C', 'C');
  assert.deepStrictEqual(legal, ['JC']);
});

t('void player must cut an opponent-winning trick (miboty)', () => {
  const hand = ['7C', 'AH', 'KH'];
  const legal = E.legalCards(hand, [{ seat: 0, card: 'AS' }], 'C', 'C');
  assert.deepStrictEqual(legal, ['7C']);
});

t('void player may pisser freely when partner is winning', () => {
  const trick = [{ seat: 0, card: '7S' }, { seat: 1, card: 'AS' }, { seat: 2, card: '8S' }];
  const hand = ['7C', 'AH', 'KH'];
  assert.deepStrictEqual(E.legalCards(hand, trick, 'C', 'C').sort(), ['7C', 'AH', 'KH'].sort());
});

t('TA: must beat the master when following, any card when void', () => {
  const hand = ['JS', '7S', 'KH'];
  const legal = E.legalCards(hand, [{ seat: 0, card: '9S' }], 'TA', null);
  assert.deepStrictEqual(legal, ['JS']);
  const hand2 = ['7C', 'AH', 'KH'];
  const trick = [{ seat: 0, card: '9S' }];
  assert.deepStrictEqual(E.legalCards(hand2, trick, 'TA', null).sort(), ['7C', 'AH', 'KH'].sort());
});

t('SA: follow suit only, void discards freely', () => {
  const hand = ['AS', '7S', 'KH'];
  const legal = E.legalCards(hand, [{ seat: 0, card: '9S' }], 'SA', null);
  assert.deepStrictEqual(legal.sort(), ['7S', 'AS']);
  const hand2 = ['7C', 'AH', 'KH'];
  assert.deepStrictEqual(E.legalCards(hand2, [{ seat: 0, card: '9S' }], 'SA', null).sort(),
    ['7C', 'AH', 'KH'].sort());
});

// ─────────────────────────────────────────────── deal & appel (maka) ──

t('first deal: 5 cards each, 12-card stock, no turned-up card', () => {
  const g = E.createGame({ seed: 99, dealer: 3 });
  E.startRound(g);
  assert.strictEqual(g.phase, 'maka');
  for (const h of g.hands) assert.strictEqual(h.length, 5);
  assert.strictEqual(g.stock.length, 12);
  assert.strictEqual(g.upcard, undefined);
  assert.strictEqual(new Set(g.hands.flat()).size, 20);
});

t('the first speaker MUST call — bon/contre are refused before any appel', () => {
  const g = E.createGame({ seed: 11 });
  E.startRound(g);
  const first = g.turn;
  assert.strictEqual(g.bidSeat, null);
  let r = E.applyBid(g, first, { type: 'bon' });
  assert.ok(!r.ok, 'bon is refused on the opening');
  r = E.applyBid(g, first, { type: 'contre' });
  assert.ok(!r.ok, 'contre is refused on the opening');
  r = E.applyBid(g, first, { type: 'game', game: 'S' });
  assert.ok(r.ok && r.event === 'bid');
  assert.strictEqual(g.bidSeat, first);
  assert.strictEqual(g.bidValue, 16);
});

t('three consecutive bon fix a colour appel and deal the last 3 cards', () => {
  const g = E.createGame({ seed: 12 });
  E.startRound(g);
  E.applyBid(g, g.turn, { type: 'game', game: 'S' });
  const taker = g.bidSeat;
  for (let i = 0; i < 3; i++) {
    const seat = g.turn;
    const r = E.applyBid(g, seat, { type: 'bon' });
    assert.ok(r.ok, r.err);
    if (i < 2) assert.strictEqual(r.event, 'bon');
  }
  assert.strictEqual(g.phase, 'play');
  assert.strictEqual(g.taker, taker);
  assert.strictEqual(g.game, 'S');
  assert.strictEqual(g.mode, 'C');
  assert.strictEqual(g.trump, 'S');
  for (const h of g.hands) assert.strictEqual(h.length, 8, 'hands completed to 8');
  assert.strictEqual(g.stock.length, 0);
});

t('a raise resets the bon count; the auction stays open', () => {
  const g = E.createGame({ seed: 13 });
  E.startRound(g);
  E.applyBid(g, g.turn, { type: 'game', game: 'S' });
  E.applyBid(g, g.turn, { type: 'bon' });
  E.applyBid(g, g.turn, { type: 'bon' });
  // third player raises to TA (26 > 16)
  const seat = g.turn;
  const r = E.applyBid(g, seat, { type: 'game', game: 'TA' });
  assert.ok(r.ok && r.event === 'bid');
  assert.strictEqual(g.bonCount, 0);
  assert.strictEqual(g.bidSeat, seat);
});

t('Sans-Atout and Trèfle are fixed by a SINGLE bon', () => {
  for (const game of ['SA', 'C']) {
    const g = E.createGame({ seed: 14 });
    E.startRound(g);
    E.applyBid(g, g.turn, { type: 'game', game });
    const r = E.applyBid(g, g.turn, { type: 'bon' });
    assert.ok(r.ok && r.event === 'decided', game + ' closes with one bon');
    assert.strictEqual(g.phase, 'play');
    assert.strictEqual(g.game, game);
    assert.strictEqual(E.bonsNeeded(game), 1);
  }
});

t('equal or lower calls are refused — only HIGHER appels', () => {
  const g = E.createGame({ seed: 15 });
  E.startRound(g);
  E.applyBid(g, g.turn, { type: 'game', game: 'H' }); // 16
  const b = g.turn;
  let r = E.applyBid(g, b, { type: 'game', game: 'D' }); // 16 equal
  assert.ok(!r.ok, 'equal colour call refused');
  r = E.applyBid(g, b, { type: 'game', game: 'TA' }); // 26 higher
  assert.ok(r.ok && g.bidGame === 'TA');
  const c = g.turn;
  r = E.applyBid(g, c, { type: 'game', game: 'S' }); // 16 lower
  assert.ok(!r.ok, 'lower call refused');
});

t('the partner may not call another colour — only SA/TA (when higher)', () => {
  const g = E.createGame({ seed: 16 });
  E.startRound(g);
  E.applyBid(g, g.turn, { type: 'game', game: 'S' }); // seat A, 16
  const a = g.bidSeat;
  E.applyBid(g, g.turn, { type: 'bon' });
  const partner = (a + 2) % 4;
  // drive the turn around until the partner speaks
  let guard = 0;
  while (g.turn !== partner && g.phase === 'maka' && guard++ < 6) {
    const r = E.applyBid(g, g.turn, { type: 'bon' });
    if (!r.ok) break;
  }
  assert.strictEqual(g.turn, partner, 'partner has the word');
  let r = E.applyBid(g, partner, { type: 'game', game: 'D' });
  assert.ok(!r.ok, 'partner cannot call a colour');
  r = E.applyBid(g, partner, { type: 'game', game: 'SA' }); // 52 > 16
  assert.ok(r.ok && r.event === 'bid', 'partner may call Sans-Atout');
});

t('contre by an opponent freezes the appel; the partner may bon or surcontre', () => {
  const g = E.createGame({ seed: 17 });
  E.startRound(g);
  const first = g.turn;
  E.applyBid(g, first, { type: 'game', game: 'S' });
  // opponents: the next two seats are the defenders
  const def1 = g.turn;
  const r = E.applyBid(g, def1, { type: 'contre' });
  assert.ok(r.ok && r.event === 'contre');
  assert.strictEqual(g.phase, 'contre');
  assert.strictEqual(g.mult, 2);
  assert.strictEqual(g.turn, (first + 2) % 4, 'the taker\'s partner has the word');
  // partner says bon → decided at ×2
  let r2 = E.applyBid(g, g.turn, { type: 'bon' });
  assert.ok(r2.ok && r2.event === 'decided');
  assert.strictEqual(g.phase, 'play');
  assert.strictEqual(g.mult, 2);
  for (const h of g.hands) assert.strictEqual(h.length, 8);
});

t('the partner may surcontre a colour appel (×4)', () => {
  const g = E.createGame({ seed: 18 });
  E.startRound(g);
  const first = g.turn;
  E.applyBid(g, first, { type: 'game', game: 'D' });
  E.applyBid(g, g.turn, { type: 'contre' });
  assert.strictEqual(g.phase, 'contre');
  const r = E.applyBid(g, g.turn, { type: 'surcontre' });
  assert.ok(r.ok && r.event === 'decided');
  assert.strictEqual(g.mult, 4);
  assert.strictEqual(g.phase, 'play');
});

t('contre on SA/Trèfle is final (no surcontre) and deals immediately', () => {
  for (const game of ['SA', 'C']) {
    const g = E.createGame({ seed: 19 });
    E.startRound(g);
    E.applyBid(g, g.turn, { type: 'game', game });
    const r = E.applyBid(g, g.turn, { type: 'contre' });
    assert.ok(r.ok && r.event === 'decided', game + ' contre goes straight to play');
    assert.strictEqual(g.phase, 'play');
    assert.strictEqual(g.mult, 2);
    assert.strictEqual(g.game, game);
  }
});

t('the partner cannot contre his own team', () => {
  const g = E.createGame({ seed: 20 });
  E.startRound(g);
  const first = g.turn;
  E.applyBid(g, first, { type: 'game', game: 'H' });
  E.applyBid(g, g.turn, { type: 'bon' });
  const partner = (first + 2) % 4;
  let guard = 0;
  while (g.turn !== partner && g.phase === 'maka' && guard++ < 6) {
    E.applyBid(g, g.turn, { type: 'bon' });
  }
  if (g.turn === partner) {
    const r = E.applyBid(g, partner, { type: 'contre' });
    assert.ok(!r.ok, 'partner contre refused');
  }
});

// ─────────────────────────────────────────────── scoring ──

function forceGame(game, taker) {
  const g = E.createGame({ seed: 42 });
  E.startRound(g);
  g.bidSeat = taker;
  g.bidGame = game;
  g.bidValue = E.GAMES[game];
  g.bonCount = 0;
  E.finalizeContract(g);
  assert.strictEqual(g.phase, 'play');
  return g;
}

t('colour contract made → taker team takes all 16 dizaines', () => {
  const g = forceGame('S', 0);
  g.tricksWon = [[['7S']], [['8S']]];
  g.roundPoints = [90, 72];
  g.lastTrick = { winner: 1, cards: ['8S'], points: 8 };
  E.scoreRound(g);
  assert.strictEqual(g.lastResult.outcome, 'contract');
  assert.deepStrictEqual(g.lastResult.final, [16, 0]);
});

t('colour fall (maty) → defence takes all 16 dizaines', () => {
  const g = forceGame('H', 1);
  g.tricksWon = [[['7S']], [['8S']]];
  g.roundPoints = [92, 70];
  g.lastTrick = { winner: 0, cards: ['7S'], points: 7 };
  E.scoreRound(g);
  assert.strictEqual(g.lastResult.outcome, 'maty');
  assert.deepStrictEqual(g.lastResult.final, [16, 0]);
});

t('Trèfle contract made → 64 dizaines', () => {
  const g = forceGame('C', 2);
  g.tricksWon = [[['7S']], [['8S']]];
  g.roundPoints = [95, 67];
  g.lastTrick = { winner: 2, cards: ['7S'], points: 7 };
  E.scoreRound(g);
  assert.strictEqual(g.lastResult.outcome, 'contract');
  assert.deepStrictEqual(g.lastResult.final, [64, 0]);
});

t('Sans-Atout contract made → 52 dizaines', () => {
  const g = forceGame('SA', 0);
  g.tricksWon = [[['7S']], [['8S']]];
  g.roundPoints = [66, 64];
  g.lastTrick = { winner: 2, cards: ['8S'], points: 8 };
  E.scoreRound(g);
  assert.strictEqual(g.lastResult.outcome, 'contract');
  assert.deepStrictEqual(g.lastResult.final, [52, 0]);
});

t('Tout-Atout success → the 26 dizaines are shared from rounded points', () => {
  const g = forceGame('TA', 0);
  g.tricksWon = [[['7S']], [['8S']]];
  g.roundPoints = [140, 118];
  g.lastTrick = { winner: 2, cards: ['8S'], points: 8 };
  E.scoreRound(g);
  assert.strictEqual(g.lastResult.outcome, 'contract');
  assert.deepStrictEqual(g.lastResult.final, [14, 12]);
  assert.strictEqual(g.lastResult.final[0] + g.lastResult.final[1], 26);
});

t('Tout-Atout fall → defence takes all 26 dizaines', () => {
  const g = forceGame('TA', 1);
  g.tricksWon = [[['7S']], [['8S']]];
  g.roundPoints = [138, 120];
  g.lastTrick = { winner: 0, cards: ['7S'], points: 7 };
  E.scoreRound(g);
  assert.strictEqual(g.lastResult.outcome, 'maty');
  assert.deepStrictEqual(g.lastResult.final, [26, 0]);
});

t('contre ×2 and surcontre ×4 multiply the dizaines', () => {
  const g = forceGame('S', 0);
  g.mult = 2;
  g.tricksWon = [[['7S']], [['8S']]];
  g.roundPoints = [90, 72];
  g.lastTrick = { winner: 1, cards: ['8S'], points: 8 };
  E.scoreRound(g);
  assert.deepStrictEqual(g.lastResult.final, [32, 0]);

  const g2 = forceGame('D', 1);
  g2.mult = 4;
  g2.tricksWon = [[['7S']], [['8S']]];
  g2.roundPoints = [60, 102];
  g2.lastTrick = { winner: 1, cards: ['8S'], points: 8 };
  E.scoreRound(g2);
  assert.deepStrictEqual(g2.lastResult.final, [0, 64]);
});

t('match ends at 150 dizaines', () => {
  const g = forceGame('S', 0);
  g.scores = [134, 20];
  g.tricksWon = [[['7S']], [['8S']]];
  g.roundPoints = [90, 72];
  g.lastTrick = { winner: 1, cards: ['8S'], points: 8 };
  E.scoreRound(g);
  assert.strictEqual(g.phase, 'gameOver');
  assert.strictEqual(g.winner, 0);
  assert.strictEqual(g.scores[0], 150);
});

// ─────────────────────────────────────────────── full AI rounds ──

function runAuction(g, diff) {
  let guard = 0;
  while (g.phase === 'maka' && guard++ < 60) {
    const r = E.applyBid(g, g.turn, E.aiBid(g, g.turn, diff));
    assert.ok(r.ok, r.err);
  }
  if (g.phase === 'contre') {
    const r = E.applyBid(g, g.turn, E.aiContre(g, g.turn, diff));
    assert.ok(r.ok, r.err);
  }
}

function playFullRound(game, mode) {
  const g = forceGame(game, 0);
  let guard = 0;
  while (g.phase === 'play' && guard++ < 40) {
    const c = E.aiPlay(g, g.turn, 'normal');
    const r = E.playCard(g, g.turn, c);
    assert.ok(r.ok, r.err);
  }
  assert.ok(g.phase === 'roundEnd' || g.phase === 'gameOver');
  const want = mode === 'TA' ? 258 : mode === 'SA' ? 130 : 162;
  assert.strictEqual(g.roundPoints[0] + g.roundPoints[1], want, mode + ' raw total');
  const f = g.lastResult.final;
  assert.ok(f[0] >= 0 && f[1] >= 0);
  if (g.mode === 'TA' && g.lastResult.outcome === 'contract') {
    assert.strictEqual(f[0] + f[1], 26 * g.mult);
  } else if (g.lastResult.outcome === 'contract' || g.lastResult.outcome === 'maty') {
    assert.strictEqual(f[0] + f[1], E.GAMES[g.game] * g.mult);
  }
  return g;
}

t('a full AI round plays out legally in every mode', () => {
  for (const [game, mode] of [['S', 'C'], ['C', 'C'], ['TA', 'TA'], ['SA', 'SA']]) {
    playFullRound(game, mode);
  }
});

t('1000 AI rounds: appel always resolves and the play stays legal', () => {
  for (let i = 0; i < 1000; i++) {
    const g = E.createGame({ seed: 1000 + i, dealer: i % 4, target: 100000 });
    E.startRound(g);
    runAuction(g, i % 2 ? 'hard' : 'normal');
    assert.ok(g.phase === 'play', 'auction resolves to play');
    assert.ok(g.taker != null && g.game != null);
    for (const h of g.hands) assert.strictEqual(h.length, 8);
    let guard = 0;
    while (g.phase === 'play' && guard++ < 40) {
      const seat = g.turn;
      const c = E.aiPlay(g, seat, 'normal');
      assert.ok(E.legalCards(g.hands[seat], g.trick, g.mode, g.trump).includes(c), 'AI played illegally');
      const r = E.playCard(g, seat, c);
      assert.ok(r.ok, r.err);
    }
    const want = g.mode === 'TA' ? 258 : g.mode === 'SA' ? 130 : 162;
    assert.strictEqual(g.roundPoints[0] + g.roundPoints[1], want);
    const f = g.lastResult.final;
    assert.ok(f[0] >= 0 && f[1] >= 0);
  }
});

console.log('\n' + pass + ' passing\n');
