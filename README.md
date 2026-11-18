# ChessMate

Online chess platform for web, iOS and Android: real-time games against other players, engine evaluation, move feedback with threat detection, and an AI coach.

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
| `coach.ts` | Structured prompt for the AI coach plus deterministic quick feedback |
| `bot/` | ChessMate's own small engine (alpha-beta, written for this repo) and the eight computer opponents for unrated play |
| `review.ts` | Engine analysis interface for the coach, game review facts, offline review ([docs/coach.md](docs/coach.md)) |
| `analysis.ts` | Engine lines for display, FEN/PGN import, per-move game review (`buildReview`) and coach context (`coachContextFor`) |
| `openings.ts` | Opening name and ECO detection by position (handles transpositions), from the CC0 Lichess opening tables |
| `pgn.ts` | PGN export (single or many games) and import (multi-game files, comments and variations skipped) |
| `archive.ts` | Archived game model, filters (result, colour, time control, source, opening, text, dates) and stats |
| `puzzle.ts` | Puzzle CSV parsing, solving and hints, server-side grading, puzzle rating, streak/rush ladders, theme labels |

### Design decisions

- **One Expo app for all three platforms** (Expo Router, React Native Web). Shared UI, shared logic.
- **Server is authoritative.** Clients send moves with the ply they expect; the server validates, runs the clocks and broadcasts. Clients play moves optimistically and resync on rejection.
- **Engine and coach run server-side** so live games cannot be assisted from the client. The practice board's threat hints run on device because they are not engine strength.
- **Play vs computer runs on device** with ChessMate's own lightweight engine (`packages/core/src/bot`), so it works offline and costs no server time. Games against bots are unrated, so on-device strength is fine. Eight levels, from Pip (~400) to Monolith (~2200), weaken by search depth, score noise and occasional careless moves.
- **Licensing.** Only permissively licensed dependencies ship in the app (chess.js is BSD-2). Lichess databases (CC0) can be used for openings and puzzles; Lichess code (AGPL/GPL) must not be copied. Stockfish (GPL) runs as a separate server process, never bundled into the app.
- **Original look.** Monochrome, frosted-glass brand built around the ChessMate logo (queen and crowned knight); no assets taken from other chess sites.
- **Boards and pieces.** Players pick from 16 board themes and 8 piece sets in Settings > Board, saved to their account (or the device for guests) and used on every board. Piece artwork comes from openly licensed sets by their original authors (Apache 2.0, MIT, CC BY, CC BY-SA, CC0; never non-commercial or GPL art), plus ChessMate's own Glass set. Sources, credits and how to add a set: [apps/app/art/pieces/README.md](apps/app/art/pieces/README.md).

## Languages

The app is in English, Arabic and German. It follows the device language and can be changed under **Settings → Language** (or the chips at the bottom of the welcome screen). Arabic mirrors the layout right to left, except the chessboard, and uses IBM Plex Sans Arabic. On a phone, switching to or from Arabic restarts the app once. To add text to a screen, see [apps/app/src/i18n/README.md](apps/app/src/i18n/README.md).

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

The app opens on a welcome screen: create an account, sign in, or tap **Continue as guest**. Accounts are saved in the local database, so they survive restarts. If Expo shows an old screen or the old fonts after pulling, stop it and run `pnpm dev:app --clear`. Language support (`expo-localization` and the bundled Arabic font) works in Expo Go, so it needs no new build.

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

### AI coach

The coach works without setup using rule-based reviews. To turn on the AI coach, give the server a Claude API key before starting it:

```powershell
# Windows PowerShell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
pnpm dev:server
```

```bash
# macOS / Linux
ANTHROPIC_API_KEY=sk-ant-... pnpm dev:server
```

Then open the app and tap **Try a sample review** on the home screen. Details: [docs/coach.md](docs/coach.md).

## Engine analysis

The game server runs Stockfish as separate processes (UCI over stdin/stdout) and streams results over the same WebSocket as games. The app gets:

- **Analysis board** (home → Analysis board): move freely for both sides, step through the line, import a FEN or PGN, evaluation bar, top 1 or 3 engine lines with arrows. Tap a line to play its first move. Every move you play or step through gets a badge on the moved piece once the engine has seen the position before and after it (depth 12+).
- **Game review** (after an online game → Review game, or from the analysis board): every move gets a badge on the moved piece's square, accuracy per side, eval graph, and the better move drawn on the board.

Reviews are graded ahead of time and saved. When an online game ends the server grades it in the background (one game at a time, on one engine), and games against the computer or pass-and-play are sent to the server for grading as soon as they end. Finished reviews are stored in the database (`game_reviews` table, keyed by start position and moves), so tapping **Review game** just fetches them, even after a server restart. If you open Review before grading has finished, it joins the running job and speeds it up with every engine. Set `REVIEW_PRECOMPUTE=off` to grade only when Review is opened.

Move badges (logic in `packages/core/src/classify.ts` and `evaluation.ts`, visuals in `apps/app/src/components/MoveBadge.tsx`):

| Badge | Meaning |
| --- | --- |
| **!!!** Masterpiece (purple, crown) | A queen sacrifice that leads to a forced mate. ChessMate's top tier. Any other brilliant queen move is !!. |
| **!!** Brilliant (teal, sparkles) | A sound sacrifice: the best (or near best) move gives away at least a minor piece's worth of material and the position stays good. Not given when already winning easily. |
| **!** Great (sapphire, target) | The only good move: the engine's second choice is clearly worse. Plain recaptures don't count. |
| Best Move (gold, star), Excellent (copper, check), Good (green, rising check) | Close to the engine's choice. |
| Book Move (brown, book), Forced (slate, arrow) | A known opening move; the only legal move. |
| **?!** Inaccuracy (yellow), **?** Mistake (orange, cross), **??** Blunder (red, lightning) | Increasing loss of winning chances. |
| Missed Chance (steel blue, crossed arrows) | Your opponent just erred and the move let the chance slip. |

Badges are SVG medallions (`react-native-svg`): the full coin with its name, icon and symbol in the review, and a small white-edged coin (symbol or icon only) pinned to the moved piece on the board. Run `pnpm install` after pulling, since `react-native-svg` is new.

To try them: open the analysis board, import `1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7`, and step through it (6. Nxf7 is brilliant). For the !!! (Masterpiece) badge, import the FEN `5r1k/6pp/7N/3Q4/8/8/6PP/6K1 w - - 0 1`, play Qg8+, Rxg8, Nf7#, and press **Review game**.

Engine help is refused while you have a live game, and for any position currently on the board in a live game.

Which Stockfish runs:

1. `STOCKFISH_PATH` set: that native binary (fastest; used by the Docker image).
2. Otherwise the `stockfish` npm package's WebAssembly build, run by a child Node process. This is installed by `pnpm install`, so nothing extra is needed for local development on Windows, macOS or Linux.

Optional settings: `ENGINE_WORKERS` (engine processes, default 1), `ENGINE_THREADS`, `ENGINE_HASH_MB`, `REVIEW_DEPTH` (default 18) and `REVIEW_MOVETIME_MS` (default 800, per position). Reviews look at two engine lines per position (to spot only moves) and spread positions across all `ENGINE_WORKERS`, so more workers make reviews faster. The analysis board searches to depth 22 by default. For a stronger local engine, download Stockfish from stockfishchess.org and point `STOCKFISH_PATH` at it:

```powershell
$env:STOCKFISH_PATH = "C:\Tools\stockfish\stockfish-windows-x86-64-avx2.exe"
pnpm dev:server
```

### Game history

Home → **Game history** lists finished online games, practice games (saved when they end, or with "Save to history") and imported PGNs. They are stored on the device, so history works offline and for guests. Open a game to replay it: tap any move, use the arrow buttons (or ←/→, Home/End, F to flip on web), or press ▶▶ to play it through. Each game can be shared as PGN (share sheet on phones, download or copy on web), and **Import PGN** accepts pasted text or a `.pgn` file on web.

Opening names come from `packages/core/data/*.tsv` (lichess-org/chess-openings, CC0). After changing those files, run `node packages/core/scripts/build-openings.mjs` to regenerate `src/openings-data.ts`.

## Playing online

Open **Play** (`/play`, or "Open the lobby" on the home screen):

- **Quick pairing.** Pick a time control (bullet to classical, or a custom minutes + increment), casual or rated, and an opponent rating window. *Auto* starts at ±100 and widens about 20 points a second, then opens to anyone after 45 seconds; ±100/±200/±400 keep it fixed. The search card shows the live window and how many others are searching.
- **Custom games.** Post a game to the lobby with your side (white, black or random). Everyone in the lobby sees it under *Open games* and can join.
- **Rated vs casual.** Signed-in players start on *Rated* (the Mode switch in the lobby turns it to *Casual*); quick pairing from the home screen is rated too. Every finished rated game of two or more moves updates both players' Elo (Glicko-2) right away, and the new rating survives server restarts (it is reloaded from the database on start). Guests always play casual.
- **Premoves.** While your opponent is thinking, tap a piece and a square to queue a move (tinted blue). It plays instantly if it is legal after their reply; tap anywhere else to cancel.
- **Sounds** for moves, captures, checks, game start, and a win or loss at the end (original synthesised set in `apps/app/assets/sounds`, regenerate with `node apps/app/scripts/synth-sounds.mjs`).
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
- **Admin**: everything a moderator can do, plus emails, closing and reopening accounts, closing for fair play (which refunds the cheater's opponents and removes their title), rating adjustments, setting or removing titles and role tags, aborting live games, signing a player out everywhere, and giving or taking away staff roles.

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

**Telling players.** Warnings, account closures and reopenings reach the player three ways: an account notification in the app (or a message in their Messages inbox once that is wired), a push notification when the app is closed, and an email. In development the email is printed in the `pnpm dev:server` terminal (look for `[email]`); nothing is sent. To send real email, set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` and `EMAIL_FROM` in `.env`. Staff notes stay internal; players get a fixed, plain-language explanation.

**Fair-play closures keep sign-in.** An account closed for fair play can still sign in, read its notifications, review games, solve puzzles and play the computer, but online play (seeking, open games, challenges, rematches) is refused and every main screen shows a red *Fair play* banner. Other closures (abuse, multiple accounts...) still block sign-in. To try it: sign up two accounts, make one an admin, close the other under **Players → Close account → Fair play violation**, then sign in as that player.

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
- **Push on Android**: Expo Go cannot receive push (Expo removed it in SDK 53). It needs a development build with Firebase credentials (`google-services.json`), which uses EAS build quota, so it is not set up yet.
- Push goes through Expo's push service. Set `EXPO_ACCESS_TOKEN` on the server only if "enhanced push security" is turned on for the Expo project.

### Moving pieces, premoves, sounds and vibration

Run `pnpm install` after pulling: this adds `expo-haptics` (bundled in Expo Go, so no build is needed).

- **Drag and drop** works on every board next to tap-to-move: press a piece and drag it to a square. A quick tap still selects, and dropping on an illegal square snaps the piece back. On a phone, try it in Expo Go; on the web, with the mouse or a touch screen.
- **Premoves**: in an online game, tap or drag one of your pieces while your opponent is thinking. The squares turn blue and the move plays the moment they move. Tap elsewhere, right-click (web) or press **Cancel premove** to drop it. Turn premoves off under **Settings → Gameplay**.
- **Sounds**: move, capture, check, castle, promotion, game start and end, and a low-time warning (online games, once per game). All sounds are synthesised in-house; `node apps/app/scripts/synth-sounds.mjs` regenerates the castle, promote and low-time cues. **Settings → Sound** has the master switch, volume and per-type toggles. Phones in silent mode stay quiet.
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

A fresh checkout has 14 original starter puzzles, loaded automatically into `apps/server/data/puzzles.db` the first time the server starts. For the real collection, import the Lichess puzzle database (CC0, about 5 million puzzles):

```bash
pnpm puzzles:import                                  # downloads lichess_db_puzzle.csv.zst (~250 MB) and imports it
pnpm puzzles:import C:\Downloads\lichess_db_puzzle.csv.zst   # or a file you downloaded yourself (.zst, .gz or .csv)
pnpm puzzles:import --limit 100000                   # quicker partial import for development
```

By default it keeps well-tested puzzles (popularity 50+, 100+ plays, rating deviation 100 or less); change with `--min-popularity`, `--min-plays`, `--max-rd`. Re-running is safe (puzzles are updated by id). Restart `pnpm dev:server` afterwards. Set `PUZZLE_DB` to store the database elsewhere.

In the app, open **Puzzles** on the home screen: daily puzzle, rated training with a theme filter and hints, streak (one mistake ends it) and rush (3 minutes, 3 lives).

### Web

`pnpm build:web` produces a static site in `apps/app/dist`. Set `EXPO_PUBLIC_SERVER_URL=wss://.../ws` when building for a public host.

### Production-like server (Docker)

`docker compose --profile server up -d --build` runs Postgres plus the server image (with Stockfish) on port 8787. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## HTTP API

The game server also serves read-only JSON on the same port (8787), with CORS open for the web app:

| Endpoint | What it returns |
| --- | --- |
| `GET /api/stats` | Players online, games in progress, players looking for a game (shown live on the home screen, refreshed every 15 s) |
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
3. AI coach: game review and position chat are in (see docs/coach.md); next, open reviews from finished games once the engine service lands.
4. Promotion picker, drag-to-move, premoves, sounds, original piece set.
5. Openings from the CC0 Lichess databases (puzzles are in).
6. Horizontal scaling of the game server (route by game id, Redis pub/sub), anti-cheat signals.
2. AI coach: game review that explains each mistake, using the structured context from `coach.ts`.
3. Promotion picker, drag-to-move, premoves, sounds, original piece set.
4. Puzzles and openings from the CC0 Lichess databases.
5. Horizontal scaling of the game server (route by game id, Redis pub/sub), anti-cheat signals.
