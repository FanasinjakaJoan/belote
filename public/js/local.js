/* ══════════════════════════════════════════════════════════════════════
   Offline transport — runs the *exact* server room engine in the browser.
   Solo games therefore need no network at all: same rules, same protocol,
   same message shapes as the WebSocket server.
   ══════════════════════════════════════════════════════════════════════ */
(function (w) {
  'use strict';

  const ID = 'local-player';
  let room = null, emit = null, unsub = null;

  function pushState() {
    if (!room || !emit) return;
    emit(room.view(ID));
    room.flushFx();
  }

  function open(emitFn) { emit = emitFn; }

  function close() {
    if (unsub) unsub();
    if (room) room.destroy();
    unsub = null; room = null;
  }

  function send(m) {
    if (!w.BeloteRooms) { emit({ type: 'error', err: 'Offline engine failed to load' }); return; }
    switch (m.type) {
      case 'identify':
        emit({ type: 'hello', id: ID });
        break;

      case 'name':
        if (room) { const s = room.seats[room.seatOf(ID)]; if (s) { s.name = m.name; room.emit(); } }
        break;

      case 'solo': {
        close();
        room = new w.BeloteRooms.Room({
          code: 'SOLO', mode: 'solo', target: m.target, difficulty: m.difficulty, hostId: ID,
        });
        unsub = room.onChange(pushState);
        const seat = room.addPlayer(ID, m.name || 'You', 0);
        emit({ type: 'joined', code: 'SOLO', seat, mode: 'solo' });
        room.start();
        break;
      }

      case 'bid':   if (room) fail(room.bid(ID, m.action)); break;
      case 'play':  if (room) fail(room.play(ID, m.card)); break;
      case 'nextRound': if (room) room.nextRound(); break;
      case 'restart':   if (room) room.restart(); break;
      case 'pause':     if (room) room.setPaused(!!m.value); break;
      case 'leave':     close(); break;
      case 'chat':      break;
    }
  }
  function fail(res) { if (res && !res.ok) emit({ type: 'nope', err: res.err }); }

  w.LocalServer = { open, send, close, get active() { return !!room; } };
})(window);
