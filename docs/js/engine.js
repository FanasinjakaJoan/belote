/**
 * Belote Royale — rules engine.
 * Pure, deterministic (given an RNG), no I/O. Shared by the server and the tests.
 *
 * Bélote Gasy (Malagasy belote), 4 seats, 2 teams (seats 0+2 vs 1+3), 32 cards.
 *   - First deal: 5 cards per player (3–2). The remaining 12 cards stay in the
 *     stock until the contract is decided.
 *   - Auction ("maka") with 5-card hands: the first speaker (right of the
 *     dealer) MUST call — Pique/Cœur/Carreau = 16 dz · Tout-Atout = 26 dz ·
 *     Sans-Atout = 52 dz · Trèfle = 64 dz.
 *   - Each following player may say "bon" (accept), "contrer" (opponents only,
 *     ends the auction), or call a game of equal or higher value (an equal
 *     call steals the contract). The partner of the current caller may not
 *     announce another colour — only Sans-Atout / Tout-Atout.
 *   - One "bon" closes the auction for Sans-Atout and Trèfle; three
 *     consecutive "bon" are needed for the other games.
 *   - A "contre" fixes the contract at ×2, then the taker's partner has one
 *     chance to "surcontrer" (×4, only for Pique/Cœur/Carreau and Tout-Atout)
 *     or to say "bon".
 *   - Only after the game is decided are the remaining 3 cards dealt to each
 *     player (8-card hands), then the play starts.
 *   - Card points: 152 + 10 (dix de der) = 162 for colour games, 120 + 10 = 130
 *     for Sans-Atout, 248 + 10 = 258 for Tout-Atout.
 *   - "Tout ou rien": colour / Trèfle / Sans-Atout award the whole contract to
 *     the winning team. Tout-Atout (26 dz) is split between the teams from the
 *     rounded card points when the taker succeeds.
 *   - Match: first team to 150 dizaines. Units 1–5 round down, 6–9 round up.
 *
 * UMD: `require('./engine')` in Node, `window.BeloteEngine` in the browser.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BeloteEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
'use strict';

const SUITS = ['S', 'H', 'D', 'C']; // spades, hearts, diamonds, clubs
const RANKS = ['7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

// Bidding words ("maka") and their contract value in dizaines.
const GAMES = { S: 16, H: 16, D: 16, C: 64, TA: 26, SA: 52 };

// Card point values (a colour game: the trump suit uses PTS_TRUMP, the rest PTS_PLAIN).
const PTS_TRUMP = { J: 20, 9: 14, A: 11, T: 10, K: 4, Q: 3, 8: 0, 7: 0 };
const PTS_PLAIN = { A: 11, T: 10, K: 4, Q: 3, J: 2, 9: 0, 8: 0, 7: 0 };
// Strength order (higher wins)
const ORD_TRUMP = { J: 8, 9: 7, A: 6, T: 5, K: 4, Q: 3, 8: 2, 7: 1 };
const ORD_PLAIN = { A: 8, T: 7, K: 6, Q: 5, J: 4, 9: 3, 8: 2, 7: 1 };

const card = (r, s) => r + s;
const rankOf = (c) => c[0];
const suitOf = (c) => c[1];

/** 'C' colour game · 'TA' tout-atout · 'SA' sans-atout */
const modeOf = (game) => (game === 'TA' ? 'TA' : game === 'SA' ? 'SA' : 'C');
/** The trump suit of a game (null for TA/SA) */
const trumpOf = (game) => (game === 'TA' || game === 'SA') ? null : game;

/** Sans-Atout and Trèfle are decided by a single "bon". */
const bonsNeeded = (game) => (game === 'SA' || game === 'C') ? 1 : 3;

/** A "surcontre" (×4) is only possible for Pique/Cœur/Carreau and Tout-Atout. */
const surcontreAllowed = (game) => game === 'TA' || (game !== 'SA' && game !== 'C');

function makeDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push(card(r, s));
  return d;
}

function cardPoints(c, mode, trump) {
  if (mode === 'TA') return PTS_TRUMP[rankOf(c)];
  if (mode === 'SA') return PTS_PLAIN[rankOf(c)];
  return suitOf(c) === trump ? PTS_TRUMP[rankOf(c)] : PTS_PLAIN[rankOf(c)];
}
function cardOrder(c, mode, trump) {
  if (mode === 'TA') return ORD_TRUMP[rankOf(c)];
  if (mode === 'SA') return ORD_PLAIN[rankOf(c)];
  return suitOf(c) === trump ? ORD_TRUMP[rankOf(c)] : ORD_PLAIN[rankOf(c)];
}
/** Is this card a trump? (TA: every card is) */
const isTrump = (c, mode, trump) => mode === 'TA' || (mode === 'C' && suitOf(c) === trump);

/** Bélote Gasy dizaines: units 1–5 round down, 6–9 round up. 86 → 9, 140 → 14. */
function toDizaines(pts) {
  const u = pts % 10;
  return u >= 6 ? Math.ceil(pts / 10) : Math.floor(pts / 10);
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
function trickWinnerIndex(trick, mode, trump) {
  if (!trick.length) return -1;
  const lead = suitOf(trick[0].card);
  if (mode === 'TA' || mode === 'SA') {
    // No cutting: the trick goes to the strongest card of the led suit.
    let best = 0;
    for (let i = 1; i < trick.length; i++) {
      if (suitOf(trick[i].card) !== lead) continue;
      if (cardOrder(trick[i].card, mode, trump) > cardOrder(trick[best].card, mode, trump)) best = i;
    }
    return best;
  }
  // Colour game: trump beats plain, same-suit compares, an off-suit discard never wins.
  let best = 0;
  for (let i = 1; i < trick.length; i++) {
    const c = trick[i].card, b = trick[best].card;
    const cT = suitOf(c) === trump, bT = suitOf(b) === trump;
    if (cT && !bT) best = i;
    else if (cT === bT && suitOf(c) === suitOf(b)) {
      if (cardOrder(c, mode, trump) > cardOrder(b, mode, trump)) best = i;
    }
  }
  return best;
}

/**
 * Legal cards for `hand` given the trick so far ("miboty" rules).
 * - Always follow suit when possible.
 * - Trump led (or TA): you must play a higher trump ("monter") when you can.
 * - Void in a colour game: you must cut if an opponent is master, may "pisser"
 *   (discard anything) when your partner is master; over-trump when able.
 * - SA / void: any card.
 */
function legalCards(hand, trick, mode, trump) {
  if (!trick.length) return hand.slice();
  const lead = suitOf(trick[0].card);
  const followers = hand.filter((c) => suitOf(c) === lead);

  if (mode === 'SA') {
    return followers.length ? followers : hand.slice();
  }

  if (mode === 'TA') {
    if (followers.length) {
      const master = Math.max(...trick
        .filter((t) => suitOf(t.card) === lead)
        .map((t) => cardOrder(t.card, mode, trump)));
      const higher = followers.filter((c) => cardOrder(c, mode, trump) > master);
      return higher.length ? higher : followers;
    }
    return hand.slice(); // no cutting in TA — void players discard freely
  }

  // colour game
  const trumps = hand.filter((c) => suitOf(c) === trump);
  const trumpsInTrick = trick.filter((t) => suitOf(t.card) === trump);
  const highestTrump = trumpsInTrick.length
    ? Math.max(...trumpsInTrick.map((t) => cardOrder(t.card, mode, trump)))
    : 0;

  if (lead === trump) {
    const higher = trumps.filter((c) => cardOrder(c, mode, trump) > highestTrump);
    if (higher.length) return higher;
    if (trumps.length) return trumps;
    return hand.slice();
  }

  if (followers.length) return followers;

  const winIdx = trickWinnerIndex(trick, mode, trump);
  const winnerSeat = trick[winIdx].seat;
  const me = (trick[0].seat + trick.length) % 4;
  if (winnerSeat === partnerOf(me)) return hand.slice(); // partner is master → pisser

  if (trumps.length) {
    const higher = trumps.filter((c) => cardOrder(c, mode, trump) > highestTrump);
    if (higher.length) return higher;
    return trumps; // must under-trump ("pisser") when holding only low trump
  }
  return hand.slice();
}

// ────────────────────────────────────────────────────────────── game state ──

function createGame(opts = {}) {
  return {
    target: opts.target || 150,   // match goal, in dizaines
    seed: opts.seed || (Math.random() * 1e9) | 0,
    dealer: opts.dealer != null ? opts.dealer : (Math.random() * 4) | 0,
    scores: [0, 0],
    roundNo: 0,
    phase: 'idle', // idle | maka | contre | play | roundEnd | gameOver
    hands: [[], [], [], []],
    mode: null,     // 'C' | 'TA' | 'SA'
    game: null,     // the contract word: 'S'|'H'|'D'|'C'|'TA'|'SA'
    trump: null,
    taker: null,
    mult: 1,        // 1 = bonne · 2 = contré · 4 = surcontré
    bidValue: 0,    // current highest bid (dizaines) — 0 = no bid yet
    bidGame: null,
    bidSeat: null,
    bonCount: 0,    // consecutive "bon" since the last call
    trick: [],
    turn: 0,
    tricksWon: [[], []], // arrays of tricks (cards) per team
    roundPoints: [0, 0],
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
  // Bélote Gasy: 5 cards per player (3–2), then the auction, then 3 more cards.
  for (const chunk of [3, 2]) {
    for (let i = 0; i < 4; i++) {
      const seat = (g.dealer + 1 + i) % 4;
      for (let n = 0; n < chunk; n++) g.hands[seat].push(deck[k++]);
    }
  }
  g.stock = deck.slice(k); // the 12 cards dealt only after the game is decided
  g.mode = null;
  g.game = null;
  g.trump = null;
  g.taker = null;
  g.mult = 1;
  g.bidValue = 0;
  g.bidGame = null;
  g.bidSeat = null;
  g.bonCount = 0;
  g.trick = [];
  g.tricksWon = [[], []];
  g.roundPoints = [0, 0];
  g.bidHistory = [];
  g.lastTrick = null;
  g.lastResult = null;
  g.phase = 'maka';
  g.turn = nextSeat(g.dealer); // the first speaker (right of the dealer)
  for (const h of g.hands) sortHand(h, null, null);
  return g;
}

function sortHand(hand, mode, trump) {
  const suitRank = (s) => (mode === 'C' && s === trump ? -1 : SUITS.indexOf(s));
  hand.sort((a, b) => {
    const sa = suitRank(suitOf(a)), sb = suitRank(suitOf(b));
    if (sa !== sb) return sa - sb;
    return cardOrder(b, mode, trump) - cardOrder(a, mode, trump);
  });
  return hand;
}

/**
 * The auction is over: fix the contract, deal the remaining 3 cards to each
 * player (8-card hands), sort and start the play. The first speaker leads.
 */
function finalizeContract(g) {
  g.taker = g.bidSeat;
  g.game = g.bidGame;
  g.mode = modeOf(g.game);
  g.trump = trumpOf(g.game);
  for (const h of g.hands) sortHand(h, g.mode, g.trump);
  let k = 0;
  for (let i = 0; i < 4; i++) {
    const seat = (g.dealer + 1 + i) % 4;
    for (let n = 0; n < 3; n++) g.hands[seat].push(g.stock[k++]);
  }
  g.stock = [];
  for (const h of g.hands) sortHand(h, g.mode, g.trump);
  g.phase = 'play';
  g.turn = nextSeat(g.dealer); // the first speaker leads
  return g;
}

/**
 * Auction & contre actions.
 *  maka:   {type:'game', game:'S'|'H'|'D'|'C'|'TA'|'SA'} (the first speaker
 *          must call) · {type:'bon'} · {type:'contre'} (opponents only)
 *  contre: {type:'bon'} | {type:'surcontre'}  (taker's partner only)
 * Events: 'bid' (opening/raise) · 'bon' · 'contre' · 'surcontre' · 'decided'
 * (the auction is closed; the engine has dealt the last 3 cards).
 */
function applyBid(g, seat, action) {
  if (g.phase === 'maka') {
    if (seat !== g.turn) return { ok: false, err: 'not your turn' };
    const opening = g.bidSeat == null;

    if (action.type === 'game' && GAMES[action.game] != null) {
      if (!opening) {
        // no equal or lower call — the next player may only call HIGHER
        if (GAMES[action.game] <= g.bidValue) {
          return { ok: false, err: 'not higher than ' + g.bidValue + ' dz' };
        }
        // the partner may only announce Sans-Atout / Tout-Atout
        if (seat === partnerOf(g.bidSeat) && action.game !== 'TA' && action.game !== 'SA') {
          return { ok: false, err: 'partner may only call Sans-Atout or Tout-Atout' };
        }
      }
      g.bidHistory.push({ seat, type: 'game', game: action.game, value: GAMES[action.game] });
      g.bidValue = GAMES[action.game];
      g.bidGame = action.game;
      g.bidSeat = seat;
      g.bonCount = 0;
      g.turn = nextSeat(g.turn);
      return { ok: true, event: 'bid' };
    }

    if (action.type === 'bon') {
      if (opening) return { ok: false, err: 'the first caller must make an appel' };
      g.bidHistory.push({ seat, type: 'bon' });
      g.bonCount += 1;
      if (g.bonCount >= bonsNeeded(g.bidGame)) {
        finalizeContract(g);
        return { ok: true, event: 'decided' };
      }
      g.turn = nextSeat(g.turn);
      return { ok: true, event: 'bon' };
    }

    if (action.type === 'contre') {
      if (opening) return { ok: false, err: 'no contract to contre yet' };
      if (seat === partnerOf(g.bidSeat)) return { ok: false, err: 'you cannot contre your own team' };
      g.bidHistory.push({ seat, type: 'contre', game: g.bidGame });
      g.mult = 2;
      if (surcontreAllowed(g.bidGame)) {
        // the taker's partner may surcontre or say bon, then the deal happens
        g.phase = 'contre';
        g.turn = partnerOf(g.bidSeat);
        return { ok: true, event: 'contre' };
      }
      finalizeContract(g);
      return { ok: true, event: 'decided' };
    }

    return { ok: false, err: 'bad action' };
  }

  if (g.phase === 'contre') {
    if (seat !== g.turn || seat !== partnerOf(g.bidSeat)) return { ok: false, err: 'not your turn' };
    if (action.type === 'bon') {
      g.bidHistory.push({ seat, type: 'bon' });
      finalizeContract(g);
      return { ok: true, event: 'decided' };
    }
    if (action.type === 'surcontre' && surcontreAllowed(g.bidGame)) {
      g.bidHistory.push({ seat, type: 'surcontre' });
      g.mult = 4;
      finalizeContract(g);
      return { ok: true, event: 'decided' };
    }
    return { ok: false, err: 'bad action' };
  }

  return { ok: false, err: 'not bidding' };
}

function playCard(g, seat, c) {
  if (g.phase !== 'play' || seat !== g.turn) return { ok: false, err: 'not your turn' };
  const hand = g.hands[seat];
  if (!hand.includes(c)) return { ok: false, err: 'card not in hand' };
  const legal = legalCards(hand, g.trick, g.mode, g.trump);
  if (!legal.includes(c)) return { ok: false, err: 'illegal card' };

  hand.splice(hand.indexOf(c), 1);
  g.trick.push({ seat, card: c });
  const out = { ok: true, events: [] };

  if (g.trick.length < 4) {
    g.turn = nextSeat(seat);
    return out;
  }

  // resolve trick
  const wIdx = trickWinnerIndex(g.trick, g.mode, g.trump);
  const winner = g.trick[wIdx].seat;
  const cards = g.trick.map((t) => t.card);
  const pts = cards.reduce((a, x) => a + cardPoints(x, g.mode, g.trump), 0);
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
    out.events.push({ type: 'lastTrick', team: t, seat: winner });
    scoreRound(g);
    out.events.push({ type: 'roundEnd' });
  }
  return out;
}

/** Bélote Gasy scoring: "tout ou rien" in dizaines, split for Tout-Atout. */
function scoreRound(g) {
  const takerTeam = teamOf(g.taker);
  const def = 1 - takerTeam;
  const raw = [g.roundPoints[0], g.roundPoints[1]];
  const value = GAMES[g.game];
  const mult = g.mult || 1;
  const takerWon = raw[takerTeam] > raw[def]; // ties are a fall ("maty")

  let final = [0, 0];
  let diz = [0, 0];
  let outcome;

  if (g.mode === 'TA') {
    if (takerWon) {
      // 26 dz are shared from the rounded card points. The team holding the
      // dix de der is counted (rounded), the other team takes the remainder.
      const lastTeam = teamOf(g.lastTrick.winner);
      const counted = toDizaines(raw[lastTeam]) * mult;
      const other = 26 * mult - counted;
      diz[lastTeam] = counted / mult;
      diz[1 - lastTeam] = other / mult;
      final[lastTeam] = counted;
      final[1 - lastTeam] = other;
      outcome = 'contract';
    } else {
      final[def] = 26 * mult;
      outcome = 'maty';
    }
  } else if (takerWon) {
    final[takerTeam] = value * mult;
    diz[takerTeam] = value;
    outcome = 'contract';
  } else {
    final[def] = value * mult;
    diz[def] = value;
    outcome = 'maty';
  }

  g.scores[0] += final[0];
  g.scores[1] += final[1];
  g.lastResult = {
    outcome, raw, final, diz, value, mult,
    takerTeam, taker: g.taker, game: g.game, mode: g.mode, trump: g.trump,
    scores: g.scores.slice(),
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

/** Rough strength of `hand` for a given contract word. */
function evalGame(hand, game) {
  const mode = modeOf(game), trump = trumpOf(game);
  if (mode === 'TA') {
    let s = 0, j9 = 0;
    for (const c of hand) {
      const r = rankOf(c);
      if (r === 'J') { s += 24; j9++; }
      else if (r === '9') { s += 16; j9++; }
      else if (r === 'A') s += 10;
      else if (r === 'T') s += 7;
      else if (r === 'K') s += 4;
      else if (r === 'Q') s += 3;
    }
    if (j9 >= 3) s += 10;
    if (j9 >= 4) s += 12;
    return s;
  }
  if (mode === 'SA') {
    let s = 0, aces = 0;
    for (const c of hand) {
      const r = rankOf(c);
      if (r === 'A') { s += 12; aces++; }
      else if (r === 'T') s += 7;
      else if (r === 'K') s += 4;
      else if (r === 'Q') s += 3;
      else if (r === 'J') s += 2;
    }
    if (aces >= 3) s += 12;
    if (aces === 4) s += 8;
    return s;
  }
  return handStrength(hand, trump);
}

function aiBid(g, seat, difficulty = 'normal') {
  if (g.phase !== 'maka') return { type: 'bon' };
  const hand = g.hands[seat];
  const opening = g.bidSeat == null;
  const base = { easy: 26, normal: 22, hard: 18 }[difficulty] || 22;
  const need = (v) => base + (v - 16) * 0.9; // dearer contracts need stronger hands
  const margin = (game) => evalGame(hand, game) - need(GAMES[game]);

  if (opening) {
    // the first speaker MUST call: pick the game with the best margin
    let best = 'S', bestM = -Infinity;
    for (const game of ['S', 'H', 'D', 'TA', 'SA', 'C']) {
      const m = margin(game);
      if (m > bestM) { bestM = m; best = game; }
    }
    return { type: 'game', game: best };
  }

  const isPartner = seat === partnerOf(g.bidSeat);
  const allowed = ['S', 'H', 'D', 'C', 'TA', 'SA'].filter((game) =>
    GAMES[game] > g.bidValue && (!isPartner || game === 'TA' || game === 'SA'));
  if (!allowed.length) return { type: 'bon' };
  let best = null, bestM = -Infinity;
  for (const game of allowed) {
    const m = margin(game);
    if (m > bestM) { bestM = m; best = game; }
  }
  const raiseThresh = { easy: 14, normal: 8, hard: 4 }[difficulty] || 8;
  if (bestM >= raiseThresh) return { type: 'game', game: best };
  // opponents may contre a contract they think will fail
  if (!isPartner) {
    const contreThresh = { easy: 999, normal: 46, hard: 38 }[difficulty] || 46;
    if (evalGame(hand, g.bidGame) >= contreThresh) return { type: 'contre' };
  }
  return { type: 'bon' };
}

/** Surcontre decision: the taker's partner holds the last word (phase 'contre'). */
function aiContre(g, seat, difficulty = 'normal') {
  if (g.phase !== 'contre' || seat !== partnerOf(g.bidSeat)) return { type: 'bon' };
  const thresh = { easy: 999, normal: 62, hard: 50 }[difficulty] || 62;
  return evalGame(g.hands[seat], g.bidGame) >= thresh ? { type: 'surcontre' } : { type: 'bon' };
}

function aiPlay(g, seat, difficulty = 'normal') {
  const hand = g.hands[seat];
  const mode = g.mode, trump = g.trump;
  const legal = legalCards(hand, g.trick, mode, trump);
  if (legal.length === 1) return legal[0];
  if (difficulty === 'easy') return legal[(Math.random() * legal.length) | 0];

  const pts = (c) => cardPoints(c, mode, trump);
  const ord = (c) => cardOrder(c, mode, trump);
  const isT = (c) => isTrump(c, mode, trump);
  const trick = g.trick;

  if (!trick.length) {
    if (mode === 'SA') {
      // no trumps: cash aces and kings, else lowest cards
      const aces = legal.filter((c) => rankOf(c) === 'A');
      if (aces.length) return aces[0];
      const kings = legal.filter((c) => rankOf(c) === 'K');
      if (kings.length) return kings[0];
      return legal.reduce((a, b) => (pts(b) < pts(a) || (pts(b) === pts(a) && ord(b) < ord(a)) ? b : a));
    }
    const myTrumps = legal.filter(isT);
    const boss = myTrumps.find((c) => rankOf(c) === 'J') || myTrumps.find((c) => rankOf(c) === '9');
    if (boss && g.taker === seat && myTrumps.length >= 3) return boss;
    const aces = legal.filter((c) => rankOf(c) === 'A' && !isT(c));
    if (aces.length) return aces[0];
    const plains = legal.filter((c) => !isT(c));
    const pool = plains.length ? plains : legal;
    return pool.reduce((a, b) => (pts(b) < pts(a) || (pts(b) === pts(a) && ord(b) < ord(a)) ? b : a));
  }

  const wIdx = trickWinnerIndex(trick, mode, trump);
  const winnerSeat = trick[wIdx].seat;
  const partnerWinning = winnerSeat === partnerOf(seat);
  const potPoints = trick.reduce((a, t) => a + pts(t.card), 0);
  const last = trick.length === 3;

  const beats = (c) => {
    const sim = trick.concat([{ seat, card: c }]);
    return trickWinnerIndex(sim, mode, trump) === sim.length - 1;
  };
  const winners = legal.filter(beats);

  if (partnerWinning) {
    const safe = last || isT(trick[wIdx].card);
    const pool = safe ? legal : legal.filter((c) => pts(c) < 10);
    const source = pool.length ? pool : legal;
    return safe
      ? source.reduce((a, b) => (pts(b) > pts(a) ? b : a))
      : source.reduce((a, b) => (pts(b) < pts(a) || (pts(b) === pts(a) && ord(b) < ord(a)) ? b : a));
  }

  if (winners.length) {
    const cheap = winners.reduce((a, b) => (ord(b) < ord(a) ? b : a));
    if (last || potPoints >= 10 || !isT(cheap)) return cheap;
    if (difficulty === 'hard' && potPoints < 5 && isT(cheap) && trick.length < 3) {
      // don't burn trump on a worthless trick when others may still over-trump
      const junk = legal.filter((c) => !isT(c));
      if (junk.length) return junk.reduce((a, b) => (pts(b) < pts(a) ? b : a));
    }
    return cheap;
  }
  // can't win: dump the cheapest
  return legal.reduce((a, b) => (pts(b) < pts(a) || (pts(b) === pts(a) && ord(b) < ord(a)) ? b : a));
}

return {
  SUITS, RANKS, GAMES, makeDeck, cardPoints, cardOrder, suitOf, rankOf,
  teamOf, partnerOf, nextSeat, trickWinnerIndex, legalCards, sortHand,
  createGame, startRound, finalizeContract, applyBid, playCard, scoreRound,
  bonsNeeded, surcontreAllowed, modeOf, trumpOf,
  aiBid, aiContre, aiPlay, evalGame, handStrength, toDizaines, mulberry32, shuffle,
};
});
