'use strict';
const E = require('./engine');

const AI_NAMES = ['Margot', 'Lucien', 'Odette', 'Rémy', 'Colette', 'Bastien', 'Nadine', 'Émile'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const now = () => Date.now();

class Room {
  /**
   * @param {object} opts {code, mode:'solo'|'online', target, difficulty, hostId}
   */
  constructor(opts) {
    this.code = opts.code;
    this.mode = opts.mode || 'online';
    this.target = opts.target || 501;
    this.difficulty = opts.difficulty || 'normal';
    this.hostId = opts.hostId || null;
    this.createdAt = now();
    this.seats = [0, 1, 2, 3].map((i) => ({
      seat: i,
      type: 'ai',
      name: AI_NAMES[(i * 2 + ((Math.random() * 3) | 0)) % AI_NAMES.length],
      id: null,
      connected: false,
      ready: false,
    }));
    this.game = null;
    this.started = false;
    this.display = null;      // trick frozen on the table for the animation beat
    this.timer = null;
    this.fx = [];
    this.listeners = new Set(); // (room) => void  — invoked after every mutation
    this.paused = false;
    this.dead = false;
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this); }

  humans() { return this.seats.filter((s) => s.type === 'human'); }
  humanCount() { return this.humans().length; }
  connectedCount() { return this.seats.filter((s) => s.type === 'human' && s.connected).length; }

  seatOf(playerId) {
    const s = this.seats.find((x) => x.id === playerId);
    return s ? s.seat : -1;
  }

  addPlayer(playerId, name, preferredSeat = null) {
    const existing = this.seats.find((s) => s.id === playerId);
    if (existing) { existing.connected = true; if (name) existing.name = name; return existing.seat; }
    let target = null;
    if (preferredSeat != null && this.seats[preferredSeat] && this.seats[preferredSeat].type === 'ai') {
      target = this.seats[preferredSeat];
    } else {
      target = this.seats.find((s) => s.type === 'ai');
    }
    if (!target) return -1;
    target.type = 'human';
    target.id = playerId;
    target.name = name || 'Player';
    target.connected = true;
    target.ready = false;
    if (!this.hostId) this.hostId = playerId;
    this.emit();
    return target.seat;
  }

  disconnect(playerId) {
    const s = this.seats.find((x) => x.id === playerId);
    if (!s) return;
    s.connected = false;
    if (!this.started) {
      // free the seat again in the lobby
      s.type = 'ai';
      s.id = null;
      s.name = AI_NAMES[(s.seat * 3 + 1) % AI_NAMES.length];
      if (this.hostId === playerId) {
        const next = this.humans()[0];
        this.hostId = next ? next.id : null;
      }
    }
    this.emit();
    this.schedule();
  }

  /** Seats with no connected human are driven by the AI. */
  isBotSeat(seat) {
    const s = this.seats[seat];
    return s.type === 'ai' || !s.connected;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.game = E.createGame({ target: this.target });
    E.startRound(this.game);
    this.fx.push({ t: 'deal' });
    this.emit();
    this.schedule(650);
  }

  nextRound() {
    if (!this.game) return;
    this._awaitingNext = false;
    if (this.game.phase !== 'roundEnd') return;
    E.startRound(this.game);
    this.display = null;
    this.fx.push({ t: 'deal' });
    this.emit();
    this.schedule(650);
  }

  restart() {
    this.game = E.createGame({ target: this.target });
    E.startRound(this.game);
    this.display = null;
    this.fx.push({ t: 'deal' });
    this.emit();
    this.schedule(650);
  }

  setPaused(v) {
    // Pausing only exists in solo play; online tables keep running.
    if (this.mode !== 'solo') return;
    this.paused = v;
    if (!v) this.schedule(300);
    this.emit();
  }

  // ───────────────────────────────────────────────────────── actions ──
  bid(playerId, action) {
    const seat = this.seatOf(playerId);
    if (seat < 0 || !this.game) return { ok: false, err: 'not seated' };
    return this.applyBid(seat, action);
  }

  applyBid(seat, action) {
    const g = this.game;
    const r = E.applyBid(g, seat, action);
    if (!r.ok) return r;
    if (action.type === 'pass') this.fx.push({ t: 'pass', seat });
    else this.fx.push({ t: 'take', seat, suit: g.trump });
    if (r.event === 'redeal') {
      this.fx.push({ t: 'redeal' });
      E.startRound(g);
      this.fx.push({ t: 'deal' });
    }
    this.emit();
    this.schedule(r.event === 'taken' ? 700 : 380);
    return r;
  }

  play(playerId, cardId) {
    const seat = this.seatOf(playerId);
    if (seat < 0 || !this.game) return { ok: false, err: 'not seated' };
    return this.applyPlay(seat, cardId);
  }

  applyPlay(seat, cardId) {
    const g = this.game;
    if (this.display) return { ok: false, err: 'resolving' };
    const r = E.playCard(g, seat, cardId);
    if (!r.ok) return r;
    this.fx.push({ t: 'play', seat, card: cardId });
    let delay = 520;
    for (const ev of r.events || []) {
      if (ev.type === 'belote') this.fx.push({ t: 'belote', seat: ev.seat, n: ev.n });
      if (ev.type === 'trick') {
        this.display = { trick: ev.cards, winner: ev.winner, points: ev.points };
        this.fx.push({ t: 'trick', winner: ev.winner, points: ev.points });
        delay = 1050;
      }
      if (ev.type === 'roundEnd') {
        this.fx.push({ t: 'roundEnd' });
        delay = 1250;
      }
    }
    this.emit();
    this.schedule(delay);
    return r;
  }

  // ────────────────────────────────────────────────────── the driver ──
  schedule(ms = 500) {
    if (this.timer) clearTimeout(this.timer);
    if (this.dead) return;
    this.timer = setTimeout(() => { this.timer = null; this.tick(); }, ms);
  }

  tick() {
    if (this.dead || !this.game || this.paused) return;
    const g = this.game;

    if (this.display) {
      this.display = null;
      this.emit();
      this.schedule(g.phase === 'play' ? 260 : 700);
      return;
    }
    if (g.phase === 'roundEnd') {
      // online tables roll on automatically; solo waits for the player to hit "next"
      if (this.mode === 'solo') return;
      if (!this._awaitingNext) { this._awaitingNext = true; this.schedule(4500); return; }
      this._awaitingNext = false;
      this.nextRound();
      return;
    }
    if (g.phase === 'gameOver') return;

    const seat = g.turn;
    if (!this.isBotSeat(seat)) return; // waiting on a human

    const diff = this.seats[seat].type === 'ai' ? this.difficulty : 'normal';
    if (g.phase === 'bid1' || g.phase === 'bid2') {
      this.applyBid(seat, E.aiBid(g, seat, diff));
    } else if (g.phase === 'play') {
      const c = E.aiPlay(g, seat, diff);
      this.applyPlay(seat, c);
    }
  }

  // ─────────────────────────────────────────────────── serialization ──
  view(playerId) {
    const you = this.seatOf(playerId);
    const g = this.game;
    const base = {
      type: 'state',
      you,
      isHost: this.hostId === playerId,
      room: {
        code: this.code,
        mode: this.mode,
        target: this.target,
        difficulty: this.difficulty,
        started: this.started,
        paused: this.paused,
        humans: this.humanCount(),
        seats: this.seats.map((s) => ({
          seat: s.seat, name: s.name, type: s.type, connected: s.connected,
        })),
      },
      fx: this.fx.slice(),
    };
    if (!g) return base;

    const trick = this.display ? this.display.trick : g.trick;
    const hand = you >= 0 ? g.hands[you].slice() : [];
    let legal = [];
    if (you >= 0 && g.phase === 'play' && g.turn === you && !this.display) {
      legal = E.legalCards(hand, g.trick, g.trump);
    }
    base.g = {
      phase: g.phase,
      turn: this.display ? -1 : g.turn,
      dealer: g.dealer,
      trump: g.trump,
      taker: g.taker,
      upcard: g.phase === 'bid1' || g.phase === 'bid2' ? g.upcard : null,
      scores: g.scores.slice(),
      roundPoints: g.roundPoints.slice(),
      roundNo: g.roundNo,
      target: g.target,
      trick,
      trickWinner: this.display ? this.display.winner : -1,
      counts: g.hands.map((h) => h.length),
      tricks: [g.tricksWon[0].length, g.tricksWon[1].length],
      hand,
      legal,
      belote: g.belote,
      lastResult: g.lastResult,
      winner: g.winner,
      canBid: you >= 0 && (g.phase === 'bid1' || g.phase === 'bid2') && g.turn === you,
      bidSuitTaken: g.upcard ? g.upcard[1] : null,
    };
    return base;
  }

  flushFx() { this.fx = []; }

  destroy() {
    this.dead = true;
    if (this.timer) clearTimeout(this.timer);
    this.listeners.clear();
  }
}

class RoomManager {
  constructor() {
    this.rooms = new Map();
    setInterval(() => this.sweep(), 60_000).unref?.();
  }
  makeCode() {
    let code;
    do {
      code = Array.from({ length: 4 }, () => CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]).join('');
    } while (this.rooms.has(code));
    return code;
  }
  create(opts = {}) {
    const code = opts.code && !this.rooms.has(opts.code) ? opts.code : this.makeCode();
    const room = new Room({ ...opts, code });
    this.rooms.set(code, room);
    return room;
  }
  get(code) { return this.rooms.get((code || '').toUpperCase()); }
  sweep() {
    for (const [code, r] of this.rooms) {
      const idle = now() - r.createdAt > 30 * 60_000;
      if ((r.connectedCount() === 0 && (idle || now() - (r.emptySince || (r.emptySince = now())) > 5 * 60_000)) || r.dead) {
        r.destroy();
        this.rooms.delete(code);
      }
      if (r.connectedCount() > 0) r.emptySince = null;
    }
  }
  list() {
    return [...this.rooms.values()]
      .filter((r) => r.mode === 'online' && !r.started && r.humanCount() < 4)
      .map((r) => ({ code: r.code, humans: r.humanCount(), target: r.target }));
  }
}

module.exports = { Room, RoomManager };
