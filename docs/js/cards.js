/* Card DOM factory + card helpers (mirrors the server engine's notation). */
(function (w) {
  'use strict';
  const GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const LABEL = { 7: '7', 8: '8', 9: '9', T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };
  const RED = { H: 1, D: 1 };
  const PTS_TRUMP = { J: 20, 9: 14, A: 11, T: 10, K: 4, Q: 3, 8: 0, 7: 0 };
  const PTS_PLAIN = { A: 11, T: 10, K: 4, Q: 3, J: 2, 9: 0, 8: 0, 7: 0 };

  function el(card, trump) {
    const r = card[0], s = card[1];
    const d = document.createElement('div');
    d.className = 'card' + (RED[s] ? ' red' : '') + (trump && s === trump ? ' trump-card' : '');
    d.dataset.card = card;
    const g = GLYPH[s], lab = LABEL[r];
    const isFace = r === 'J' || r === 'Q' || r === 'K';
    d.innerHTML =
      '<span class="corner tl">' + lab + '<small>' + g + '</small></span>' +
      (isFace
        ? '<span class="face">' + lab + '</span><span class="pip" style="font-size:calc(var(--cw)*.34);opacity:.16">' + g + '</span>'
        : '<span class="pip">' + g + '</span>') +
      '<span class="corner br">' + lab + '<small>' + g + '</small></span>';
    d.setAttribute('aria-label', lab + ' of ' + { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' }[s]);
    return d;
  }

  w.Cards = {
    GLYPH, LABEL,
    el,
    isRed: (c) => !!RED[c[1]],
    glyph: (s) => GLYPH[s] || '—',
    points: (c, trump) => (c[1] === trump ? PTS_TRUMP[c[0]] : PTS_PLAIN[c[0]]),
    name: (c) => LABEL[c[0]] + GLYPH[c[1]],
  };
})(window);
