/* Local persistence: settings + hall of fame */
(function (w) {
  'use strict';
  const K_HS = 'belote.highscores.v1';
  const K_ST = 'belote.settings.v1';

  const read = (k, d) => {
    try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; }
    catch { return d; }
  };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  const Store = {
    settings: Object.assign(
      { name: '', sound: true, target: 150, difficulty: 'normal' },
      read(K_ST, {})
    ),
    save() { write(K_ST, this.settings); },

    highscores() { return read(K_HS, []); },

    /** entry: {score, opp, rounds, target, difficulty, won, mode} */
    addScore(e) {
      const list = this.highscores();
      const row = Object.assign({ date: Date.now() }, e);
      list.push(row);
      list.sort((a, b) => (b.won - a.won) || (b.score - a.score) || (a.rounds - b.rounds));
      const top = list.slice(0, 10);
      write(K_HS, top);
      return top.indexOf(row);
    },
    clear() { write(K_HS, []); },
  };

  w.Store = Store;
})(window);
