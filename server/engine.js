'use strict';
/**
 * Belote Royale — rules engine.
 * Pure, deterministic (given an RNG), no I/O. Shared by the server and the tests.
 *
 * Standard French Belote: 32 cards, 4 seats, 2 teams (seats 0+2 vs 1+3).
 */

const SUITS = ['S', 'H', 'D', 'C']; // spades, hearts, diamonds, clubs
const RANKS = ['7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

// Card point values
const PTS_TRUMP = { J: 20, 9: 14, A: 11, T: 10, K: 4, Q: 3, 8: 0, 7: 0 };
const PTS_PLAIN = { A: 11, T: 10, K: 4, Q: 3, J: 2, 9: 0, 8: 0, 7: 0 };
// Strength order (higher wins)
const ORD_TRUMP = { J: 8, 9: 7, A: 6, T: 5, K: 4, Q: 3, 8: 2, 7: 1 };
const ORD_PLAIN = { A: 8, T: 7, K: 6, Q: 5, J: 4, 9: 3, 8: 2, 7: 1 };

const card = (r, s) => r + s;
const rankOf = (c) => c[0];
const suitOf = (c) => c[1];

function makeDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push(card(r, s));
  return d;
}

function cardPoints(c, trump) {
  return suitOf(c) === trump ? PTS_TRUMP[rankOf(c)] : PTS_PLAIN[rankOf(c)];
}
function cardOrder(c, trump) {
  return suitOf(c) === trump ? ORD_TRUMP[rankOf(c)] : ORD_PLAIN[rankOf(c)];
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const teamOf = (seat) => seat % 2;
const partnerOf = (seat) => (seat + 2) % 4;
const nextSeat = (seat) => (seat + 1) % 4;

/** Who is currently winning a (partial) trick? Returns index into `trick`. */
function trickWinnerIndex(trick, trump) {
  if (!trick.length) return -1;
  const lead = suitOf(trick[0].card);
  let best = 0;
  for (let i = 1; i < trick.length; i++) {
    const c = trick[i].card, b = trick[best].card;
    const cT = suitOf(c) === trump, bT = suitOf(b) === trump;
    if (cT && !bT) best = i;
    else if (cT === bT && suitOf(c) === suitOf(b)) {
      if (cardOrder(c, trump) > cardOrder(b, trump)) best = i;
    } else if (!cT && !bT && suitOf(c) !== lead) {
      // discard of another plain suit — never wins
    }
  }
  return best;
}

/**
 * Legal cards for `hand` given the trick so far.
 * Rules: follow suit; if trump led you must over-trump when able; if void you
 * must trump (over-trumping when able) unless your partner is winning the trick.
 */
function legalCards(hand, trick, trump) {
  if (!trick.length) return hand.slice();
  const lead = suitOf(trick[0].card);
  const trumps = hand.filter((c) => suitOf(c) === trump);
  const trumpsInTrick = trick.filter((t) => suitOf(t.card) === trump);
  const highestTrump = trumpsInTrick.length
    ? Math.max(...trumpsInTrick.map((t) => cardOrder(t.card, trump)))
    : 0;

  if (lead === trump) {
    const higher = trumps.filter((c) => cardOrder(c, trump) > highestTrump);
    if (higher.length) return higher;
    if (trumps.length) return trumps;
    return hand.slice();
  }

  const followers = hand.filter((c) => suitOf(c) === lead);
  if (followers.length) return followers;

  const winIdx = trickWinnerIndex(trick, trump);
  const winnerSeat = trick[winIdx].seat;
  const me = (trick[0].seat + trick.length) % 4;
  const partnerWinning = winnerSeat === partnerOf(me);
  if (partnerWinning) return hand.slice();

  if (trumps.length) {
    const higher = trumps.filter((c) => cardOrder(c, trump) > highestTrump);
    if (higher.length) return higher;
    return trumps; // must under-trump ("pisser") when holding only low trump
  }
  return hand.slice();
}

// ────────────────────────────────────────────────────────────── game state ──

function createGame(opts = {}) {
  return {
    target: opts.target || 501,
    seed: opts.seed || (Math.random() * 1e9) | 0,
    dealer: opts.dealer != null ? opts.dealer : (Math.random() * 4) | 0,
    scores: [0, 0],
    roundNo: 0,
    phase: 'idle', // idle | bid1 | bid2 | play | roundEnd | gameOver
    hands: [[], [], [], []],
    trump: null,
    taker: null,
    upcard: null,
    stock: [],
    trick: [],
    turn: 0,
    tricksWon: [[], []], // arrays of tricks (cards) per team
    roundPoints: [0, 0],
    belote: { seat: null, shown: 0 }, // shown: 0,1,2 halves declared
    passes: 0,
    bidHistory: [],
    lastTrick: null,
    lastResult: null,
    winner: null,
  };
}

function startRound(g) {
  g.roundNo += 1;
  g.dealer = nextSeat(g.dealer);
  const rng = mulberry32((g.seed + g.roundNo * 7919) >>> 0);
  const deck = shuffle(makeDeck(), rng);
  g.hands = [[], [], [], []];
  let k = 0;
  for (const chunk of [3, 2]) {
    for (let i = 0; i < 4; i++) {
      const seat = (g.dealer + 1 + i) % 4;
      for (let n = 0; n < chunk; n++) g.hands[seat].push(deck[k++]);
    }
  }
  g.upcard = deck[k++];
  g.stock = deck.slice(k);
  g.trump = null;
  g.taker = null;
  g.trick = [];
  g.tricksWon = [[], []];
  g.roundPoints = [0, 0];
  g.belote = { seat: null, shown: 0 };
  g.passes = 0;
  g.bidHistory = [];
  g.lastTrick = null;
  g.lastResult = null;
  g.phase = 'bid1';
  g.turn = nextSeat(g.dealer);
  for (const h of g.hands) sortHand(h, null);
  return g;
}

function sortHand(hand, trump) {
  const suitRank = (s) => (s === trump ? -1 : SUITS.indexOf(s));
  hand.sort((a, b) => {
    const sa = suitRank(suitOf(a)), sb = suitRank(suitOf(b));
    if (sa !== sb) return sa - sb;
    return cardOrder(b, trump) - cardOrder(a, trump);
  });
  return hand;
}

/** Deal remaining cards after somebody takes. */
function completeDeal(g, takerSeat, trump) {
  g.taker = takerSeat;
  g.trump = trump;
  g.hands[takerSeat].push(g.upcard);
  let k = 0;
  for (let i = 0; i < 4; i++) {
    const seat = (g.dealer + 1 + i) % 4;
    const need = 8 - g.hands[seat].length;
    for (let n = 0; n < need; n++) g.hands[seat].push(g.stock[k++]);
  }
  g.stock = [];
  for (const h of g.hands) sortHand(h, trump);
  // belote/rebelote holder
  for (let s = 0; s < 4; s++) {
    if (g.hands[s].includes('K' + trump) && g.hands[s].includes('Q' + trump)) g.belote.seat = s;
  }
  g.phase = 'play';
  g.turn = nextSeat(g.dealer);
  return g;
}

/** action: {type:'take'|'pass'|'takeSuit', suit?} */
function applyBid(g, seat, action) {
  if ((g.phase !== 'bid1' && g.phase !== 'bid2') || seat !== g.turn) return { ok: false, err: 'not your turn' };
  if (action.type === 'pass') {
    g.passes += 1;
    g.bidHistory.push({ seat, type: 'pass' });
    if (g.phase === 'bid1' && g.passes === 4) {
      g.phase = 'bid2';
      g.passes = 0;
      g.turn = nextSeat(g.dealer);
      return { ok: true, event: 'bid2' };
    }
    if (g.phase === 'bid2' && g.passes === 4) {
      g.phase = 'redeal';
      return { ok: true, event: 'redeal' };
    }
    g.turn = nextSeat(g.turn);
    return { ok: true, event: 'pass' };
  }
  if (action.type === 'take' && g.phase === 'bid1') {
    g.bidHistory.push({ seat, type: 'take', suit: suitOf(g.upcard) });
    completeDeal(g, seat, suitOf(g.upcard));
    return { ok: true, event: 'taken' };
  }
  if (action.type === 'takeSuit' && g.phase === 'bid2') {
    if (!SUITS.includes(action.suit) || action.suit === suitOf(g.upcard)) return { ok: false, err: 'bad suit' };
    g.bidHistory.push({ seat, type: 'take', suit: action.suit });
    completeDeal(g, seat, action.suit);
    return { ok: true, event: 'taken' };
  }
  return { ok: false, err: 'bad action' };
}

function playCard(g, seat, c) {
  if (g.phase !== 'play' || seat !== g.turn) return { ok: false, err: 'not your turn' };
  const hand = g.hands[seat];
  if (!hand.includes(c)) return { ok: false, err: 'card not in hand' };
  const legal = legalCards(hand, g.trick, g.trump);
  if (!legal.includes(c)) return { ok: false, err: 'illegal card' };

  hand.splice(hand.indexOf(c), 1);
  g.trick.push({ seat, card: c });

  const out = { ok: true, events: [] };
  // belote / rebelote declaration is automatic when K/Q of trump is played
  if (g.belote.seat === seat && suitOf(c) === g.trump && (rankOf(c) === 'K' || rankOf(c) === 'Q')) {
    g.belote.shown += 1;
    out.events.push({ type: 'belote', seat, n: g.belote.shown });
  }

  if (g.trick.length < 4) {
    g.turn = nextSeat(seat);
    return out;
  }

  // resolve trick
  const wIdx = trickWinnerIndex(g.trick, g.trump);
  const winner = g.trick[wIdx].seat;
  const cards = g.trick.map((t) => t.card);
  const pts = cards.reduce((a, x) => a + cardPoints(x, g.trump), 0);
  const t = teamOf(winner);
  g.tricksWon[t].push(cards);
  g.roundPoints[t] += pts;
  g.lastTrick = { cards: g.trick.slice(), winner, points: pts };
  out.events.push({ type: 'trick', winner, points: pts, cards: g.trick.slice() });
  g.trick = [];
  g.turn = winner;

  const played = g.tricksWon[0].length + g.tricksWon[1].length;
  if (played === 8) {
    g.roundPoints[t] += 10; // dix de der
    out.events.push({ type: 'lastTrick', team: t });
    scoreRound(g);
    out.events.push({ type: 'roundEnd' });
  }
  return out;
}

function scoreRound(g) {
  const takerTeam = teamOf(g.taker);
  const def = 1 - takerTeam;
  const raw = [g.roundPoints[0], g.roundPoints[1]];
  const beloteTeam = g.belote.seat != null && g.belote.shown >= 2 ? teamOf(g.belote.seat) : null;
  const capot = g.tricksWon[def].length === 0;
  const capotDef = g.tricksWon[takerTeam].length === 0;

  let final = [0, 0];
  let outcome;
  const bonus = (t) => (beloteTeam === t ? 20 : 0);

  if (capot) {
    final[takerTeam] = 252 + bonus(takerTeam);
    final[def] = bonus(def);
    outcome = 'capot';
  } else if (capotDef) {
    final[def] = 252 + bonus(def);
    final[takerTeam] = bonus(takerTeam);
    outcome = 'capot-defense';
  } else if (raw[takerTeam] + (beloteTeam === takerTeam ? 20 : 0) >= raw[def] + (beloteTeam === def ? 20 : 0) && raw[takerTeam] >= raw[def]) {
    final[takerTeam] = raw[takerTeam] + bonus(takerTeam);
    final[def] = raw[def] + bonus(def);
    outcome = 'contract';
  } else {
    final[def] = 162 + bonus(def);
    final[takerTeam] = bonus(takerTeam);
    outcome = 'dedans';
  }

  g.scores[0] += final[0];
  g.scores[1] += final[1];
  g.lastResult = {
    outcome, raw, final, takerTeam, taker: g.taker, trump: g.trump,
    belote: beloteTeam, scores: g.scores.slice(),
    tricks: [g.tricksWon[0].length, g.tricksWon[1].length],
  };
  g.phase = 'roundEnd';

  if (g.scores[0] >= g.target || g.scores[1] >= g.target) {
    if (g.scores[0] !== g.scores[1]) {
      g.winner = g.scores[0] > g.scores[1] ? 0 : 1;
      g.phase = 'gameOver';
    }
  }
  return g.lastResult;
}

// ─────────────────────────────────────────────────────────────────────── AI ──

function handStrength(hand, trump) {
  let s = 0, trumps = 0;
  for (const c of hand) {
    const r = rankOf(c);
    if (suitOf(c) === trump) {
      trumps++;
      if (r === 'J') s += 22; else if (r === '9') s += 14; else if (r === 'A') s += 8;
      else if (r === 'T') s += 6; else s += 4;
    } else {
      if (r === 'A') s += 8; else if (r === 'T') s += 3; else if (r === 'K') s += 2;
    }
  }
  if (trumps >= 4) s += 8;
  if (trumps >= 5) s += 10;
  if (trumps <= 1) s -= 12;
  return s;
}

function aiBid(g, seat, difficulty = 'normal') {
  const thresholds = { easy: 62, normal: 54, hard: 50 };
  const base = thresholds[difficulty] ?? 54;
  const hand = g.hands[seat];
  if (g.phase === 'bid1') {
    const trump = suitOf(g.upcard);
    const test = hand.concat([g.upcard]);
    let s = handStrength(test, trump);
    if (seat === g.dealer) s += 6; // dealer gets the card for free
    if (teamOf(seat) === teamOf(g.dealer)) s += 3;
    return s >= base ? { type: 'take' } : { type: 'pass' };
  }
  // round two: pick best alternative suit
  let best = null, bestScore = -1;
  for (const s of SUITS) {
    if (s === suitOf(g.upcard)) continue;
    const v = handStrength(hand, s);
    if (v > bestScore) { bestScore = v; best = s; }
  }
  const need = base + 4 - (seat === g.dealer ? 10 : 0); // dealer is forced-ish to save the deal
  return bestScore >= need ? { type: 'takeSuit', suit: best } : { type: 'pass' };
}

function aiPlay(g, seat, difficulty = 'normal') {
  const hand = g.hands[seat];
  const trump = g.trump;
  const legal = legalCards(hand, g.trick, trump);
  if (legal.length === 1) return legal[0];
  if (difficulty === 'easy') return legal[(Math.random() * legal.length) | 0];

  const pts = (c) => cardPoints(c, trump);
  const ord = (c) => cardOrder(c, trump);
  const trick = g.trick;

  if (!trick.length) {
    // lead: cash trump J/9 early, else lead an ace in a plain suit, else lowest
    const myTrumps = legal.filter((c) => suitOf(c) === trump);
    const masterTrump = myTrumps.find((c) => rankOf(c) === 'J') || myTrumps.find((c) => rankOf(c) === '9');
    if (masterTrump && g.taker === seat && myTrumps.length >= 3) return masterTrump;
    const aces = legal.filter((c) => rankOf(c) === 'A' && suitOf(c) !== trump);
    if (aces.length) return aces[0];
    const plains = legal.filter((c) => suitOf(c) !== trump);
    const pool = plains.length ? plains : legal;
    return pool.reduce((a, b) => (pts(b) < pts(a) || (pts(b) === pts(a) && ord(b) < ord(a)) ? b : a));
  }

  const wIdx = trickWinnerIndex(trick, trump);
  const winnerSeat = trick[wIdx].seat;
  const partnerWinning = winnerSeat === partnerOf(seat);
  const potPoints = trick.reduce((a, t) => a + pts(t.card), 0);
  const last = trick.length === 3;

  const beats = (c) => {
    const sim = trick.concat([{ seat, card: c }]);
    return trickWinnerIndex(sim, trump) === sim.length - 1;
  };
  const winners = legal.filter(beats);

  if (partnerWinning) {
    // feed points if the partner is safe (last to play, or partner holds a master trump)
    const safe = last || suitOf(trick[wIdx].card) === trump;
    const pool = safe ? legal : legal.filter((c) => pts(c) < 10);
    const source = pool.length ? pool : legal;
    return safe
      ? source.reduce((a, b) => (pts(b) > pts(a) ? b : a))
      : source.reduce((a, b) => (pts(b) < pts(a) || (pts(b) === pts(a) && ord(b) < ord(a)) ? b : a));
  }

  if (winners.length) {
    const cheap = winners.reduce((a, b) => (ord(b) < ord(a) ? b : a));
    if (last || potPoints >= 10 || suitOf(cheap) !== trump) return cheap;
    if (difficulty === 'hard' && potPoints < 5 && suitOf(cheap) === trump && trick.length < 3) {
      // don't burn trump on a worthless trick when others may still over-trump
      const junk = legal.filter((c) => suitOf(c) !== trump);
      if (junk.length) return junk.reduce((a, b) => (pts(b) < pts(a) ? b : a));
    }
    return cheap;
  }
  // can't win: dump the cheapest
  return legal.reduce((a, b) => (pts(b) < pts(a) || (pts(b) === pts(a) && ord(b) < ord(a)) ? b : a));
}

module.exports = {
  SUITS, RANKS, makeDeck, cardPoints, cardOrder, suitOf, rankOf,
  teamOf, partnerOf, nextSeat, trickWinnerIndex, legalCards, sortHand,
  createGame, startRound, applyBid, playCard, scoreRound,
  aiBid, aiPlay, handStrength, mulberry32, shuffle,
};
