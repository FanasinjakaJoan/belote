/* ══════════════════════════════════════════════════════════════════
   FX — particle canvas, screen shake, WebAudio SFX.
   Runs a single rAF loop that idles (zero cost) when nothing is alive.
   ══════════════════════════════════════════════════════════════════ */
(function (w) {
  'use strict';

  // ───────────────────────────────── particles ─────────────────────────────
  const cv = document.getElementById('fx');
  const ctx = cv.getContext('2d', { alpha: true });
  let W = 0, H = 0, dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.floor(W * dpr); cv.height = Math.floor(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  addEventListener('resize', resize);
  addEventListener('orientationchange', () => setTimeout(resize, 250));

  const POOL = 460;
  const P = new Array(POOL);
  for (let i = 0; i < POOL; i++) P[i] = { life: 0 };
  let cursor = 0;
  function spawn() {
    for (let n = 0; n < POOL; n++) {
      const p = P[cursor];
      cursor = (cursor + 1) % POOL;
      if (p.life <= 0) return p;
    }
    return P[0];
  }

  let running = false;
  let last = 0;
  let shakeT = 0, shakeMag = 0;
  const shakeEl = document.getElementById('shake');

  function loop(now) {
    const dt = Math.min((now - last) / 16.6667, 3) || 1;
    last = now;
    ctx.clearRect(0, 0, W, H);
    let alive = 0;

    for (let i = 0; i < POOL; i++) {
      const p = P[i];
      if (p.life <= 0) continue;
      alive++;
      p.life -= dt;
      p.vy += p.g * dt;
      p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      const t = Math.max(0, p.life / p.max);
      ctx.globalAlpha = p.fade ? t * t : Math.min(1, t * 2.6);

      if (p.kind === 'rect') {
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s * .5, -p.s * .32, p.s, p.s * .64);
        ctx.restore();
      } else if (p.kind === 'glyph') {
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c; ctx.font = '700 ' + p.s + 'px Outfit, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(p.g, 0, 0);
        ctx.restore();
      } else if (p.kind === 'ring') {
        ctx.beginPath();
        ctx.strokeStyle = p.c; ctx.lineWidth = Math.max(1, 4 * t);
        ctx.arc(p.x, p.y, p.s * (1 - t) * 1.6 + 4, 0, 6.283);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.fillStyle = p.c;
        ctx.arc(p.x, p.y, p.s * (p.shrink ? t : 1), 0, 6.283);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    if (shakeT > 0) {
      shakeT -= dt;
      const k = Math.max(0, shakeT) / 10;
      const m = shakeMag * k * k;
      shakeEl.style.transform =
        'translate3d(' + (Math.random() * 2 - 1) * m + 'px,' + (Math.random() * 2 - 1) * m + 'px,0) rotate(' +
        (Math.random() * 2 - 1) * m * .06 + 'deg)';
      if (shakeT <= 0) shakeEl.style.transform = '';
      alive++;
    }

    if (alive > 0) requestAnimationFrame(loop);
    else { running = false; ctx.clearRect(0, 0, W, H); }
  }
  function kick() {
    if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); }
  }

  const GOLD = ['#e8c37a', '#fff0cd', '#b8873a', '#ffd98a'];
  const rnd = (a, b) => a + Math.random() * (b - a);

  const FX = {
    shake(mag = 8, dur = 10) {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      shakeMag = Math.max(shakeMag * .6, mag); shakeT = Math.max(shakeT, dur); kick();
    },

    burst(x, y, opts = {}) {
      const n = opts.n || 22;
      const colors = opts.colors || GOLD;
      for (let i = 0; i < n; i++) {
        const p = spawn();
        const a = opts.angle != null ? opts.angle + rnd(-.6, .6) : rnd(0, 6.283);
        const sp = rnd(opts.speedMin || 1.6, opts.speedMax || 6.5);
        p.x = x; p.y = y;
        p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
        p.g = opts.g != null ? opts.g : .16;
        p.drag = opts.drag || .965;
        p.s = rnd(opts.sizeMin || 2, opts.sizeMax || 5.5);
        p.rot = rnd(0, 6.283); p.vr = rnd(-.3, .3);
        p.c = colors[(Math.random() * colors.length) | 0];
        p.kind = opts.kind || 'dot';
        p.g_ = 0; p.shrink = opts.shrink !== false; p.fade = !!opts.fade;
        p.max = p.life = rnd(opts.lifeMin || 26, opts.lifeMax || 52);
        if (opts.glyphs) { p.kind = 'glyph'; p.g = opts.glyphs[(Math.random() * opts.glyphs.length) | 0]; p.s = rnd(11, 24); p.g_ = 0; }
      }
      if (opts.ring !== false) {
        const r = spawn();
        r.x = x; r.y = y; r.vx = r.vy = 0; r.g = 0; r.drag = 1; r.rot = 0; r.vr = 0;
        r.kind = 'ring'; r.c = colors[0]; r.s = opts.ringSize || 60; r.shrink = false; r.fade = true;
        r.max = r.life = 22;
      }
      kick();
    },

    /** Sparkle trail along a straight path (card flight). */
    trail(x0, y0, x1, y1, colors) {
      const steps = 8;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const p = spawn();
        p.x = x0 + (x1 - x0) * t; p.y = y0 + (y1 - y0) * t;
        p.vx = rnd(-.5, .5); p.vy = rnd(-.5, .5);
        p.g = .02; p.drag = .95; p.s = rnd(1.5, 3.4);
        p.rot = 0; p.vr = 0; p.kind = 'dot';
        p.c = (colors || GOLD)[(Math.random() * (colors || GOLD).length) | 0];
        p.shrink = true; p.fade = false;
        p.max = p.life = rnd(14, 26);
      }
      kick();
    },

    confetti(n = 130) {
      for (let i = 0; i < n; i++) {
        const p = spawn();
        p.x = rnd(0, W); p.y = rnd(-H * .3, 0);
        p.vx = rnd(-1.6, 1.6); p.vy = rnd(1.5, 5);
        p.g = .09; p.drag = .995; p.s = rnd(6, 13);
        p.rot = rnd(0, 6.283); p.vr = rnd(-.25, .25);
        p.c = ['#e8c37a', '#5fd6a8', '#fff0cd', '#ff8b6b', '#8ad7ff'][(Math.random() * 5) | 0];
        p.kind = 'rect'; p.shrink = false; p.fade = true;
        p.max = p.life = rnd(90, 190);
      }
      kick();
    },

    suitPop(x, y, suit) {
      const red = suit === '♥' || suit === '♦';
      FX.burst(x, y, {
        n: 16, glyphs: [suit], colors: red ? ['#ff5f72', '#ffb3bd'] : ['#fff0cd', '#e8c37a'],
        speedMin: 1.2, speedMax: 5, g: .11, lifeMin: 30, lifeMax: 60, fade: true, ringSize: 70,
      });
    },
  };

  // ───────────────────────────────── audio ─────────────────────────────────
  let AC = null, master = null;
  let enabled = true;

  function ensure() {
    if (!AC) {
      const C = w.AudioContext || w.webkitAudioContext;
      if (!C) return null;
      AC = new C();
      master = AC.createGain();
      master.gain.value = .28;
      master.connect(AC.destination);
    }
    if (AC.state === 'suspended') AC.resume();
    return AC;
  }

  function tone(freq, dur, type = 'sine', vol = 1, when = 0, slide = 0) {
    const ac = ensure(); if (!ac || !enabled) return;
    const t0 = ac.currentTime + when;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol * .5, t0 + .012);
    g.gain.exponentialRampToValueAtTime(.0008, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + .03);
  }

  function noise(dur = .18, vol = .5, hp = 900, when = 0) {
    const ac = ensure(); if (!ac || !enabled) return;
    const t0 = ac.currentTime + when;
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = ac.createGain(); g.gain.value = vol * .6;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }

  const SFX = {
    get enabled() { return enabled; },
    set enabled(v) { enabled = v; if (v) ensure(); },
    unlock() { ensure(); },
    deal() { for (let i = 0; i < 5; i++) noise(.09, .3, 1500, i * .055); },
    card() { noise(.07, .45, 1200); tone(280, .07, 'triangle', .3, 0, -80); },
    select() { tone(660, .05, 'sine', .22); },
    trick(win) {
      noise(.22, .4, 700);
      if (win) { tone(523, .12, 'triangle', .5); tone(784, .16, 'triangle', .45, .08); }
      else tone(300, .13, 'sine', .3, 0, -70);
    },
    belote() { [659, 784, 988, 1319].forEach((f, i) => tone(f, .3, 'triangle', .4, i * .07)); },
    take() { [392, 523, 659].forEach((f, i) => tone(f, .22, 'sawtooth', .22, i * .06)); },
    pass() { tone(200, .16, 'sine', .28, 0, -60); },
    error() { tone(150, .18, 'square', .25); tone(120, .2, 'square', .2, .05); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .5, 'triangle', .45, i * .1)); },
    lose() { [440, 392, 330, 262].forEach((f, i) => tone(f, .4, 'sine', .35, i * .12)); },
    round() { [523, 784].forEach((f, i) => tone(f, .3, 'triangle', .35, i * .09)); },
    ui() { tone(880, .05, 'sine', .18); },
  };

  w.FX = FX;
  w.SFX = SFX;
})(window);
