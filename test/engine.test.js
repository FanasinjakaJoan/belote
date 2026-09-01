'use strict';
const assert = require('assert');
const E = require('../public/js/engine');

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✓ ' + name); };

console.log('engine');

t('deck is 32 unique cards worth 152 points in any trump', () => {
  const d = E.makeDeck();
  assert.strictEqual(d.length, 32);
  assert.strictEqual(new Set(d).size, 32);
  for (const s of E.SUITS) {
    const total = d.reduce((a, c) => a + E.cardPoints(c, s), 0);
    assert.strictEqual(total, 152);
  }
});

t('trump beats plain, higher trump beats lower', () => {
  const trick = [
    { seat: 0, card: 'AS' }, { seat: 1, card: 'TS' },
    { seat: 2, card: '7H' }, { seat: 3, card: '9H' },
  ];
  assert.strictEqual(E.trickWinnerIndex(trick, 'H'), 3);
  assert.strictEqual(E.trickWinnerIndex(trick, 'S'), 0);
  assert.strictEqual(E.trickWinnerIndex([{ seat: 0, card: 'JH' }, { seat: 1, card: '9H' }], 'H'), 0);
});

t('off-suit discard never wins', () => {
  const trick = [{ seat: 0, card: '7S' }, { seat: 1, card: 'AD' }];
  assert.strictEqual(E.trickWinnerIndex(trick, 'C'), 0);
});

t('must follow suit', () => {
  const hand = ['AS', '7S', 'KH'];
  const legal = E.legalCards(hand, [{ seat: 0, card: '9S' }], 'C');
  assert.deepStrictEqual(legal.sort(), ['7S', 'AS']);
});

t('must over-trump when trump is led', () => {
  const hand = ['JC', '7C', 'AS'];
  const legal = E.legalCards(hand, [{ seat: 0, card: '9C' }], 'C');
  assert.deepStrictEqual(legal, ['JC']);
});

t('void player must trump an opponent-winning trick', () => {
  const hand = ['7C', 'AH', 'KH'];
  const legal = E.legalCards(hand, [{ seat: 0, card: 'AS' }], 'C');
  assert.deepStrictEqual(legal, ['7C']);
});

t('void player may discard freely when partner is winning', () => {
  const trick = [{ seat: 0, card: '7S' }, { seat: 1, card: '8S' }, { seat: 2, card: 'AS' }];
  const hand = ['7C', 'AH', 'KH']; // seat 3, partner is seat 1 -> seat 2 (opponent) wins
  assert.deepStrictEqual(E.legalCards(hand, trick, 'C'), ['7C']);
  const trick2 = [{ seat: 0, card: '7S' }, { seat: 1, card: 'AS' }, { seat: 2, card: '8S' }];
  assert.deepStrictEqual(E.legalCards(hand, trick2, 'C').sort(), ['7C', 'AH', 'KH'].sort());
});

t('full round plays out to 162 points', () => {
  const g = E.createGame({ seed: 12345, dealer: 3 });
  E.startRound(g);
  assert.strictEqual(g.phase, 'bid1');
  let guard = 0;
  while ((g.phase === 'bid1' || g.phase === 'bid2') && guard++ < 20) {
    E.applyBid(g, g.turn, E.aiBid(g, g.turn, 'hard'));
  }
  if (g.phase === 'redeal') return;
  assert.strictEqual(g.phase, 'play');
  for (let s = 0; s < 4; s++) assert.strictEqual(g.hands[s].length, 8);
  guard = 0;
  while (g.phase === 'play' && guard++ < 40) {
    const c = E.aiPlay(g, g.turn, 'normal');
    const r = E.playCard(g, g.turn, c);
    assert.ok(r.ok, r.err);
  }
  assert.ok(g.phase === 'roundEnd' || g.phase === 'gameOver');
  const total = g.roundPoints[0] + g.roundPoints[1];
  assert.strictEqual(total, 162, 'round points must total 162, got ' + total);
});

t('1000 AI rounds stay legal and consistent', () => {
  for (let i = 0; i < 1000; i++) {
    const g = E.createGame({ seed: 1000 + i, dealer: i % 4, target: 100000 });
    E.startRound(g);
    let guard = 0;
    while ((g.phase === 'bid1' || g.phase === 'bid2') && guard++ < 20) {
      E.applyBid(g, g.turn, E.aiBid(g, g.turn, i % 2 ? 'hard' : 'normal'));
    }
    if (g.phase !== 'play') continue;
    guard = 0;
    while (g.phase === 'play' && guard++ < 40) {
      const seat = g.turn;
      const c = E.aiPlay(g, seat, 'normal');
      assert.ok(E.legalCards(g.hands[seat], g.trick, g.trump).includes(c), 'AI played illegally');
      const r = E.playCard(g, seat, c);
      assert.ok(r.ok, r.err);
    }
    assert.strictEqual(g.roundPoints[0] + g.roundPoints[1], 162);
    const f = g.lastResult.final;
    assert.ok(f[0] >= 0 && f[1] >= 0);
  }
});

t('dedans awards 162 to the defenders', () => {
  const g = E.createGame({ seed: 5 });
  E.startRound(g);
  g.phase = 'play'; g.taker = 0; g.trump = 'S';
  g.tricksWon = [[['7S']], [['8S']]];
  g.roundPoints = [50, 112];
  E.scoreRound(g);
  assert.strictEqual(g.lastResult.outcome, 'dedans');
  assert.strictEqual(g.lastResult.final[1], 162);
  assert.strictEqual(g.lastResult.final[0], 0);
});

t('capot awards 252', () => {
  const g = E.createGame({ seed: 5 });
  E.startRound(g);
  g.phase = 'play'; g.taker = 1; g.trump = 'H';
  g.tricksWon = [[], [1, 2, 3, 4, 5, 6, 7, 8].map(() => ['7S'])];
  g.roundPoints = [0, 162];
  E.scoreRound(g);
  assert.strictEqual(g.lastResult.outcome, 'capot');
  assert.strictEqual(g.lastResult.final[1], 252);
});

t('belote/rebelote adds 20', () => {
  const g = E.createGame({ seed: 5 });
  E.startRound(g);
  g.phase = 'play'; g.taker = 0; g.trump = 'S';
  g.belote = { seat: 0, shown: 2 };
  g.tricksWon = [[['7S']], [['8S']]];
  g.roundPoints = [90, 72];
  E.scoreRound(g);
  assert.strictEqual(g.lastResult.final[0], 110);
});

console.log('\n' + pass + ' passing\n');
