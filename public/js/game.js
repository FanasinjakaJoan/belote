/* ══════════════════════════════════════════════════════════════════════
   Belote Royale — client controller
   ══════════════════════════════════════════════════════════════════════ */
(function (w) {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const DIRS = ['s', 'w', 'n', 'e'];
  const SUIT_NAME = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
  const isTouch = !matchMedia('(hover: hover)').matches;

  let S = null;            // latest server view
  let prev = null;         // previous view (for diffs)
  let myId = null;
  let cursor = 0;          // keyboard selection index in hand
  let selected = null;     // card id lifted on touch
  let handEls = new Map(); // card -> element
  let trickEls = new Map();// dir -> element
  let overlay = 'start';
  let lastScores = [0, 0];
  let scoreSaved = false;
  let bidCursor = 0;
  let pending = null;      // card sent to the server, awaiting confirmation

  // ─────────────────────────────────────────────────── screens ──
  const SCREENS = ['start', 'joinScreen', 'lobby', 'pause', 'roundEnd', 'gameOver', 'how'];
  function show(id) {
    overlay = id;
    SCREENS.forEach((s) => $('#' + s).classList.toggle('active', s === id));
    if (id) SFX.ui();
  }
  function hideAll() { overlay = null; SCREENS.forEach((s) => $('#' + s).classList.remove('active')); }

  function toast(msg, good) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('good', !!good);
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), 1500);
  }
  function banner(txt) {
    const b = $('#turnBanner');
    b.textContent = txt;
    b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
  }
  const centerOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const relDir = (seat) => DIRS[(seat - S.you + 4) % 4];

  // ─────────────────────────────────────────────────── boot ──
  function boot() {
    const st = Store.settings;
    $('#inpName').value = st.name || '';
    $('#selTarget').value = st.target;
    $('#selDiff').value = st.difficulty;
    SFX.enabled = st.sound !== false;
    $('#btnSound').classList.toggle('off', !SFX.enabled);
    renderHighscores();

    // stable identity so a refresh / dropped socket can reclaim the same seat
    let myPid = null;
    try { myPid = localStorage.getItem('belote.pid'); } catch {}
    if (!myPid) {
      myPid = 'p-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { localStorage.setItem('belote.pid', myPid); } catch {}
    }
    myId = myPid;
    Net.on('open', () => {
      Net.send('identify', { pid: myPid });
      const back = sessionStorage.getItem('belote.room');
      if (back) Net.send('join', { code: back });
    });
    Net.on('joined', (m) => {
      if (m.mode === 'solo') { sessionStorage.removeItem('belote.room'); hideAll(); }
      else {
        sessionStorage.setItem('belote.room', m.code);
        $('#lobbyCode').textContent = m.code;
        show('lobby');
      }
    });
    Net.on('chat', (m) => {
      if (!S || S.you < 0 || m.seat < 0) return;
      bubble(m.seat, m.text);
      SFX.ui();
    });
    Net.on('state', onState);
    Net.on('error', (m) => {
      toast(m.err); SFX.error();
      if (/No table|full|solo/.test(m.err)) {
        sessionStorage.removeItem('belote.room');
        if (!S || !S.room || !S.room.started) show('start');
      }
    });
    Net.on('nope', (m) => { toast(m.err === 'illegal card' ? 'You must follow suit!' : m.err); SFX.error(); FX.shake(5, 7); });
    Net.on('close', () => { });
    Net.connect();

    wireMenu();
    wireKeys();
  }

  // ─────────────────────────────────────────────────── menu ──
  function pushName() {
    const n = ($('#inpName').value || '').trim().slice(0, 14);
    Store.settings.name = n; Store.save();
    Net.send('name', { name: n || 'You' });
  }
  function opts() {
    const target = +$('#selTarget').value, difficulty = $('#selDiff').value;
    Store.settings.target = target; Store.settings.difficulty = difficulty; Store.save();
    return { target, difficulty };
  }

  function wireMenu() {
    $('#btnSolo').onclick = () => { SFX.unlock(); pushName(); scoreSaved = false; Net.send('solo', opts()); };
    $('#btnCreate').onclick = () => { SFX.unlock(); pushName(); scoreSaved = false; Net.send('create', opts()); };
    $('#btnJoin').onclick = () => { SFX.unlock(); pushName(); show('joinScreen'); refreshRooms(); };
    $('#btnHow').onclick = () => show('how');
    $$('[data-back]').forEach((b) => (b.onclick = () => { if (S && S.room.started) hideAll(); else { Net.send('leave'); show('start'); } }));
    $('#btnJoinGo').onclick = () => {
      const code = ($('#inpCode').value || '').trim().toUpperCase();
      if (code.length !== 4) return toast('Enter a 4-letter code');
      Net.send('join', { code });
    };
    $('#btnQuick').onclick = () => Net.send('quick', {});
    $('#inpCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btnJoinGo').click(); });
    $('#btnStartGame').onclick = () => Net.send('startGame', {});
    $('#btnCopy').onclick = async () => {
      try { await navigator.clipboard.writeText($('#lobbyCode').textContent); toast('Code copied', true); }
      catch { toast('Code: ' + $('#lobbyCode').textContent, true); }
    };
    $('#btnMenu').onclick = () => togglePause();
    $('#btnSound').onclick = () => {
      SFX.enabled = !SFX.enabled;
      Store.settings.sound = SFX.enabled; Store.save();
      $('#btnSound').classList.toggle('off', !SFX.enabled);
      if (SFX.enabled) SFX.ui();
    };
    $('#btnEmote').onclick = () => $('#emotes').classList.toggle('show');
    $$('#emotes button').forEach((b) => (b.onclick = () => {
      Net.send('chat', { text: b.textContent + ' ' + b.dataset.e });
      $('#emotes').classList.remove('show');
    }));
    $('#btnResume').onclick = () => togglePause(false);
    $('#btnRestart').onclick = () => { scoreSaved = false; Net.send('restart', {}); hideAll(); Net.send('pause', { value: false }); };
    $('#btnQuit').onclick = () => { Net.send('leave'); S = null; prev = null; show('start'); renderHighscores(); };
    $('#btnMenu2').onclick = () => { Net.send('leave'); S = null; prev = null; show('start'); renderHighscores(); };
    $('#btnNextRound').onclick = () => { hideAll(); Net.send('nextRound', {}); };
    $('#btnAgain').onclick = () => { scoreSaved = false; hideAll(); Net.send('restart', {}); };
  }

  async function refreshRooms() {
    const box = $('#roomList');
    box.innerHTML = '<div class="room-row" style="opacity:.5">Looking for open tables…</div>';
    try {
      const r = await fetch('/api/rooms').then((x) => x.json());
      if (!r.rooms.length) { box.innerHTML = '<div class="room-row" style="opacity:.5;cursor:default">No open tables — create one!</div>'; return; }
      box.innerHTML = '';
      r.rooms.forEach((rm) => {
        const d = document.createElement('div');
        d.className = 'room-row';
        d.innerHTML = '<b>' + rm.code + '</b><span>' + rm.humans + '/4 players · to ' + rm.target + '</span>';
        d.onclick = () => Net.send('join', { code: rm.code });
        box.appendChild(d);
      });
    } catch { box.innerHTML = ''; }
  }

  function togglePause(force) {
    if (!S || !S.room.started) { if (overlay === 'start') return; show('start'); return; }
    const to = force != null ? force : overlay !== 'pause';
    if (to) { Net.send('pause', { value: true }); show('pause'); }
    else { Net.send('pause', { value: false }); hideAll(); }
  }

  // ─────────────────────────────────────────────────── state ──
  function onState(m) {
    prev = S; S = m;
    if (pending && (!m.g || !(m.g.hand || []).includes(pending))) pending = null;
    if (!S.room.started) {
      if (S.room.mode === 'online') renderLobby();
      return;
    }
    if (overlay === 'lobby') hideAll();
    $('#btnEmote').hidden = S.room.mode === 'solo';
    if (S.room.mode !== 'solo') $('#pause').querySelector('h2').textContent = 'Menu';
    render();
    (S.fx || []).forEach(handleFx);
    if (S.g) checkPhase();
  }

  function renderLobby() {
    $('#lobbyCode').textContent = S.room.code;
    const box = $('#lobbySeats');
    box.innerHTML = '';
    S.room.seats.forEach((s) => {
      const d = document.createElement('div');
      const you = s.seat === S.you;
      d.className = 'lseat' + (you ? ' you' : '') + (s.type === 'ai' ? ' ai' : '');
      d.innerHTML = '<span class="dot"></span><b>' + esc(s.name) + '</b>' +
        '<span class="tag">' + (s.type === 'ai' ? 'AI' : you ? 'YOU' : 'PLAYER') +
        ' · ' + (s.seat % 2 === S.you % 2 ? 'team A' : 'team B') + '</span>';
      box.appendChild(d);
    });
    $('#btnStartGame').style.display = S.isHost ? '' : 'none';
    if (overlay !== 'lobby') show('lobby');
  }

  function checkPhase() {
    const g = S.g, pg = prev && prev.g;
    if (g.phase === 'gameOver') { if (overlay !== 'gameOver') showGameOver(); return; }
    if (g.phase === 'roundEnd') { if (overlay !== 'roundEnd') showRoundEnd(); return; }
    if ((overlay === 'roundEnd' || overlay === 'gameOver') && g.phase !== 'roundEnd') hideAll();
    if (S.room.paused && overlay !== 'pause') show('pause');

    if (g.turn === S.you && (!pg || pg.turn !== S.you)) {
      if (g.phase === 'play') banner('Your turn');
      SFX.select();
    }
  }

  // ─────────────────────────────────────────────────── render ──
  function render() {
    const g = S.g;
    if (!g) return;
    renderScores(g);
    renderSeats(g);
    renderTrick(g);
    renderHand(g);
    renderBid(g);

    const tb = $('#trumpSuit');
    const glyph = g.trump ? Cards.glyph(g.trump) : '—';
    if (tb.textContent !== glyph) {
      tb.textContent = glyph;
      tb.classList.toggle('red', g.trump === 'H' || g.trump === 'D');
      if (g.trump) { $('#trumpBadge').classList.remove('pulse'); void $('#trumpBadge').offsetWidth; $('#trumpBadge').classList.add('pulse'); }
    }
    $('#roundNo').textContent = g.roundNo;
    $('#targetVal').textContent = g.target;
  }

  function renderScores(g) {
    const mine = S.you % 2, theirs = 1 - mine;
    const us = g.scores[mine], them = g.scores[theirs];
    if (us !== lastScores[0]) bumpScore($('#scoreUs'), $('#teamUs'), us);
    if (them !== lastScores[1]) bumpScore($('#scoreThem'), $('#teamThem'), them);
    lastScores = [us, them];
  }
  function bumpScore(el, wrap, to) {
    const from = +el.textContent || 0;
    wrap.classList.remove('bump'); void wrap.offsetWidth; wrap.classList.add('bump');
    const t0 = performance.now(), dur = 520;
    (function step(t) {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }

  function renderSeats(g) {
    S.room.seats.forEach((p) => {
      const dir = relDir(p.seat);
      const el = $('#seat-' + dir);
      $('.pname', el).textContent = p.seat === S.you ? (p.name === 'Player' ? 'You' : p.name + ' (you)') : p.name;
      $('.cards-left', el).textContent = g.counts[p.seat];
      el.classList.toggle('active', g.turn === p.seat);
      el.classList.toggle('taker', g.taker === p.seat);
      el.classList.toggle('dc', p.type === 'human' && !p.connected);
      el.classList.toggle('partner', p.seat % 2 === S.you % 2 && p.seat !== S.you);
      el.classList.toggle('foe', p.seat % 2 !== S.you % 2);
      const av = $('.ava-glyph', el);
      av.textContent = p.type === 'ai' ? '🤖' : ['♠', '♥', '♦', '♣'][p.seat];
    });
    // opponent card backs
    ['n', 'w', 'e'].forEach((dir) => {
      const seat = (S.you + DIRS.indexOf(dir)) % 4;
      const box = $('#opp-' + dir);
      const n = g.counts[seat];
      while (box.children.length > n) box.removeChild(box.lastChild);
      while (box.children.length < n) {
        const d = document.createElement('div');
        d.className = 'mini';
        d.style.animationDelay = (box.children.length * 40) + 'ms';
        box.appendChild(d);
      }
    });
  }

  function renderTrick(g) {
    const box = $('#trick');
    const want = new Map();
    (g.trick || []).forEach((t) => want.set(relDir(t.seat), t.card));
    box.classList.toggle('busy', want.size > 0);

    // remove departed cards (sweep towards the winner)
    for (const [dir, el] of [...trickEls]) {
      if (want.get(dir) === el.dataset.card) continue;
      const wdir = prev && prev.g && prev.g.trickWinner >= 0 ? relDir(prev.g.trickWinner) : null;
      sweepOut(el, wdir);
      trickEls.delete(dir);
    }
    // add new
    for (const [dir, card] of want) {
      if (trickEls.has(dir)) continue;
      const slot = $('.slot-' + dir, box);
      const el = Cards.el(card, g.trump);
      slot.appendChild(el);
      trickEls.set(dir, el);
    }
    // winner highlight
    $$('.slot', box).forEach((s) => s.classList.remove('win'));
    if (g.trickWinner >= 0) {
      const s = $('.slot-' + relDir(g.trickWinner), box);
      if (s) s.classList.add('win');
    }
  }

  function sweepOut(el, wdir) {
    const off = { s: [0, 260], n: [0, -260], w: [-320, 0], e: [320, 0] }[wdir || 'n'];
    el.style.transition = 'transform .40s cubic-bezier(.5,0,.75,0), opacity .40s';
    el.style.transform = 'translate(' + off[0] + 'px,' + off[1] + 'px) scale(.7) rotate(' + (off[0] > 0 ? 25 : -25) + 'deg)';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 420);
  }

  function renderHand(g) {
    const box = $('#hand');
    const hand = g.hand || [];
    const legal = new Set(g.legal || []);
    const canPlay = g.phase === 'play' && g.turn === S.you;

    for (const [card, el] of [...handEls]) {
      if (!hand.includes(card)) {
        el.classList.add('gone');
        setTimeout(() => el.remove(), 260);
        handEls.delete(card);
      }
    }
    const fresh = [];
    hand.forEach((card, i) => {
      let el = handEls.get(card);
      if (!el) {
        el = Cards.el(card, g.trump);
        el.tabIndex = 0;
        el.addEventListener('pointerdown', (e) => { e.preventDefault(); onCardTap(card); });
        handEls.set(card, el);
        fresh.push(el);
      }
      el.classList.toggle('trump-card', !!g.trump && card[1] === g.trump);
      el.classList.toggle('playable', canPlay && legal.has(card));
      el.classList.toggle('dead', canPlay && !legal.has(card));
      if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null);
    });
    // fan geometry
    const n = hand.length, mid = (n - 1) / 2;
    hand.forEach((card, i) => {
      const el = handEls.get(card);
      if (!el) return;
      const d = i - mid;
      el.style.setProperty('--rot', (d * (n > 6 ? 3.2 : 4.2)).toFixed(2) + 'deg');
      el.style.setProperty('--arc', (Math.abs(d) * Math.abs(d) * 1.5).toFixed(1) + 'px');
      el.style.zIndex = String(10 + i);
    });
    if (fresh.length) {
      fresh.forEach((el, i) => {
        el.classList.add('dealt');
        el.style.animationDelay = (i * 55) + 'ms';
        setTimeout(() => { el.classList.remove('dealt'); el.style.animationDelay = ''; }, 500 + i * 55);
      });
    }
    if (cursor >= hand.length) cursor = Math.max(0, hand.length - 1);
    paintCursor();
  }

  function paintCursor() {
    if (!S || !S.g) return;
    const hand = S.g.hand || [];
    const want = selected || hand[cursor];
    handEls.forEach((el, card) => {
      const on = card === want && isMyTurn();
      el.classList.toggle('sel', on);
      el.style.zIndex = on ? '100' : String(10 + hand.indexOf(card));
    });
  }
  const isMyTurn = () => S && S.g && S.g.phase === 'play' && S.g.turn === S.you;

  function onCardTap(card) {
    if (pending) return;
    if (!isMyTurn()) { toast(S.g.phase === 'play' ? 'Not your turn' : 'Bidding in progress'); SFX.error(); return; }
    const legal = new Set(S.g.legal || []);
    if (!legal.has(card)) { toast('You must follow suit!'); SFX.error(); FX.shake(4, 6); return; }
    if (isTouch && selected !== card) {
      selected = card;
      cursor = S.g.hand.indexOf(card);
      SFX.select();
      paintCursor();
      return;
    }
    playCard(card);
  }

  function playCard(card) {
    if (pending) return;
    pending = card;
    setTimeout(() => { if (pending === card) pending = null; }, 2500);
    const el = handEls.get(card);
    if (el) flyToTable(el, card);
    selected = null;
    Net.send('play', { card });
    SFX.card();
  }

  function flyToTable(el, card) {
    const from = el.getBoundingClientRect();
    const slot = $('.slot-s');
    const to = slot.getBoundingClientRect();
    const clone = el.cloneNode(true);
    clone.className = 'card flying' + (Cards.isRed(card) ? ' red' : '');
    clone.style.cssText += 'left:' + from.left + 'px;top:' + from.top + 'px;width:' + from.width + 'px;height:' + from.height + 'px;';
    document.body.appendChild(clone);
    el.style.visibility = 'hidden';
    requestAnimationFrame(() => {
      clone.style.transform = 'translate(' + (to.left - from.left) + 'px,' + (to.top - from.top) + 'px) rotate(' + (Math.random() * 10 - 5) + 'deg)';
    });
    FX.trail(from.left + from.width / 2, from.top, to.left + to.width / 2, to.top + to.height / 2);
    setTimeout(() => clone.remove(), 360);
  }

  // ─────────────────────────────────────────────────── bidding ──
  function renderBid(g) {
    const panel = $('#bidPanel');
    const on = !!g.canBid;
    panel.classList.toggle('show', on);
    if (!on) { panel.dataset.sig = ''; return; }
    const sig = g.phase + g.upcard + g.roundNo;
    if (panel.dataset.sig === sig) return;
    panel.dataset.sig = sig;
    bidCursor = 0;

    $('#bidTitle').textContent = g.phase === 'bid1'
      ? 'Take ' + Cards.name(g.upcard) + ' as trump?'
      : 'Name a trump suit?';
    const holder = $('#upcardHolder');
    holder.innerHTML = '';
    holder.appendChild(Cards.el(g.upcard, g.upcard[1]));

    const acts = $('#bidActions');
    acts.innerHTML = '';
    if (g.phase === 'bid1') {
      acts.appendChild(mkBid('Take', 'take', () => sendBid({ type: 'take' })));
      acts.appendChild(mkBid('Pass', '', () => sendBid({ type: 'pass' })));
      $('#bidHint').textContent = 'Y take · N pass';
    } else {
      ['S', 'H', 'D', 'C'].filter((s) => s !== g.bidSuitTaken).forEach((s) => {
        const b = mkBid(Cards.glyph(s), 'suit' + (s === 'H' || s === 'D' ? ' red' : ''), () => sendBid({ type: 'takeSuit', suit: s }));
        b.title = SUIT_NAME[s];
        acts.appendChild(b);
      });
      acts.appendChild(mkBid('Pass', '', () => sendBid({ type: 'pass' })));
      $('#bidHint').textContent = 'S H D C · N pass';
    }
    paintBidCursor();
  }
  function mkBid(label, cls, fn) {
    const b = document.createElement('button');
    b.className = 'bid-btn ' + cls;
    b.textContent = label;
    b.onclick = fn;
    return b;
  }
  function paintBidCursor() {
    const btns = $$('#bidActions .bid-btn');
    btns.forEach((b, i) => b.classList.toggle('on', i === bidCursor));
  }
  let bidLock = 0;
  function sendBid(action) {
    if (Date.now() - bidLock < 500) return;
    bidLock = Date.now();
    Net.send('bid', { action });
    if (action.type === 'pass') SFX.pass(); else SFX.take();
    $('#bidPanel').classList.remove('show');
  }

  // ─────────────────────────────────────────────────── fx events ──
  function handleFx(ev) {
    switch (ev.t) {
      case 'deal': {
        SFX.deal();
        break;
      }
      case 'pass': {
        bubble(ev.seat, 'PASS', true);
        break;
      }
      case 'take': {
        bubble(ev.seat, 'TAKE ' + Cards.glyph(ev.suit));
        const c = centerOf($('#seat-' + relDir(ev.seat)));
        FX.suitPop(c.x, c.y, Cards.glyph(ev.suit));
        FX.shake(4, 7);
        if (ev.seat !== S.you) SFX.take();
        break;
      }
      case 'play': {
        if (ev.seat === S.you) break;
        const from = centerOf($('#seat-' + relDir(ev.seat)));
        const slot = $('.slot-' + relDir(ev.seat));
        const to = centerOf(slot);
        FX.trail(from.x, from.y, to.x, to.y, ['#e8c37a', '#ffffff']);
        SFX.card();
        break;
      }
      case 'belote': {
        bubble(ev.seat, ev.n === 1 ? 'BELOTE!' : 'REBELOTE! +20');
        const c = centerOf($('#seat-' + relDir(ev.seat)));
        FX.burst(c.x, c.y, { n: 30, glyphs: ['♥', '♦', '♠', '♣'], speedMax: 7, lifeMax: 70, fade: true });
        SFX.belote();
        FX.shake(6, 9);
        break;
      }
      case 'trick': {
        const won = ev.winner % 2 === S.you % 2;
        const slot = $('.slot-' + relDir(ev.winner));
        const c = centerOf($('#trick'));
        FX.burst(c.x, c.y, {
          n: won ? 30 : 14,
          colors: won ? ['#5fd6a8', '#e8c37a', '#fff0cd'] : ['#ff8b6b', '#8a5a4a'],
          speedMax: won ? 7.5 : 4, lifeMax: 55, ringSize: won ? 90 : 50,
        });
        flashPoints((won ? '+' : '−') + ev.points, won);
        FX.shake(won ? 7 : 4, 9);
        SFX.trick(won);
        if (slot) slot.classList.add('win');
        break;
      }
      case 'roundEnd': SFX.round(); break;
      case 'redeal': toast('Everyone passed — redeal'); break;
    }
  }

  function bubble(seat, text, isPass) {
    const el = $('.bubble', $('#seat-' + relDir(seat)));
    el.textContent = text;
    el.classList.toggle('pass', !!isPass);
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 1400);
  }
  function flashPoints(txt, good) {
    const f = $('#pointsFlash');
    f.textContent = txt;
    f.style.color = good ? '#9dfbd0' : '#ffb3a0';
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  }

  // ─────────────────────────────────────────────────── results ──
  function showRoundEnd() {
    const g = S.g, r = g.lastResult;
    if (!r) return;
    const mine = S.you % 2;
    const weTook = r.takerTeam === mine;
    const gained = r.final[mine], lost = r.final[1 - mine];
    const good = gained > lost;
    $('#reTitle').textContent = ({
      capot: 'CAPOT!', 'capot-defense': 'CAPOT — defence!',
      contract: 'Contract made', dedans: 'DEDANS!',
    })[r.outcome] || 'Round over';
    $('#reBody').innerHTML =
      '<div style="text-align:center"><span class="res-tag ' + (good ? 'win' : 'lose') + '">' +
      (weTook ? 'YOUR TEAM TOOK ' : 'RIVALS TOOK ') + Cards.glyph(r.trump) + '</span></div>' +
      line('Card points', r.raw[mine] + ' — ' + r.raw[1 - mine]) +
      line('Tricks', r.tricks[mine] + ' — ' + r.tricks[1 - mine]) +
      (r.belote != null ? line('Belote & Rebelote', (r.belote === mine ? 'your team' : 'rivals') + ' +20') : '') +
      line('Round score', '<b style="color:var(--us)">+' + gained + '</b> — <b style="color:var(--them)">+' + lost + '</b>', true) +
      line('Match', '<b>' + g.scores[mine] + '</b> — <b>' + g.scores[1 - mine] + '</b> (to ' + g.target + ')', true);
    show('roundEnd');
    if (r.outcome === 'capot' || r.outcome === 'capot-defense') { FX.confetti(90); FX.shake(14, 16); }
    if (good) { FX.confetti(50); SFX.round(); } else SFX.pass();
    $('#btnNextRound').style.display = S.room.mode === 'solo' ? '' : 'none';
  }
  const line = (a, b, big) => '<div class="res-line' + (big ? ' big' : '') + '"><span>' + a + '</span><span>' + b + '</span></div>';

  function showGameOver() {
    const g = S.g;
    const mine = S.you % 2;
    const won = g.winner === mine;
    $('#goTitle').textContent = won ? 'VICTORY!' : 'Defeat';
    $('#goBody').innerHTML =
      '<div style="text-align:center"><span class="res-tag ' + (won ? 'win' : 'lose') + '">' +
      (won ? 'YOUR TEAM WINS' : 'RIVALS WIN') + '</span></div>' +
      line('Final score', '<b style="color:var(--us)">' + g.scores[mine] + '</b> — <b style="color:var(--them)">' + g.scores[1 - mine] + '</b>', true) +
      line('Rounds played', g.roundNo) +
      line('Target', g.target) +
      line('Table', S.room.mode === 'solo' ? 'Solo vs AI (' + S.room.difficulty + ')' : 'Online · ' + S.room.humans + ' humans');
    if (!scoreSaved) {
      scoreSaved = true;
      Store.addScore({
        score: g.scores[mine], opp: g.scores[1 - mine], rounds: g.roundNo,
        target: g.target, difficulty: S.room.difficulty, won: won ? 1 : 0,
        mode: S.room.mode,
      });
    }
    renderHighscores();
    show('gameOver');
    if (won) { FX.confetti(180); FX.shake(16, 18); SFX.win(); }
    else { FX.shake(9, 12); SFX.lose(); }
  }

  function renderHighscores() {
    const rows = Store.highscores();
    const html = rows.length
      ? rows.map((r, i) =>
        '<tr><td class="hs-rank">' + (i + 1) + '</td>' +
        '<td>' + (r.won ? '🏆' : '·') + ' ' + (r.mode === 'solo' ? (r.difficulty || 'ai') : 'online') + '</td>' +
        '<td style="opacity:.6">' + r.rounds + ' rd · to ' + r.target + '</td>' +
        '<td class="hs-score">' + r.score + '<span style="opacity:.45">–' + r.opp + '</span></td></tr>').join('')
      : '<tr><td class="empty">No games yet — win one!</td></tr>';
    $('#hsTable').innerHTML = '<tbody>' + html + '</tbody>';
    const t2 = $('#hsTable2'); if (t2) t2.innerHTML = '<tbody>' + html + '</tbody>';
  }

  // ─────────────────────────────────────────────────── keyboard ──
  function wireKeys() {
    addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select') {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      const k = e.key.toLowerCase();

      if (overlay === 'start') {
        if (k === '1') return $('#btnSolo').click();
        if (k === '2') return $('#btnCreate').click();
        if (k === '3') return $('#btnJoin').click();
        if (k === '4') return $('#btnHow').click();
        return;
      }
      if (overlay === 'how' || overlay === 'joinScreen') {
        if (k === 'escape') return show('start');
        return;
      }
      if (overlay === 'lobby') { if (k === 'enter' && S && S.isHost) $('#btnStartGame').click(); return; }
      if (overlay === 'roundEnd') { if (k === 'enter' || k === ' ') $('#btnNextRound').click(); return; }
      if (overlay === 'gameOver') {
        if (k === 'r' || k === 'enter') $('#btnAgain').click();
        if (k === 'escape') $('#btnMenu2').click();
        return;
      }
      if (overlay === 'pause') {
        if (k === 'escape' || k === 'p') { e.preventDefault(); togglePause(false); }
        if (k === 'r') $('#btnRestart').click();
        return;
      }

      // in-game
      if (k === 'escape' || k === 'p') { e.preventDefault(); return togglePause(true); }
      if (k === 'm') return $('#btnSound').click();
      if (!S || !S.g) return;

      if (S.g.canBid) {
        const btns = $$('#bidActions .bid-btn');
        if (k === 'y' || k === 't') { const b = btns.find((x) => x.classList.contains('take')); if (b) return b.click(); }
        if (k === 'n') { const b = btns.find((x) => x.textContent === 'Pass'); if (b) return b.click(); }
        if (S.g.phase === 'bid2' && 'shdc'.includes(k)) {
          const glyph = Cards.glyph(k.toUpperCase());
          const b = btns.find((x) => x.textContent === glyph);
          if (b) return b.click();
        }
        if (k === 'arrowleft' || k === 'arrowright') {
          bidCursor = (bidCursor + (k === 'arrowright' ? 1 : btns.length - 1)) % btns.length;
          paintBidCursor(); SFX.select(); return;
        }
        if (k === 'enter' || k === ' ') { e.preventDefault(); btns[bidCursor] && btns[bidCursor].click(); return; }
      }

      if (!isMyTurn()) return;
      const hand = S.g.hand;
      if (k === 'arrowleft' || k === 'arrowright') {
        e.preventDefault();
        cursor = (cursor + (k === 'arrowright' ? 1 : hand.length - 1)) % hand.length;
        selected = null; paintCursor(); SFX.select();
        return;
      }
      if (k === 'arrowup' || k === 'enter' || k === ' ') {
        e.preventDefault();
        const card = hand[cursor];
        if (card) onCardTapKeyboard(card);
        return;
      }
      if (k >= '1' && k <= '8') {
        const card = hand[+k - 1];
        if (card) onCardTapKeyboard(card);
      }
    });

    // flick-up gesture on touch
    let sy = 0, scard = null;
    $('#hand').addEventListener('touchstart', (e) => {
      const c = e.target.closest('.card'); if (!c) return;
      sy = e.touches[0].clientY; scard = c.dataset.card;
    }, { passive: true });
    $('#hand').addEventListener('touchend', (e) => {
      if (!scard) return;
      const dy = sy - (e.changedTouches[0].clientY);
      if (dy > 45 && isMyTurn() && (S.g.legal || []).includes(scard)) playCard(scard);
      scard = null;
    }, { passive: true });
  }
  function onCardTapKeyboard(card) {
    if (!(S.g.legal || []).includes(card)) { toast('You must follow suit!'); SFX.error(); FX.shake(4, 6); return; }
    playCard(card);
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  document.addEventListener('pointerdown', function unlock() {
    SFX.unlock();
    document.removeEventListener('pointerdown', unlock);
  }, { once: true });

  boot();
})(window);
