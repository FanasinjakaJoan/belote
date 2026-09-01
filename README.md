# ♠ Belote Royale

A polished, playable **belote card game for the browser** — classic French belote (32 cards,
two teams of two), with an authoritative Node server, real online tables for **2, 3 or 4 humans**,
and AI that fills every empty seat so you can also play **solo vs the machine**.

No build step, no framework: plain ES5-friendly JavaScript, CSS3 animation and a canvas
particle layer, all served by a ~200-line Node server.

```bash
npm install
npm start          # http://localhost:3000
npm test           # engine · headless client · multiplayer · deployment suites
npm run build      # dist/ — installable PWA / mobile bundle
```

**Solo play needs no server at all.** The rules engine and the bots ship to the browser,
so "Play vs AI" runs in the page — offline, installable, packageable as a mobile app.
The Node server exists for online tables. See [DEPLOY.md](DEPLOY.md).

## Features

**Game**
- Full French belote rules: trump ordering (J·9·A·10·K·Q·8·7), *follow suit*, forced
  over-trumping, the partner exception, belote/rebelote (+20), *dix de der* (+10),
  capot (252) and *dedans* (defenders take all 162).
- Two bidding rounds on a turned-up card, redeal when everyone passes.
- Match to 301 / 501 / 701 / 1001 points, three AI skill levels.

**Online**
- Create a table and share a 4-letter code — 1, 2, 3 or 4 humans at the same table.
- Quick match joins any open table; empty seats are always played by AI, so a game
  never stalls waiting for people.
- Drop out and the bot covers your seat; come back and your seat is returned to you
  (stable player id in `localStorage`, auto-rejoin on reconnect).
- Emotes, live seat states, host-controlled start.

**App / offline**
- Installable PWA: fullscreen, own icon, service-worker precached shell, `Install app`
  button on the start screen (iOS: Share ▸ Add to Home Screen).
- Solo games run on the same room engine the server uses, loaded into the page — identical
  rules, zero latency, no network.
- Ships as an Android APK/AAB through Capacitor (one CI click), and as a Docker/Fly/Render/
  Railway service for online play.

**Feel**
- Screen shake, particle bursts, sparkle trails on every card flight, suit explosions
  on a take, confetti on capots and victories.
- Card fan with per-card rotation, deal/land/sweep animations, count-up scoreboard,
  synthesized WebAudio SFX (no audio assets to download).
- Start screen, pause, round summary, game over with instant restart, and a local
  hall of fame.

**Controls**
| | |
|---|---|
| `←` `→` | pick a card |
| `↵` / `Space` / `↑` | play it |
| `1`–`8` | play a card directly |
| `Y` / `N` | take / pass while bidding |
| `S` `H` `D` `C` | name a trump suit in round two |
| `P` / `Esc` | pause · menu |
| `R` | restart from the game-over screen |
| `M` | mute |
| touch | tap to lift a card, tap again or flick up to play |

## Architecture

```
server/index.js   static files + WebSocket protocol (the only server-only code)
public/
  index.html      every screen, no templating
  sw.js           offline precache
  manifest.webmanifest
  js/engine.js    ← shared: pure rules + AI          (UMD: required by Node, loaded by the browser)
  js/rooms.js     ← shared: tables, seating, AI driver, per-seat views
  js/local.js     offline transport — runs rooms.js in the page for solo games
  js/net.js       picks WebSocket or the offline engine
  js/game.js      state → DOM renderer, input, juice
  js/{fx,cards,store,config}.js
tools/
  build-static.js dist/ bundle for Pages / Capacitor
  icons.js        dependency-free PNG decode/resize/encode for every icon size
test/
  engine.test.js       rules + 1000 simulated AI rounds
  client.test.js       the real UI in jsdom **with networking disabled** (proves offline solo)
  multiplayer.test.js  two humans + two bots playing a full round over WebSocket
  deploy.test.js       manifest, icons, SW precache, browser build of the engine, dist/
```

`engine.js` and `rooms.js` are UMD modules with a single source of truth: `require()`d by
the Node server, `<script>`-loaded by the browser. Online play is
**server-authoritative**: clients never see another player's hand (the test suite
asserts it), never compute legality, and every animation is triggered by an `fx` event
stream attached to each state broadcast. Solo play is the same code path — a private
table with three bots — so there is exactly one implementation of the rules.

### Performance
60 fps by construction: only `transform`/`opacity` are animated (GPU compositing),
particles come from a fixed 460-object pool drawn on one canvas whose rAF loop stops
completely when nothing is alive, DPR is capped at 2, and `prefers-reduced-motion`
disables the shake and long animations.

## Deploying

| Target | Command / file |
|---|---|
| Web (PWA, free) | Settings ▸ Pages ▸ branch `main`, folder `/docs` (already built) |
| Online server | `fly.toml`, `render.yaml`, `railway.json`, `Procfile`, `Dockerfile` |
| Android APK/AAB | Actions ▸ *Build Android app*, or `npm run mobile:apk` |
| Install the workflows | `cp deploy/github-workflows/*.yml .github/workflows/` |
| iOS | `npx cap add ios && npx cap open ios` (macOS) |

Full instructions, including TLS/WebSocket proxying and store submission, in
[DEPLOY.md](DEPLOY.md).
