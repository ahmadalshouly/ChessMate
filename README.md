# ChessMate

Online chess platform for web, iOS and Android: real-time games against other players, engine evaluation, move feedback with threat detection, and free lessons built on open content.

## Repository layout

```
apps/
  app/       Expo (React Native) app: one codebase for iOS, Android and web
  server/    Realtime game server (Node, WebSockets): matchmaking, authoritative games, clocks, ratings
packages/
  core/      Shared TypeScript chess logic used by app and server
  db/        Postgres schema, migrations and queries (Drizzle ORM)
```

### App navigation

The app shell lives in `apps/app/src/components/shell/` and wraps the main sections:

- Phones and narrow windows: glass header (logo, section title, rating, avatar) and a floating bottom tab bar.
- Wide screens (960px and up, e.g. desktop web): a glass sidebar with the same sections and a user card.

Sections are folders in `apps/app/src/app/(tabs)/` (`(home)`, `puzzles`, `learn`, `social`, `profile`), each with its own stack. Add a screen by adding a file to the section's folder; deeper screens get a glass header with a back button automatically. Tabs are configured in `apps/app/src/navigation/tabs.ts`. Full-screen flows such as games stay outside the shell (`apps/app/src/app/play/`). The header reads the player from `useCurrentUser()` in `apps/app/src/lib/currentUser.ts`, a guest stand-in until accounts land.

`@chessmate/core` holds everything both sides must agree on:

| Module | What it does |
| --- | --- |
| `game.ts` | Rules wrapper over chess.js (UCI moves, outcomes, PGN, mating material) |
| `clock.ts`, `timeControl.ts` | Pure chess clock with increment, time-control categories |
| `threats.ts` | Hanging pieces, opponent threats (mate, winning captures, forks), tactical chances |
| `evaluation.ts` | Engine score to expected score, move classification (best to blunder), accuracy |
| `uci.ts` | UCI engine output parsing and strength settings, for the server-side engine workers |
| `rating.ts` | Glicko-2 ratings per time category |
| `protocol.ts` | Typed client/server WebSocket messages |
| `moveFeedback.ts` | Deterministic one-line move feedback (best to blunder, with the threat or hanging piece behind it) |
| `bot/` | ChessMate's own small engine (alpha-beta, written for this repo), the 25 built-in computer opponents in eight rating bands, their playing styles and opening repertoires, and validation for staff-made online bots |
| `analysis.ts` | Engine lines for display, FEN/PGN import, per-move game review (`buildReview`) |
| `lessons/` | Learn-tab lessons: explanations on example positions plus practice puzzles from the CC0 Lichess database |
| `openings.ts` | Opening name and ECO detection by position (handles transpositions), from the CC0 Lichess opening tables |
| `pgn.ts` | PGN export (single or many games) and import (multi-game files, comments and variations skipped) |
| `archive.ts` | Archived game model, filters (result, colour, time control, source, opening, text, dates) and stats |
| `puzzle.ts` | Puzzle CSV parsing, solving and hints, server-side grading, puzzle rating, streak/rush ladders, theme labels |
| `secretQueen.ts` | Secret Queen variant: hidden queen-pawns, reveals, truth-based legality ([docs/secret-queen.md](docs/secret-queen.md)) |
| `tournaments.ts` | Arena tournaments: points, streaks, staff input validation |
| `messages.ts` | Direct message types and validation |
| `qr.ts` | Dependency-free QR encoder for profile codes |

### Design decisions

- **One Expo app for all three platforms** (Expo Router, React Native Web). Shared UI, shared logic.
- **Server is authoritative.** Clients send moves with the ply they expect; the server validates, runs the clocks and broadcasts. Clients play moves optimistically and resync on rejection.
- **Live analysis runs server-side** so live games cannot be assisted from the client. The practice board's threat hints run on device because they are not engine strength.
- **Game reviews run only on the player's device** (`apps/app/src/features/engine`): Stockfish compiled to WebAssembly, in Web Workers on the web and in a hidden WebView on iOS/Android, one engine per spare core. The server never grades a review. Moves appear graded from the first one while the rest are searched, finished reviews are kept on the device, and a game is graded as soon as it ends so Review usually opens finished. Review is for signed-in accounts; guests see **Sign in to review**. Like the server, the app refuses engine help while you have a live game.
- **Saved reviews.** The first review of an online game is saved on the server (`POST /api/games/:id/review` with the device's per-position engine results; only the two players may save it, and the server rebuilds the grades and accuracy itself from those results). From then on anyone signed in who opens that game, for example from a profile, gets the saved review instead of a fresh one, and reviewed games show their accuracy where the Review button was. A later review from a player replaces it only when it searched deeper everywhere (a Deep review, below).
- **Play vs computer runs on device**, so it works offline and costs no server time. Games against bots are unrated. There are 25 built-in opponents from Nib (~250) to Zenith (~3500), grouped into eight rating bands (Beginner to Superhuman), each with a style (balanced, aggressive, solid, positional or gambit) that picks its opening repertoire. Bots below 1320 play with ChessMate's own small engine (`packages/core/src/bot`), weakened by search depth, score noise and occasional careless moves. From 1320 to 3190 they play the on-device Stockfish with its strength limit (`UCI_LimitStrength`, `UCI_Elo`), and above that Stockfish at full strength with more time per move. On a device that cannot run Stockfish, the small engine stands in and the game says the bot plays weaker there.
- **Online bots.** Admins add extra opponents in `/admin/bots` with a name, a picture (uploaded or linked), a rating, a style, an optional badge (streamer, creator, coach, ambassador), a tagline and a link to the person's channel. They are meant for streamers and other creators. The app lists them next to the built-in bots in their rating band (featured ones in a row at the top) only while it can reach the server, and their moves are played on the device like any other bot. The console shows how many games each one has played and how they ended.
- **Licensing.** Only permissively licensed dependencies ship in the app (chess.js is BSD-2). Lichess databases (CC0) can be used for openings and puzzles; Lichess code (AGPL/GPL) must not be copied. Stockfish (GPL) is never linked into our code: on the server it runs as a separate process, and in the app as a separate, unmodified engine file (Stockfish.js, `apps/app/public/engine`, with its license) that only exchanges UCI text with the app. Refresh it with `node apps/app/scripts/vendor-engine.mjs` after upgrading the `stockfish` dev dependency.
- **Original look.** Monochrome, frosted-glass brand built around the ChessMate logo (queen and crowned knight); no assets taken from other chess sites.
- **Tournaments.** Staff create arena tournaments in `/admin/tournaments` (schedule, length, player limit, prize pool and prizes per place). Players join from the Tournaments tab; while it runs the server pairs free players with similar scores. Win 2, draw 1, double after two wins in a row.
- **Messages.** Direct messages between players (who may message you follows Settings → Privacy), plus a read-only "ChessMate team" thread for staff messages and announcements (`/admin/messages`). Game chat is separate.
- **Profiles.** Add friend, Message and a QR code on every profile; players pick their own tag (separate from staff role tags). A profile QR code holds `/u/<username>`, so any phone camera opens it.
- **Football Mate.** Players can pick the football club they support (Edit profile), from 64 of the most followed clubs in `packages/core/src/footballClubs.ts`. Its badge shows next to their name on the profile, on player cards in games and in the player sheet. Logos come from [TheSportsDB](https://www.thesportsdb.com): the server looks each club up in the background after it starts (a few seconds apart, for the free tier's rate limit), refreshes weekly and serves the URLs at `GET /api/football/logos`. Set `FOOTBALL_LOGO_API_KEY` to a paid TheSportsDB key for production (the public test key is the default), or `FOOTBALL_LOGOS=off` to turn lookups off. Clubs without a logo get an original shield in their colours. Crests are the clubs' trademarks; TheSportsDB hosts the images but gives no rights to use them.
- **Boards and pieces.** Players pick from 16 board themes and 8 piece sets in Settings > Board, saved to their account (or the device for guests) and used on every board. Piece artwork comes from openly licensed sets by their original authors (Apache 2.0, MIT, CC BY, CC BY-SA, CC0; never non-commercial or GPL art), plus ChessMate's own Glass set. Sources, credits and how to add a set: [apps/app/art/pieces/README.md](apps/app/art/pieces/README.md).

## Languages

The app is in English, Arabic, German, Spanish, French, Portuguese (Brazil), Russian, Turkish, Indonesian, Hindi, Chinese (Simplified), Japanese and Korean (the staff console in English, Arabic and German). It follows the device language and can be changed in the language dropdown under **Settings → Language** (or at the bottom of the welcome screen). Arabic mirrors the layout right to left, except the chessboard, and uses IBM Plex Sans Arabic. On a phone, switching to or from Arabic restarts the app once. To add text to a screen, see [apps/app/src/i18n/README.md](apps/app/src/i18n/README.md).

To try it on the web, switch the language in Settings. To test the device default, set the browser language (Chrome: Settings → Languages) or the phone language, and pick **Device language** in Settings.

## Design system

UI components and theme tokens live in `apps/app/src/ui` (import from `@/ui`). Type: Montserrat (the logo's wordmark face) for titles, Geist for body text, Geist Mono for clocks, ratings and labels, all bundled with the app. Logo files (SVG, black and white) are in `apps/app/assets/brand/`. Guidelines and examples: [apps/app/src/ui/README.md](apps/app/src/ui/README.md). With the dev server running, open http://localhost:8081/design in the browser to see every component in light and dark.

## Getting started

Requirements: Node 22+ and pnpm 12 (`npm i -g pnpm@12`). Works on Windows, macOS and Linux.

```bash
git pull                 # get the latest main
pnpm install             # after every pull, in case dependencies changed
pnpm dev:server          # terminal 1: game server on port 8787
pnpm dev:app             # terminal 2: Expo dev server (scan the QR code, or press w for web)
```

The app opens on a welcome screen: create an account, sign in, or tap **Continue as guest**. Accounts are saved in the local database, so they survive restarts. If Expo shows an old screen or the old fonts after pulling, stop it and run `pnpm dev:app --clear`. Language support (`expo-localization` and the bundled Arabic font) works in Expo Go, so it needs no new build. The on-device game review uses `react-native-webview`, `expo-asset` and `expo-file-system`, which are all in Expo Go too: after `pnpm install`, start with `pnpm dev:app --clear` once so Metro picks up the engine files.

**Keyboard and text fields:** on iPhone and Android the focused text field (chat, messages, sign-in, forms, admin dialogs) moves up above the keyboard instead of hiding under it. Android apps are edge-to-edge, so the window no longer shrinks for the keyboard; the app handles it itself with `react-native-keyboard-controller` (wired up once in the root layout). New screens should use `KeyboardScrollView` for scrolling pages or forms with inputs and `KeyboardAvoider` for a composer pinned to the bottom, both from `@/ui`. The library is in Expo Go, so after pulling run `pnpm install` and start once with `pnpm dev:app --clear`. Development, preview and store builds need a new native build because it adds native code.

**Liquid Glass look:** the app's bars, header buttons, glass buttons and sheets use Apple's native Liquid Glass on iOS 26 and later (`expo-glass-effect`, included in Expo Go, so no new build is needed). After pulling, run `pnpm install` and start once with `pnpm dev:app --clear`. On older iOS, Android and the web the same surfaces are drawn as blurred glass with a lit edge. Turning on *Reduce Transparency* (iOS Settings, Accessibility, Display & Text Size) switches glass to solid panels.

**Handshake at game start:** when an online, computer or pass-and-play game begins, a real-looking handshake (Ahmad's artwork, `apps/app/assets/images/handshake.webp`) appears over the board, grips and pumps three times. It lasts about 2.8 seconds, touches pass through it so you can make your first move straight away (a move fades it out at once), and it is skipped when *Reduce Motion* is on. It is a plain image animated with Reanimated, both in Expo Go, so `git pull` and `pnpm dev:app` are enough; no new build is needed. A reconnect to a game already under way does not replay it.

**Sounds on a phone:** game sounds use `expo-audio`, which is in Expo Go, so no new build is needed. After pulling, restart with `pnpm dev:app --clear`. A muted phone stays quiet: the iPhone silent switch, or Android's silent or vibrate mode, mutes game sounds unless **Settings → Sound → Play sounds on silent** is on. If you hear nothing, check the mute switch and the phone's media volume (not the ringer volume). Every sound file lasts at least a second (the sound, then silence): Android plays nothing for a file short enough to fit whole in its audio buffer, which is why the move and illegal-move sounds were once silent there. On Android in Expo Go each sound file is copied to the phone before it plays, and a file that fails to load is reloaded; in development a failed load is logged in the Expo terminal as `[sounds] … failed to load`.

**Judging smoothness on a phone:** `pnpm dev:app` runs the app in development mode, where JavaScript is several times slower than in a real build (extra checks, no minifying). Board dragging and piece slides run on the UI thread, so they stay smooth either way, but selecting a piece, legal-move dots and screen changes feel slower than they will in the store app. To see real speed in Expo Go, start Expo with `pnpm dev:app --no-dev --minify` (reload the app after switching).

To try rated games and the end-of-game animations: create two accounts (one in a normal browser window, one in a private window, or on two phones), open **Play** in both, keep *Rated* selected and press Play in each. Ratings are stored in `.data/pglite`, so they carry over when you restart `pnpm dev:server`.

Checks (the same ones CI runs on every PR): `pnpm lint`, `pnpm typecheck`, `pnpm test`.

CI, Docker, hosting and every environment variable are documented in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Database

Games, moves, accounts and ratings are saved in Postgres. Nothing to install for local development: without `DATABASE_URL` the server runs Postgres embedded in-process (PGlite) and keeps its data in `.data/pglite` at the repo root. Migrations run automatically when the server starts.

| Setting | What it does |
| --- | --- |
| `DATABASE_URL` | Connect to a real Postgres, e.g. `postgres://chessmate:chessmate@localhost:5432/chessmate` |
| `DATABASE_PATH` | Folder for the embedded database when `DATABASE_URL` is unset (default `.data/pglite`) |
| `CHESSMATE_DB=off` | Keep everything in memory, save nothing |

To use a real Postgres locally (Docker Desktop):

```powershell
pnpm db:up                                                                         # starts postgres:17 from docker-compose.yml
$env:DATABASE_URL = "postgres://chessmate:chessmate@localhost:5432/chessmate"       # PowerShell
pnpm dev:server
```

To start over with an empty embedded database, stop the server and delete the `.data` folder.

Schema changes: edit `packages/db/src/schema.ts`, then `pnpm db:generate` to write a migration into `packages/db/drizzle/` and commit it. `pnpm db:studio` opens a browser view of the data (needs `DATABASE_URL`).

Tables: `users`, `refresh_sessions`, `password_resets`, `oauth_accounts`, `ratings` (one row per user and pool: bullet, blitz, rapid, classical, correspondence, puzzle), `rating_history`, `games` (players, time control, result, PGN, ratings before and after), `moves` (per ply with clocks and room for engine evals), `friendships`, `notifications`, `puzzles`, `puzzle_attempts`.

## Accounts and sign-in (server)

The game server also serves the account API at `http://<host>:8787/api/auth` (code in `apps/server/src/auth/`):

| Endpoint | Body | Result |
| --- | --- | --- |
| `POST /signup` | `{username, email, password}` | `201 {user, tokens}` |
| `POST /login` | `{login, password}` (login is username or email) | `200 {user, tokens}` |
| `POST /refresh` | `{refreshToken}` | `200 {user, tokens}`, rotates the refresh token |
| `POST /logout` | `{refreshToken, all?}` | `204` (`all: true` signs out every device) |
| `GET /me` | `Authorization: Bearer <accessToken>` | `200 {user}` |
| `POST /forgot-password` | `{email}` | `202` always |
| `POST /reset-password` | `{token, password}` | `204`, signs out every device |
| `POST /change-password` | `{currentPassword, newPassword}` + Bearer | `204` (accounts without a password may leave `currentPassword` empty) |
| `GET /providers` | | `200 {providers: {google, apple}}`: which social sign-ins the server accepts |
| `POST /google` | `{idToken}` (Google ID token) | `201` new account / `200` existing, `{user, tokens}` |
| `POST /apple` | `{idToken, fullName?}` (Apple identity token) | `201` / `200`, `{user, tokens}` |

Errors are `{error: {code, message, field?}}`. Passwords are hashed with scrypt; access tokens are 15-minute JWTs and refresh tokens last 30 days. The WebSocket `hello` accepts an access token, and `guest:<name>` still works for guest play.

Local development needs no setup: accounts are saved in the same database as games (embedded PGlite in `.data/pglite`, or Postgres when `DATABASE_URL` is set; in memory only with `CHESSMATE_DB=off`), and password reset links are printed in the server terminal instead of emailed. Settings, all optional in development:

- `AUTH_SECRET`: token signing secret, at least 32 characters. Required in production; without it in development, one is generated once and kept in `.data/auth-secret`, so you stay signed in across restarts.
- `CORS_ORIGINS`: comma-separated web origins allowed in production (development allows any).
- `APP_WEB_URL`: base URL used in printed reset links (default `http://localhost:8081`).
- `TRUST_PROXY=1`: use `X-Forwarded-For` for rate limiting when behind a reverse proxy.
- `GOOGLE_CLIENT_IDS`: comma-separated Google OAuth client IDs (web, iOS, Android) whose ID tokens are accepted. Unset turns Google sign-in off.
- `APPLE_CLIENT_IDS`: comma-separated Apple audiences, default `com.chessmate.app`. Outside production Expo Go's `host.exp.Exponent` is accepted too. Set it to an empty string to turn Apple sign-in off.

Google and Apple ID tokens are checked against the providers' published signing keys (fetched and cached), plus issuer, audience and expiry (`apps/server/src/auth/oauth.ts`). Links live in the `oauth_accounts` table.

## Engine analysis

The game server runs Stockfish as separate processes (UCI over stdin/stdout) and streams results over the same WebSocket as games, for the analysis board and broadcasts. Game reviews run on the player's device instead (see above). The app gets:

- **Analysis board** (home → Analysis board): move freely for both sides, step through the line, import a FEN or PGN, evaluation bar, top 1 or 3 engine lines with arrows. Tap a line to play its first move. Every move you play or step through gets a badge on the moved piece once the engine has seen the position before and after it (depth 12+).
- **Board editor** (analysis board → pencil in the header, or **Set up position** under the moves): set up any position by hand. Pick a piece from the rows above and below the board and tap squares to place it; drag pieces to move them, or off the board to remove them. Choose the side to move and castling (only offered while king and rook stand on their home squares), copy or paste the FEN, then **Analyse**. The editor says what still stops a position being analysed (a missing king, a pawn on the back rank, the side not to move in check); the server refuses such positions too, so they never reach Stockfish. Rules live in `packages/core/src/setup.ts`.
- **Game review** (signed in; after a game → Review game, from game history or a profile, or from the analysis board): every move gets a badge on the moved piece's square, accuracy per side, eval graph, and the better move drawn on the board.

Reviews are graded on the device when **Review** is opened, never in the background after a game ends, so the phone does not heat up after every game. Leaving Review stops the engine, and it shuts down after a minute with nothing to do. Stockfish otherwise runs only on the analysis board and for bots rated 1320 and up, and only on the bot's turn. An online game's first review is saved in the database (`game_reviews` table, one per game), so opening it again, from any account, just fetches it, and its accuracy replaces the Review button on the result screen, in game history and on profile rows. Games against the computer and pass-and-play keep their reviews on the device.

**How deep reviews search.** A standard review searches every position to depth 10 and the positions around the moves that matter to depth 14 (`REVIEW_PLANS` in `apps/app/src/features/engine/localReview.ts`). A finished review has a **Deep review · depth 18–20** button: every position to depth 18, the ones that matter to depth 20, with longer time caps. It is a little more accurate (measured against Stockfish 16 at depth 24: 74% of moves in the same grade group at depth 10, 83% at 14, 87% at 18, 84% at 20; every setting from depth 14 up found every blunder) for about 6 times the time and battery, so it is on request, and on computers only: on phones (the app, or a browser on a touch screen) a Deep review took minutes and heated the phone, so phones always get the standard review and neither the button nor the setting shows. **Settings → Engine and game review** makes Deep the default on that computer.

**Full engine (web on computers).** The app ships Stockfish 19 *lite* (1.8 MB). On the web on a computer, **Settings → Engine and game review → Stockfish on this computer → Full** downloads the full Stockfish 19 (its big NNUE network, stronger at every depth, 99 MB) once into the browser's cache storage; reviews, Dig Deep and Stockfish bots then use it, two engines at a time since each needs about 100 MB more memory. Phones keep the lite engine. The web build adds it with `node apps/app/scripts/full-engine.mjs` (part of `pnpm build:web`), which copies it from the `stockfish` dev dependency in 20 MB parts, since Cloudflare Pages serves at most 25 MiB per file, and nothing large goes into git. To try it with `pnpm web`, run `node apps/app/scripts/full-engine.mjs public` once (git ignores the copy).

To try it: sign in with two accounts (one in a private window), play an online game between them, then tap **Review game** on one side. When grading finishes the button reads *Accuracy ○ 84.2 · ● 71.5*; open the other account's profile from the first one and its recent game shows the accuracy and opens the same review without grading again.

Move badges (logic in `packages/core/src/classify.ts` and `evaluation.ts`, visuals in `apps/app/src/components/MoveBadge.tsx`):

| Badge | Meaning |
| --- | --- |
| **!!!** Masterpiece (purple, crown) | A queen or rook sacrifice that leads to a forced mate. ChessMate's top tier. Any other sound sacrifice is !!. |
| **!!** Brilliant (teal, sparkles) | A sacrifice that pays off. The best (or near best) move gives away at least a minor piece's worth of material, and it leads to mate, gives the mover the advantage (about +1 or better), or wins the material back within a few moves. These count: a piece put or left where it can be taken (a piece left hanging counts when another move could have saved it), a piece offered that can't really be taken because taking it loses as much at once (it must give the advantage or mate), and the exchange: a rook for a minor piece, or a piece for two pawns. A sacrifice that only keeps the balance is not brilliant, and neither is one made when already winning easily (the engine's first and second choices both about +4.3 or better), unless it forces mate. Material that was lost whatever the mover played counts only when the move forces mate. |
| **!** Great (sapphire, target) | The only good move: the engine's second choice is clearly worse. Plain recaptures don't count. |
| Best Move (gold, star), Excellent (copper, check), Good (green, rising check) | Close to the engine's choice. |
| Theory (brown, book), Forced (slate, arrow) | A known opening move; the only legal move. |
| **?!** Inaccuracy (yellow), **?** Mistake (orange, cross), **??** Blunder (red, lightning) | Increasing loss of winning chances. |
| Missed Chance (steel blue, crossed arrows) | Your opponent just erred and the move let the chance slip. |

Badges are SVG medallions (`react-native-svg`): the full coin with its name, icon and symbol in the review, and a small white-edged coin (symbol or icon only) pinned to the moved piece on the board. Run `pnpm install` after pulling, since `react-native-svg` is new.

To try them: open the analysis board, import `1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5`, and step through it (5. Nxe5 is brilliant: the queen is offered, and Bxd1 loses to Bxf7+ Ke7 Nd5#). For the !!! (Masterpiece) badge, import the FEN `5r1k/6pp/7N/3Q4/8/8/6PP/6K1 w - - 0 1`, play Qg8+, Rxg8, Nf7#, and press **Review game**.

Engine help is refused while you have a live game, and for any position currently on the board in a live game.

Which Stockfish runs:

1. `STOCKFISH_PATH` set: that native binary (fastest; used by the Docker image).
2. Otherwise the `stockfish` npm package's WebAssembly build, run by a child Node process. This is installed by `pnpm install`, so nothing extra is needed for local development on Windows, macOS or Linux.

Optional settings: `ENGINE_WORKERS` (engine processes, default 1), `ENGINE_THREADS`, `ENGINE_HASH_MB`. The analysis board searches to depth 22 by default. For a stronger local engine, download Stockfish from stockfishchess.org and point `STOCKFISH_PATH` at it:

```powershell
$env:STOCKFISH_PATH = "C:\Tools\stockfish\stockfish-windows-x86-64-avx2.exe"
pnpm dev:server
```

### Dig Deep (opening explorer)

Home → **Dig Deep** (also in More): pick a position by playing moves on the board or tapping them in the list, and see every move played from it, how often, the engine's eval of each, and how the games ended (White / draw / Black bar). Three collections:

| Tab | Games | Where it comes from |
| --- | --- | --- |
| Lichess | Rated games on Lichess (billions), filtered by speed and average rating | Lichess opening explorer, fetched by our server |
| Masters | Over-the-board games of players rated 2200+ (millions) | Lichess opening explorer (masters database) |
| ChessMate | Games finished on ChessMate, first 30 plies, standard start | Counted by our server as games finish (`explorer_moves` table); older games are counted once in the background after the first start |

The app only talks to our server (`GET /api/explorer`). The server asks Lichess one request at a time (pausing a minute after a 429, as Lichess asks), keeps every answer in memory and in Postgres (`explorer_cache`, kept fresh 7 days for Lichess and 30 for masters, older ones pruned), and serves the stored copy if Lichess is down. So each position is fetched once for everyone, and the server's load is a cached lookup. Engine evals for the listed moves run on the player's device (depth 12), not on the server.

Lichess's explorer needs a token since 2025: create a free personal token at [lichess.org/account/oauth/token](https://lichess.org/account/oauth/token) (no scopes needed) and set it as `LICHESS_TOKEN` (`fly secrets set LICHESS_TOKEN=lip_…`). Without it the Lichess and Masters tabs say they are not connected and the ChessMate tab still works. `LICHESS_EXPLORER_URL` points at a self-hosted [lila-openingexplorer](https://github.com/lichess-org/lila-openingexplorer) instead.

Dig Deep also feeds game review: a move is graded **Book** while each move so far was played in at least 10 master games from its position and at least 1% of them (`THEORY_RULE` in `packages/core/src/explorer.ts`), on top of the named openings. The app asks `GET /api/explorer/theory?moves=…` while it reviews, and the server uses the same answer when it saves a review, so both agree. If Lichess can't be reached, reviews fall back to the named openings alone. Links open a line directly: `/dig-deep?moves=e2e4,c7c5`.

### Game history

Home → **Game history** lists finished online games, practice games (saved when they end, or with "Save to history") and imported PGNs. They are stored on the device, so history works offline and for guests. Open a game to replay it: tap any move, use the arrow buttons (or ←/→, Home/End, F to flip on web), or press ▶▶ to play it through. Each game can be shared as PGN (share sheet on phones, download or copy on web), and **Import PGN** accepts pasted text or a `.pgn` file on web.

Opening names come from `packages/core/data/*.tsv` (lichess-org/chess-openings, CC0). After changing those files, run `node packages/core/scripts/build-openings.mjs` to regenerate `src/openings-data.ts`.

### Sharing a game

Every board has a **Share** button in its header (play, watch, broadcasts, review, analysis and replays) with **Copy PGN** and **Share link** (the share sheet on phones and tablets, a copied link in desktop browsers; where the browser blocks the clipboard, the text is shown to copy by hand). Links follow the same host rules as invite links (`EXPO_PUBLIC_WEB_URL`, below):

| Board | Link |
| --- | --- |
| Online game, live | `/watch/<id>` (spectate); the PGN unlocks when the game ends |
| Online game, finished (replays, results) | `/game/<id>`; from its review, `/game/<id>?review=1` |
| Review of any other game | `/review?moves=…&white=…&black=…&result=…` |
| Broadcast game | `/watch/game/<id>` |
| Computer, practice, over-the-board, imported games, analysis | `/analysis?moves=e2e4,e7e5&initialFen=…&ply=…`: the moves travel in the link, nothing is stored |

Aborted and Secret Queen games are not shared once over (the server keeps neither as a replayable game).

## Playing online

Open **Play** (`/play`, or "Open the lobby" on the home screen):

- **Quick pairing.** Pick a time control (bullet to classical, or a custom minutes + increment), casual or rated, and an opponent rating window. *Auto* starts at ±100 and widens about 20 points a second, then opens to anyone after 45 seconds; ±100/±200/±400 keep it fixed. The search card shows the live window and how many others are searching.
- **Custom games.** Post a game to the lobby with your side (white, black or random). Everyone in the lobby sees it under *Open games* and can join.
- **Rated vs casual.** Signed-in players start on *Rated* (the Mode switch in the lobby turns it to *Casual*); quick pairing from the home screen is rated too. Every finished rated game of two or more moves updates both players' Elo (Glicko-2) right away, and the new rating survives server restarts (it is reloaded from the database on start). Guests always play casual.
- **Premoves.** While your opponent is thinking, tap a piece and a square to queue a move (tinted blue). It plays instantly if it is legal after their reply; tap anywhere else to cancel.
- **Sounds** for moves, captures, checks, game start, and a win or loss at the end (original set in `apps/app/assets/sounds`: wooden pieces on a wooden board modelled by `node apps/app/scripts/synth-wood.mjs`; win and lose by `synth-sounds.mjs`).
- **Reconnect and resume.** One connection serves the whole app and reconnects on its own. Guests get a resume token, so a dropped connection or a page reload puts you back in your game. If your opponent drops, you see a countdown: they forfeit after 60 seconds (or the game is aborted if fewer than two moves were played).
- **Game over** plays a short animation, then shows the result card: a *Checkmate* stamp when the game ends in mate, monochrome confetti and a fanfare for the winner, and a calm dim with an encouraging line and a **Learn from this game** button for the loser. The card shows your new rating with the +/- change, or says why the game was unrated (casual, guest, too short). Then Rematch (colours swap), New game, and Lobby. Animations follow the system "reduce motion" setting.

To try two players on one computer, open the lobby in two browser windows (one normal, one private), create a game in one and join it from the other.

## Trying it on your own devices

### Phone on the same Wi-Fi (Expo Go)

1. Start the server: `pnpm dev:server`. It prints the address phones should use, e.g. `Phones on the same Wi-Fi reach this server at http://192.168.0.240:8787`.
2. Start Expo: `pnpm dev:app` (plain LAN mode; no `--tunnel` needed on the same Wi-Fi).
3. Scan the QR code with Expo Go (Android) or the Camera app (iOS).

Play vs computer and the practice board work without the game server.

The app finds the game server automatically, on port 8787 of the computer running Expo. Even with `--tunnel` it uses your computer's Wi-Fi address (read when Expo starts), so a phone on the same Wi-Fi still reaches the server.

**If sign-in or sign-up says "Can't reach ChessMate"** (in development the message shows the address it tried):

1. Open `http://<your-computer-ip>:8787/api/stats` in the phone's browser (the address `pnpm dev:server` printed). If it doesn't load, the phone can't reach the server.
2. Windows Firewall is the usual cause. The firewall allows programs by path, and Node installed through nvm-windows (`C:\nvm4w\nodejs\node.exe`) is a different path from the official installer's. In PowerShell **as Administrator**:

   ```powershell
   New-NetFirewallRule -DisplayName "Node.js (nvm) dev" -Direction Inbound -Program (Get-Command node).Source -Action Allow -Profile Private
   ```

   Also check the Wi-Fi is a **Private** network (Settings → Network & internet → Wi-Fi → your network → Private), since the rule above only covers private networks.
3. Some routers isolate Wi-Fi devices from each other (guest networks, "AP isolation"). Use the main network, not a guest one.

**If Expo stops with `EMFILE: too many open files`**: Metro must not watch folders that change while the server runs. `apps/app/metro.config.js` keeps it away from `.data/` (the dev database) and `.ruv-swarm/`. If you add another folder that changes at runtime, add it to that block list, then restart with `pnpm dev:app --clear`.

### Phone on another network (tunnel)

`pnpm dev:app --tunnel` makes the bundle reachable from anywhere, but the game server is still only on your network. On another network, point the app at a server the phone can reach:

```powershell
# Windows PowerShell
$env:EXPO_PUBLIC_SERVER_URL = "wss://your-host/ws"
pnpm dev:app --tunnel
```

```bash
# macOS / Linux
EXPO_PUBLIC_SERVER_URL=wss://your-host/ws pnpm dev:app --tunnel
```

A deployed server works the same way: `EXPO_PUBLIC_SERVER_URL=wss://your-host/ws`.

### Playing a friend and invite links

- **Challenge a friend** (home screen) creates an invite link, or sends a direct challenge to a player ID. Pick the time control, your colour (white, black or random) and rated (accounts only).
- Invite links look like `<web address>/challenge/<id>`. The same path works as a deep link: `chessmate://challenge/<id>` in installed builds, and `exp://<your-computer-ip>:8081/--/challenge/<id>` in Expo Go. Pasting any of these into a browser or tapping them on a phone opens the invite.
- Try it locally: open `http://localhost:8081` (press `w` in Expo), choose Challenge a friend, create a link, then open that link in a second browser window or a private window and accept.
- Set `EXPO_PUBLIC_WEB_URL=https://your-web-host` so shared links point at the public web app instead of the local address. Opening those https links straight in the installed app (iOS universal links, Android app links) also needs the domain added to `app.json` (`ios.associatedDomains`, `android.intentFilters`) and the matching `apple-app-site-association` / `assetlinks.json` files hosted on that domain.
- **Over the board** (home screen) is two players on one device, offline, with an optional chess clock and a face-to-face layout for a phone or tablet lying between the players.
### In-game chat and moderation

Chat appears under the board once a game starts: quick messages, free text (profanity is masked by the server), Mute and Report for the opponent, and a Chat on/off switch.

Reports, mutes and every other staff tool live in the admin console (next section). To try chat and reports alone, open two browser windows on Play online, start a game, and chat or report between them.

### Admin console

Staff accounts manage ChessMate at `/admin` in the app (on web: http://localhost:8081/admin). Signed-in staff also get an **Admin console** link in the sidebar and in Settings. There are two staff roles:

- **Moderator**: dashboard, player search and records, warnings, chat mutes, renames, staff notes, the reports queue, fair-play reviews (open and dismiss cases), title applications, game lookup and the audit log.
- **Admin**: everything a moderator can do, plus emails, closing and reopening accounts, closing for fair play (which refunds the cheater's opponents and removes their title), rating adjustments, setting or removing titles and role tags, aborting live games, signing a player out everywhere, giving or taking away staff roles, and adding online bots for play vs computer (`/admin/bots`).

Every staff action is written to the audit log with who did it and why.

**Make your own account an admin.** Pick one of these:

1. Put your username in `.env` at the repository root (create it from `.env.example`) and restart the server:

   ```
   ADMIN_USERNAMES=ahmad
   ```

   Several names are comma-separated. The account becomes an admin when the server starts, or the moment it signs up if it does not exist yet.

2. Or run the grant command once. With the built-in database (`.data/pglite`), stop `pnpm dev:server` first, because only one process can open that database:

   ```bash
   pnpm admin:grant ahmad          # admin
   pnpm admin:grant leo moderator  # moderator
   pnpm admin:grant leo user       # back to a normal account
   ```

Then sign in to the app with that account and open `/admin`. If you were already signed in, sign out and back in once so the app picks up the new role.

**Verified titles.** Players apply for a FIDE title (GM, IM, FM, CM, WGM, WIM, WFM, WCM) in **Settings → Verified title**, with up to three proof files (PDF, PNG, JPEG or WebP, 3 MB each). Staff review them under **Titles** in the console: open the files, check the FIDE profile, then approve or reject with a reason the player reads. Approved titles show next to the player's name on their profile and in the console. Admins can also set or remove a title from a player's record (for example after a fair-play violation), and closing an account for fair play removes its title automatically. Proof files are stored in the database and open only through short-lived links from the console.

**Role tags.** Admins can give a player one official tag from their record in the console (**Set tag**): ChessMate staff, Moderator, Streamer, Coach, Arbiter, Content creator or Ambassador. The tag shows as a small black-and-white seal next to the player's name on the game screen (with the title, profile picture and flag) and on their profile, and the player gets a notification. Moderators cannot set tags, players cannot pick these themselves, and closing an account for fair play removes the tag automatically. To try it: make your account an admin (below), open **Admin → Players**, pick an account, press **Set tag**, then start a game against that account and look at its player card.

**Reporting from a game.** In an online game, the **More** button (now the first button under the board) has **Report <name>** at the bottom of its menu. It opens the same report sheet as the chat's flag button, and the report includes the game's moves and chat for moderators.

Account closures, warnings, mutes, reports, titles, role tags and fair-play cases are all kept in the database, so they survive a server restart.

The older token-only APIs still work for scripts: `ADMIN_TOKEN` for the reports API under `/admin/` and `FAIRPLAY_ADMIN_TOKEN` for `/admin/fairplay/*` (see [docs/fair-play.md](docs/fair-play.md)).
### Accounts and sign-in

`pnpm dev:server` also serves the accounts API (`/api/auth/*`) on the same port, and the app finds it automatically the same way it finds the game server. To point the app at a different API host, set `EXPO_PUBLIC_API_URL` (for example `http://192.168.1.20:8787`), alongside `EXPO_PUBLIC_SERVER_URL` when using a tunnel.

- First launch opens the welcome screen: create an account, sign in, or continue as a guest (casual games and the practice board).
- Sessions are kept in the iOS Keychain / Android Keystore (`expo-secure-store`); on web they are kept in the browser's local storage.
- Password reset: there is no email provider in development, so the reset link is printed in the server's terminal. Open it on the device (`chessmate://reset-password?token=...`) or in the browser (`http://localhost:8081/reset-password?token=...`).

**Sign in with Apple and Google.** The buttons appear on the welcome, sign-in and sign-up screens wherever they can work. Setup steps, and where to put the IDs: [docs/sign-in-with-google-and-apple.md](docs/sign-in-with-google-and-apple.md).

| Where | Apple | Google |
| --- | --- | --- |
| Expo Go on iPhone | Works with no setup | Not possible in Expo Go (shows a note) |
| Expo Go on Android | Not offered (Apple's button is iOS only) | Not possible in Expo Go (shows a note) |
| Web (`http://localhost:8081`) | Not offered | Works once the Google client IDs are set |
| Installed builds (EAS) | Works (needs the Apple Developer account) | Works once the Google client IDs are set |

Accounts made with Apple or Google have no password; **Settings → Set a password** adds one. Signing in with Google or Apple using an email that already has a ChessMate account signs into that account.

**Settings files.** `pnpm dev:server` reads a `.env` file at the repo root, and Expo reads `apps/app/.env` (only `EXPO_PUBLIC_*` values reach the app). Both are git-ignored; restart the server, and Expo with `pnpm dev:app --clear`, after changing them.

### Notifications

The bell in the header opens the inbox; **Settings** there picks which alerts arrive in the app and as push, plus quiet hours.

- **Inbox and settings** work everywhere (web, Expo Go, builds) as soon as `pnpm dev:server` is running.
- **Push on iPhone**: works in Expo Go. Open Notification settings, tap **Turn on push** and allow. To see one arrive, send yourself a friend request or challenge from a second account (another browser tab works): a system banner appears and the bell badge updates. There is no test button in the app; development servers still accept `POST /api/notifications/test` with your access token for scripted checks.
- **Push on Android**: Expo Go cannot receive push (Expo removed it in SDK 53). It needs a development or preview build with Firebase credentials (`google-services.json`); see [docs/PUSH_NOTIFICATIONS.md](docs/PUSH_NOTIFICATIONS.md).
- Push goes through Expo's push service. Store builds need an APNs key (iPhone) and an FCM V1 key (Android) uploaded to Expo; the steps are in [docs/PUSH_NOTIFICATIONS.md](docs/PUSH_NOTIFICATIONS.md). Set `EXPO_ACCESS_TOKEN` on the server only if "enhanced push security" is turned on for the Expo project.
- **Admin → Notifications** sends push campaigns now, on a schedule, or as triggers on what players do, and shows push health (devices, delivery receipts, credential errors).

### Testing on many devices at once

The development server (`pnpm web`, Metro) reloads on every change, but on Windows it
runs out of open files ("EMFILE: too many open files") when several devices are
connected. To try the app on many phones and computers on the same network:

1. Start the game server: `pnpm dev:server`.
2. Build and serve the web app: `pnpm web:lan`. It prints the address to open on the
   other devices, for example `http://192.168.1.20:8080`. Nothing is watched, so any
   number of devices can use it.
3. After changing code, run `pnpm web:lan` again (or `pnpm web:serve` to serve the last
   build without rebuilding).

Leave `EXPO_PUBLIC_SERVER_URL` unset for this: the app then finds the game server on the
same address. Allow Node.js through Windows Firewall on private networks if the other
devices can't connect. Google sign-in only works on `http://localhost`.

### Moving pieces, premoves, sounds and vibration

Run `pnpm install` after pulling: this adds `expo-haptics` (bundled in Expo Go, so no build is needed).

- **Drag and drop** works on every board next to tap-to-move: press a piece and drag it to a square. A quick tap still selects, and dropping on an illegal square snaps the piece back. On a phone, try it in Expo Go; on the web, with the mouse or a touch screen.
- **Premoves**: in an online game, tap or drag one of your pieces while your opponent is thinking. The squares turn blue and the move plays the moment they move. Tap elsewhere, right-click (web) or press **Cancel premove** to drop it. Turn premoves off under **Settings → Gameplay**.
- **Sounds**: move, capture, check, castle, promotion, game start and end, and a low-time warning (online games, once per game). All sounds are made in-house: `node apps/app/scripts/synth-wood.mjs` models wooden pieces on a wooden board (several takes per move sound), `synth-sounds.mjs` makes the win and lose cues. Every board sounds its moves, including analysis, puzzles, reviews, replays and broadcasts; thumbnails stay quiet. **Settings → Sound** has the master switch, volume and per-type toggles. On phones, the iPhone silent switch (or Android in silent or vibrate mode) mutes game sounds by default; turn on **Play sounds on silent** to hear them anyway. An illegal move (a piece dropped or tapped onto a square it cannot go to) plays a soft thud. Sounds mix over your music instead of stopping it. Win and loss cues play against the computer and online; other local games play the neutral end chime.
- **Vibration** (phones only): a light tap on your moves, a firmer one on captures and checks, and a buzz on an illegal drop, low time and game end. Toggle it under **Settings → Sound and vibration**.

### Trying friends and spectating

The server keeps friends, follows, blocks and the activity feed in the database (embedded Postgres by default, nothing to install), and the app's Friends screen is on the home page.

1. `pnpm dev:server` and `pnpm dev:app` as above.
2. Open the app on two devices (or two browser windows, one in a private window). On each, open **Friends** and pick a different test username. Until sign-in lands, development builds use these test accounts.
3. On one, tap **Find players**, search the other name and tap **Add friend**. Accept it under **Requests** on the other.
4. Start an online game on one device: the other shows the friend as "Playing now" with a **Watch** button that opens the live board.

The social API lives under `/api/social/*` on the game server (see `apps/server/src/social/http.ts` for the routes).

### Builds (uses EAS build quota)

Cloud builds count against the Expo account's build quota, so they only run when started on purpose:

- Simulator builds: run the "EAS simulator build" GitHub workflow, or add the `simulator-build` label to a PR.
- Installable preview builds: `npx eas-cli@latest build --profile preview --platform all`.

### Puzzles

The server ships with about 20,700 well-tested puzzles from the Lichess puzzle database (CC0; popularity 80+, 300+ plays, ratings about 600 to 2700) in `apps/server/data/puzzles-lichess.csv.gz`, plus 14 original starter puzzles. They are loaded into `apps/server/data/puzzles.db` the first time the server starts (about a minute, once). Puzzles come in random order and players don't see the same puzzle again soon (the last 500 for signed-in players, the last 300 on the device for guests). For the full collection, import the whole Lichess puzzle database (millions of puzzles):

```bash
pnpm puzzles:import                                  # downloads lichess_db_puzzle.csv.zst (~250 MB) and imports it
pnpm puzzles:import C:\Downloads\lichess_db_puzzle.csv.zst   # or a file you downloaded yourself (.zst, .gz or .csv)
pnpm puzzles:import --limit 100000                   # quicker partial import for development
```

By default it keeps well-tested puzzles (popularity 50+, 100+ plays, rating deviation 100 or less); change with `--min-popularity`, `--min-plays`, `--max-rd`. Re-running is safe (puzzles are updated by id). Restart `pnpm dev:server` afterwards. Set `PUZZLE_DB` to store the database elsewhere.

In the app, open **Puzzles** on the home screen: your rating and records, rated training, streak (one mistake ends it), rush (3 minutes, 3 lives), the daily puzzle, and themes (one tap starts training on a theme). Puzzle screens are left with the back button only, so dragging a piece near the edge never swipes the puzzle away.

### Lessons

The **Learn** tab has 15 free lessons in four chapters (tactics, checkmate patterns, endgames, openings). Each lesson explains one idea on a few example positions, with arrows and marked squares, then practises it on three real puzzles, and ends with a link to more puzzles on that theme in the trainer and further reading on Wikipedia. Lessons need no account and work offline, and progress is kept on the device.

**Adding lessons without an app release.** Staff write and edit lessons in the admin console (**Lessons**, permission `lessons.manage`, moderators and admins). The server keeps them in the database (`lesson_chapters`, `lessons`) and serves the published ones at `GET /api/lessons` (with an ETag, so unchanged catalogs cost a 304). The app asks for it when the Learn tab opens (at most every 10 minutes), keeps the last copy for offline use, and shows the lessons built into the app until the first answer arrives.

- The console editor has live boards: paste a FEN, type arrows (`e2e4 c6e5:attack d1d8:defend`) and marked squares (`e4 d5`), and pick practice puzzles by theme and rating from the server's puzzle set (or type a puzzle id). Lessons can be saved as drafts, which players do not see, and chapters and lessons can be reordered.
- The server checks every save (legal positions, real squares, a known puzzle theme, https links, length limits; `packages/core/src/lessons/validate.ts`) and copies each chosen puzzle into the lesson, so the app needs no extra request. Saves are written to the audit log.
- Admin API: `GET /api/admin/lessons`, `POST /api/admin/lessons` (create), `POST /api/admin/lessons/:id` (save), `/:id/delete`, `/:id/move`, `POST /api/admin/lesson-chapters` (create or save), `/:id/delete` (empty chapters only), `/:id/move`, and `GET /api/admin/lesson-puzzles?theme=&rating=` or `?id=`.
- On first start the database is filled from the built-in lessons below; after that the database is the source.
- Built-in lessons live in `packages/core/src/lessons/lessons.ts`. The explanations are ChessMate's own writing; tests in `packages/core/test/lessons.test.ts` check every position and every claim the text makes about a move (the mates are mate, the fork attacks both pieces, and so on).
- Practice puzzles come from the bundled Lichess puzzle database extract (CC0). `node packages/core/scripts/build-lesson-puzzles.mjs` picks three per lesson (easy, medium, harder) and writes `src/lessons/puzzles.ts`; each puzzle links back to Lichess.
- Read-more links point to Wikipedia (CC BY-SA 4.0); nothing is copied from it. Lichess's own Learn and Practice content is AGPL, so it is not used (see Licensing above).
- Lesson texts are English for now; the screens around them are translated.

### Web

`pnpm build:web` produces a static site in `apps/app/dist`. Set `EXPO_PUBLIC_SERVER_URL=wss://.../ws` when building for a public host.

### Production-like server (Docker)

`docker compose --profile server up -d --build` runs Postgres plus the server image (with Stockfish) on port 8787. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## HTTP API

The game server also serves read-only JSON on the same port (8787), with CORS open for the web app:

| Endpoint | What it returns |
| --- | --- |
| `GET /api/stats` | Players online, games in progress, players looking for a game (shown live on the home screen, refreshed every 15 s) |
| `GET /api/explorer?source=lichess\|masters\|chessmate&fen=…` | Dig Deep: moves played from a position with their results (`speeds=blitz,rapid` and `ratings=1600,1800` filter the Lichess collection). See [Dig Deep](#dig-deep-opening-explorer) |
| `GET /api/explorer/theory?moves=e2e4,c7c5,…` | How many opening moves are theory by the masters' games (Book grades in reviews) |
| `GET /api/leaderboard?category=blitz&scope=global` | Ranked players for `bullet`, `blitz`, `rapid` or `classical`. `scope` is `global`, `country` (add `country=US`, or it uses the viewer's profile country) or `friends` (needs `Authorization: Bearer <session token>`). Paged with `limit` (max 100) and `offset`; `you` holds the viewer's own rank. |

Global and country boards list players with at least one rated game and a settled rating (RD 150 or less), so a lucky first game cannot top the list; friends boards include provisional players. Equal rounded ratings share a rank. Boards are read from the database (`DbLeaderboardSource` over `users`, `ratings` and accepted `friendships`); with `CHESSMATE_DB=off` they rank the in-memory players instead. To try the leaderboard locally, play a few rated games with `dev:<id>:<name>` tokens; guests are never ranked.

## Fair play

Server-side move validation, rate limiting, Stockfish-based cheat flagging, a moderator review queue and bans with rating refunds. Analysis is optional locally: set `STOCKFISH_PATH` to turn it on. See [docs/fair-play.md](docs/fair-play.md).

## Profiles and settings

Screens: `/profile` (your profile), `/profile/<username>`, `/profile/edit`, `/settings`. The home screen links to Profile and Settings.

REST API on the game server (port 8787), bearer token auth:

| Route | What it does |
| --- | --- |
| `GET /api/profiles/:username` | Public profile: avatar, bio, country, ratings per time control, W/D/L, last 10 games (respects privacy settings) |
| `GET /api/profiles/:username/rating-history?category=blitz` | Rating after each rated game, for the graph |
| `GET` / `PATCH /api/me/profile` | Own profile plus email; edit display name, bio, country, avatar |
| `GET` / `PATCH /api/me/settings` | Board theme and pieces, sound, move confirmation, notifications, privacy (partial updates, validated) |
| `POST /api/me/password` | Change password |
| `POST /api/me/delete` | Delete account (password required) |

Shared types and validation live in `packages/core/src/profile.ts`; server code in `apps/server/src/profiles/`.

**Trying it:** sign in (or create an account), then open the Profile tab. Board theme, piece set, coordinates and move confirmation apply to the boards straight away. In development the seeded `demo` player (120 sample games) is still available at `/profile/demo` for trying public profiles.

## Roadmap

1. Accounts and persistence (Postgres for players, games and ratings; signed session tokens in place of guest tokens).
2. Engine service: Stockfish workers behind a queue for post-game review and evaluation bar.
3. Promotion picker, drag-to-move, premoves, sounds, original piece set.
4. Openings from the CC0 Lichess databases (puzzles are in).
5. Horizontal scaling of the game server (route by game id, Redis pub/sub), anti-cheat signals.
