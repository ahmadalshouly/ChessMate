# Analytics

ChessMate measures how it is used in two places at once:

| Where | What it shows | Who is counted |
| --- | --- | --- |
| **Admin → Analytics** (`/admin/analytics`, admins only) | Active players, sign-ups, games, puzzles, reviews, retention, sign-up methods, speeds, openings, countries, sponsor views; plus app usage: devices, visits, screens, events, funnel, platforms, versions, languages and a live list of the latest events | Database facts: **every** player. App usage: visitors who allowed analytics |
| **Google Analytics** (GA4 on the website, Firebase Analytics in the iOS and Android apps) | The same app events, with Google's reports (audiences, realtime, explorations, demographics by region) | Visitors who allowed analytics |

The admin page works without any Google setup. Google Analytics is extra.

## Consent (GDPR, § 25 TDDDG)

Nothing optional runs before the visitor chooses. The first-visit notice
(`CookieBanner`) now shows on the web **and in the apps**, with "Only necessary"
and "Accept all" side by side. Settings → Privacy → Cookies has an **Analytics**
switch. `CONSENT_VERSION` went from 1 to 2, so everyone is asked once more.

- Off (the default): no event is recorded, nothing is sent, no analytics id is stored.
- On: the app makes a random device id, sends events to our server and to Google.
- Switched off again: sending stops at once, GA cookies are deleted (web), Firebase
  collection is switched off and its id reset (apps), and our server deletes every
  event that device sent (`POST /api/events/forget`).

Google is set to the strictest settings: Consent Mode with ad storage, ad user
data and ad personalisation denied; Google signals off; no advertising id on
Android or iOS (so no App Tracking Transparency prompt); Firebase collection off
by default in `apps/app/firebase.json`. Events never carry names, emails, messages
or moves; screens are route patterns (`/game/[id]`), never ids.

The cookie policy (`/cookies`) and privacy page describe this in all 13 languages.
**Before launch, add Google as a processor in your privacy policy / imprint and sign
Google's data processing terms** in Google Analytics (Admin → Account settings →
Data processing terms). Set data retention to 14 months in GA (Admin → Data
collection → Data retention).

## Events

The closed list is `ANALYTICS_EVENTS` in `packages/core/src/analytics.ts`:
`app_open`, `screen_view`, `sign_up`, `login`, `logout`, `game_start`, `game_end`,
`computer_game_start`, `review_open`, `puzzle_attempt`, `lesson_open`, `share`,
`tournament_join`, `sponsor_click`, `donate_start`, `language_change`.

To add one:

1. Add the name to `ANALYTICS_EVENTS` (snake_case, at most 40 characters, not a
   Firebase reserved name; `packages/core/test/analytics.test.ts` checks this).
2. Call `track('your_event', { small: 'props' })` from `@/lib/analytics`.
3. Add its label under `admin.analytics.eventName` in `en`, `ar` and `de` `admin.ts`.

Screens are tracked automatically from Expo Router (`AnalyticsBridge` in `_layout.tsx`).

## Our own events (server)

- `POST /api/events` takes batches from the app (`AnalyticsBatch`), keeps them in
  `analytics_events` (migration `0029_analytics`, runs at server start), links the
  account when the app sends its sign-in token, and limits each address to 240
  events a minute.
- Events older than 400 days are deleted daily.
- `GET /api/admin/analytics?days=7|30|90` builds the report (permission
  `analytics.view`, admins only), cached for a minute.

## Setting up Google Analytics

### 1. Firebase project (already exists for push)

The Firebase project behind `apps/app/google-services.json` is the one to use.
In the [Firebase console](https://console.firebase.google.com/) → Project settings
→ Integrations → **Google Analytics → Enable**, pick or create a GA account, and
choose your country (Germany). This links a GA4 property to Firebase.

### 2. Android

Nothing else to download: the Android app already in the project picks up
Analytics with the same `google-services.json`. Make a new Android build
(`npx eas-cli@latest build -p android`).

### 3. iPhone

1. Firebase console → Project settings → **Add app → iOS**, bundle ID `com.chessmate.app`.
2. Download **GoogleService-Info.plist**.
3. Either put it at `apps/app/GoogleService-Info.plist`, or upload it as an EAS file
   variable: `npx eas-cli@latest env:create --name GOOGLE_SERVICE_INFO_PLIST --type file --value ./GoogleService-Info.plist --visibility sensitive`.
4. Make a new iOS build (`npx eas-cli@latest build -p ios`). With the plist, the
   build switches to static frameworks (React Native Firebase needs them); without
   it, Firebase is left out of the iOS build completely.

### 4. Website

1. In Google Analytics → Admin → **Data streams → Add stream → Web**, enter the
   site's address (for example `chessmate.pages.dev`).
2. Copy the **Measurement ID** (`G-XXXXXXXXXX`).
3. GitHub → repo Settings → Secrets and variables → Actions → **Variables** → New:
   `EXPO_PUBLIC_GA_MEASUREMENT_ID` = that ID. For a local web build, put it in `.env`.
4. Run the Deploy workflow for the web.
5. In the stream's settings, turn **Enhanced measurement → Page views → "Page changes
   based on browser history events" off** (the app sends its own screen views).

### 5. Server

Deploy the server once so migration `0029_analytics` runs. No new secrets.

## Expo Go

Expo Go has no Firebase module, so in Expo Go the app sends events to our own
server only (the admin page fills up) and logs that Firebase isn't in the build.
Google Analytics on phones starts with the next development or store build.
