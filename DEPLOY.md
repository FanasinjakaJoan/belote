# Deploying Belote Royale

The game ships in two shapes:

| | What it is | Needs a server? |
|---|---|---|
| **Static bundle** (`dist/`) | The installable web app / PWA and the body of the mobile app. Solo vs AI runs 100% offline — the rules engine and the bots run in the page. | No (online tables do) |
| **Node server** | Serves the same files **and** hosts online tables over WebSocket. | It *is* the server |

Online tables need the Node server; everything else does not. The static bundle can be
pointed at a server at build time (`--server https://…`), by repository variable
`BELOTE_SERVER`, with `?server=https://…` in the URL, or by the player in the Join screen.

---

## 0. Install the workflows (once)

The CI/CD workflows live in `deploy/github-workflows/` because the bot that opened this
branch is not allowed to write to `.github/workflows/`. Enable them with:

```bash
mkdir -p .github/workflows && cp deploy/github-workflows/*.yml .github/workflows/
git add .github/workflows && git commit -m "Enable CI/CD" && git push
```
(or paste the files through GitHub ▸ Actions ▸ *New workflow* ▸ *set up a workflow yourself*).

You get three: **CI** (tests + Docker smoke on every push), **Deploy web app** (GitHub
Pages), **Build Android app** (APK/AAB on demand).

## 1. Web — GitHub Pages

### The one-click way (nothing to install)

A ready-to-serve copy of the app is committed in **`docs/`**:

> **Settings ▸ Pages ▸ Build and deployment ▸ Source: _Deploy from a branch_ ▸
> Branch: `main` · Folder: `/docs` ▸ Save**

A minute later the game is live at `https://<user>.github.io/belote/`. Refresh it after
changing the app with `npm run build:pages && git commit -am "rebuild docs"`.

### The tidy way (build in CI)

With `pages.yml` installed: **Settings ▸ Pages ▸ Source: _GitHub Actions_**, then push to
`main`. Nothing needs to be committed; the URL appears in the run summary. Set the
repository variable `BELOTE_SERVER = https://your-server` (Settings ▸ Secrets and variables
▸ Actions ▸ Variables) to switch online play on.

Both routes ship the same installable PWA, and the bundle is sub-path safe (everything is
referenced relatively), which the test suite verifies.

Result: an installable PWA. Solo play works offline; without `BELOTE_SERVER` the online
buttons ask for a server URL instead of failing silently.

## 2. Web + multiplayer — the Node server

Any host that supports WebSockets and long-lived connections works. Zero build step,
one dependency (`ws`), listens on `PORT`/`HOST`, health check at `/api/health`.

**Fly.io** (config included — good free tier, WS works out of the box)
```bash
fly launch --copy-config --now      # uses fly.toml + Dockerfile
fly open
```

**Render** (`render.yaml` included)
> New ▸ Blueprint ▸ pick this repo. Free plan sleeps when idle; tables are in memory, so a
> sleep ends the current games.

**Railway / Heroku** — `railway.json` / `Procfile` are included; both auto-detect Node.

**Docker anywhere**
```bash
docker build -t belote-royale .
docker run -p 3000:3000 belote-royale
```

**A plain VPS**
```bash
git clone … && cd belote && npm ci --omit=dev
PORT=3000 node server/index.js       # behind nginx/caddy for TLS
```
If you terminate TLS in a proxy, make sure it forwards `Upgrade`/`Connection` headers so
`wss://…/ws` reaches the app. Nginx:
```nginx
location /ws {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 600s;
}
```

Sizing: state is in memory, ~1 KB per table, one `setTimeout` per active table. A 256 MB
instance handles hundreds of tables. There is no database and nothing to back up.

## 3. Mobile — install straight from the web (no store)

The PWA is a real installable app: **Android/Chrome** shows an *Install app* button on the
start screen (and the browser's own prompt); **iOS/Safari** → Share ▸ *Add to Home Screen*.
It launches fullscreen with its own icon, keeps high scores locally and plays offline.

## 4. Mobile — packaged APK / App Store build (Capacitor)

`capacitor.config.json` wraps the same `dist/` bundle.

**In CI (no local Android SDK needed)** — Actions ▸ *Build Android app* ▸ *Run workflow*.
It produces `belote-royale-debug-apk` (install directly on a phone) and an unsigned
release `.aab` for the Play Store.

**Locally**
```bash
npm run mobile:init     # adds Capacitor + the android project (needs Android Studio/SDK)
npm run mobile:apk      # android/app/build/outputs/apk/debug/app-debug.apk
npm run mobile:open     # open the project in Android Studio
```

**iOS** (needs macOS + Xcode)
```bash
npm i -D @capacitor/ios && npm run build && npx cap add ios && npx cap open ios
```

Before publishing:
- Set a real `appId` in `capacitor.config.json` (e.g. `com.yourname.belote`).
- Store listing icon: `node tools/icons.js --store` writes a 1024×1024 PNG.
- Sign the release build (Play Console upload key / Apple distribution certificate).
- If the app must reach online tables, build with `--server https://…` so it is baked in.

## Checks

`npm test` includes a `deployment` suite that verifies the manifest and every icon it
references, the service-worker precache list against the real `index.html`, that the
browser build of the rules engine runs with no module system, and that `dist/` is produced
correctly. CI additionally builds the Docker image and curls the running container.
