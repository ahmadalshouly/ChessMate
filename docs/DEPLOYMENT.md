# Deployment and CI

This covers continuous integration, running the production stack with Docker,
hosting the game server publicly, publishing the web app, and every
environment variable and secret the project uses.

Nothing here spends money or creates accounts on its own. The deploy workflow
is manual and skips any target whose secrets are not set. EAS (Expo cloud)
builds are never started by CI.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and every push to `main`:

| Job | What it checks |
| --- | --- |
| Lint, typecheck, test | `pnpm lint` (ESLint, Expo preset, whole monorepo), `pnpm typecheck`, `pnpm test` |
| Web build | `pnpm build:web` (static export of the Expo app), uploaded as the `web-dist` artifact for 7 days |
| Server image | Builds the Docker image (not pushed), starts it, checks `/health` and that Stockfish answers |

Run the same checks locally before pushing:

```bash
pnpm lint && pnpm typecheck && pnpm test
```

To make CI required before merging: GitHub repo → Settings → Branches → add a
rule for `main` → "Require status checks to pass" → pick the three jobs above.

`.github/workflows/eas-simulator.yml` is separate and only runs when started
by hand or when a PR gets the `simulator-build` label.

## Running the production stack locally (Docker)

```bash
docker compose up -d                          # Postgres only (for pnpm dev:server)
docker compose --profile server up -d --build # Postgres + game server image
```

The server is then on `http://localhost:8787` (`/health`, WebSocket at `/ws`).
Point the app at it with `EXPO_PUBLIC_SERVER_URL=ws://localhost:8787/ws pnpm dev:app`.

The image (`Dockerfile` at the repo root):

- compiles the server with esbuild (`pnpm build:server`, output `apps/server/dist/main.js`); our own code and `@chessmate/core` are bundled, npm dependencies are installed next to it with `pnpm deploy --prod`;
- installs Debian's native Stockfish at `/usr/games/stockfish` (a separate process, never linked into our code, which keeps the GPL boundary clean);
- runs as the unprivileged `node` user with a `/data` volume and a `/health` health check.

Without Docker: `pnpm build:server && pnpm start:server`.

## Hosting the game server

**Recommendation: Fly.io for the server, Neon for Postgres.**

- Fly runs the Docker image as-is, supports long-lived WebSockets, gives HTTPS (`wss://`) automatically, and lets us pick a region close to players. One `shared-cpu-1x` machine with 1 GB RAM (enough for one Stockfish worker) costs roughly 5 to 7 USD a month.
- Neon's free Postgres tier is enough to start; set its connection string as `DATABASE_URL`. Fly's own Postgres or any managed Postgres works too.
- Live games and matchmaking currently live in memory on one machine, so `fly.toml` keeps exactly one machine running and never auto-stops it. Scaling out later needs routing by game id (see the README roadmap).

Alternatives: Railway (similar, Docker-based, usage billing) or Render (its free plan sleeps, which drops live games, so it needs a paid instance).

### One-time setup (Ahmad, when ready)

1. Create a Fly.io account and install `flyctl`.
2. From the repo root: `fly launch --no-deploy --copy-config --name <app-name>`, then set `app = "<app-name>"` in `fly.toml` if it differs.
3. Create a Postgres database (for example on Neon) and store its URL: `fly secrets set DATABASE_URL=postgres://...`.
4. Add any other server secrets (see the table below) with `fly secrets set`.
5. Create a deploy token: `fly tokens create deploy`, and save it as the GitHub Actions secret `FLY_API_TOKEN`.
6. Run the **Deploy** workflow (Actions → Deploy → Run workflow → `server`). Or deploy from your machine: `fly deploy`.

The server is then at `wss://<app-name>.fly.dev/ws`.

## Publishing the web app

`pnpm build:web` writes a static site to `apps/app/dist` (one HTML file per
route plus hashed JS). Any static host works.

**Recommendation: Cloudflare Pages** (free, global CDN, custom domains).

1. Create a Cloudflare account and a Pages project named `chessmate` (or set the repo variable `CLOUDFLARE_PAGES_PROJECT`).
2. Add GitHub Actions secrets `CLOUDFLARE_API_TOKEN` (Pages: Edit permission) and `CLOUDFLARE_ACCOUNT_ID`.
3. Add the GitHub Actions **variable** `EXPO_PUBLIC_SERVER_URL` = `wss://<app-name>.fly.dev/ws`.
4. Run the **Deploy** workflow with target `web` (or `all`).

The server URL is baked into the bundle at build time, and a site served over
HTTPS must use `wss://`, so set `EXPO_PUBLIC_SERVER_URL` for every production build.

## Environment variables and secrets

### Game server (runtime)

| Variable | Default | Where to set in production | Notes |
| --- | --- | --- | --- |
| `PORT` | `8787` | `fly.toml` | HTTP + WebSocket port |
| `NODE_ENV` | unset | `fly.toml` / image (`production`) | `production` disables dev-only `dev:` login tokens |
| `AUTH_SECRET` | dev: generated into `.data/auth-secret` | `fly secrets set` (secret), `.env` for Docker Compose | **Required in production**: the server refuses to start without it. At least 32 random characters, e.g. `openssl rand -hex 32` |
| `RESEND_API_KEY`, `MAIL_FROM` | unset: emails are printed to the server console | `fly secrets set` (secret) | Sends password resets and moderation notices (warnings, chat mutes, fair-play bans, closures) through Resend. `MAIL_FROM` is the sender, e.g. `ChessMate <no-reply@your-domain.com>` on a domain verified in Resend. `APP_WEB_URL` sets the link in reset emails |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | unset: paid tournaments are off | `fly secrets set` (secret) | Entry fees for tournaments, paid with Stripe Checkout on the web. Add a Stripe webhook to `https://<server>/api/stripe/webhook` for `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `checkout.session.expired`; its signing secret is `STRIPE_WEBHOOK_SECRET`. `APP_WEB_URL` must be the web app address so Stripe can send players back |
| `GOOGLE_CLIENT_IDS` | unset (Google sign-in off) | `fly.toml` or `fly secrets set` | Comma-separated Google OAuth client IDs (web, iOS, Android). See [sign-in-with-google-and-apple.md](sign-in-with-google-and-apple.md) |
| `APPLE_CLIENT_IDS` | `com.chessmate.app` (+ `host.exp.Exponent` outside production) | `fly.toml` | Accepted Sign in with Apple audiences. Empty string turns Apple off |
| `DATABASE_URL` | unset | `fly secrets set` (secret) | Postgres connection string. Unset = embedded PGlite |
| `DATABASE_PATH` | `.data/pglite` (image: `/data/pglite`) | rarely needed | PGlite data directory when `DATABASE_URL` is unset |
| `DATABASE_POOL_MAX` | driver default | `fly.toml` | Max Postgres connections |
| `STOCKFISH_PATH` | unset (image: `/usr/games/stockfish`) | image | Native Stockfish. Unset = npm WASM build |
| `ENGINE_WORKERS` | `1` | `fly.toml` | Parallel Stockfish processes |
| `ENGINE_THREADS` | engine default | `fly.toml` | Threads per Stockfish |
| `ENGINE_HASH_MB` | engine default | `fly.toml` | Hash table size per Stockfish |
| `ADMIN_USERNAMES` | unset | `fly.toml` or `fly secrets set` | Comma-separated usernames made admins at startup (or when they sign up). Staff roles are stored in the database, so this is only needed once. `pnpm admin:grant <username> [admin\|moderator\|user]` does the same from a shell |
| `PUBLIC_URL` | derived from the request | `fly.toml` | Public server address used in links the server hands out (title proof files in the admin console) |

Features that add their own server settings (for example an AI coach API key
or push notification credentials) should add a row here and to `.env.example`.
Anything secret goes in `fly secrets set`, never in `fly.toml` or git.

### App (build time)

| Variable | Default | Notes |
| --- | --- | --- |
| `EXPO_PUBLIC_SERVER_URL` | LAN auto-detect in dev | Game server WebSocket URL, e.g. `wss://chessmate-server.fly.dev/ws`. Public: it ends up in the app bundle |

### GitHub Actions secrets and variables

| Name | Kind | Used by | Purpose |
| --- | --- | --- | --- |
| `EXPO_TOKEN` | secret | `eas-simulator.yml` | EAS builds (manual/label only, uses build quota) |
| `FLY_API_TOKEN` | secret | `deploy.yml` | Deploy the server to Fly.io |
| `CLOUDFLARE_API_TOKEN` | secret | `deploy.yml` | Publish the web app to Cloudflare Pages |
| `CLOUDFLARE_ACCOUNT_ID` | secret | `deploy.yml` | Cloudflare account for Pages |
| `EXPO_PUBLIC_SERVER_URL` | variable | `ci.yml`, `deploy.yml` | Server URL baked into web builds |
| `CLOUDFLARE_PAGES_PROJECT` | variable | `deploy.yml` | Pages project name (default `chessmate`) |

Set them under repo Settings → Secrets and variables → Actions.

`.env.example` lists every variable. Docker Compose reads a `.env` file next to
it; `.env` files are git-ignored and only `.env.example` is committed.
