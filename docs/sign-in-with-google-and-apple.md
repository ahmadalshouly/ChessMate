# Sign in with Google and Apple

The app gets an ID token from Google or Apple on the device and sends it to the
server (`POST /api/auth/google` or `/api/auth/apple`). The server checks the
token's signature, issuer, audience (your client IDs) and expiry, then signs the
player into the linked ChessMate account, links an existing account with the
same verified email, or creates a new account. No client secrets or private keys
are needed for this.

## Where it works

| Where | Apple | Google |
| --- | --- | --- |
| Expo Go on iPhone | Works with no setup | Not possible (see below) |
| Expo Go on Android | Not offered | Not possible (see below) |
| Web, `http://localhost:8081` | Not possible (Apple needs https) | Works after Google steps 1 to 4 |
| Web, your public https site | Works after the "Apple on the web" steps | Works after Google steps 1 to 4 |
| Installed iPhone build (EAS) | Works (Apple Developer account) | Works after Google steps 1 to 4, then a new build |
| Installed Android build (EAS) | Not offered | Works after Google steps 1 to 4, then a new build |

How each one signs in:

- **Google on Android and iPhone** uses Google's own native SDK
  (`@react-native-google-signin/google-signin`): the Android account picker,
  and Google's sign-in sheet on iOS.
- **Google on the web** uses Google's pop-up (`expo-auth-session`).
- **Apple on iPhone** uses Apple's native sheet (`expo-apple-authentication`).
- **Apple on the web** uses Apple's own JS pop-up (`appleid.auth.js`).

**Why Google can't run in Expo Go:** Google's native SDK is not part of Expo
Go, and Google only hands its result to the real app (`com.chessmate.app`). In
Expo Go the Google button shows a short note instead. Use the web version
(press `w` in Expo) to try Google locally, or an installed build (a
development build works: `npx eas-cli@latest build --profile development`).

**Apple on Android** is not offered. Apple has no Android sign-in, only a web
page, and Android players have Google.

---

## Apple

### In Expo Go (iPhone): nothing to set up

Start `pnpm dev:server` and `pnpm dev:app`, open the app in Expo Go on an iPhone
that is signed into an Apple ID, and tap **Continue with Apple** on the welcome,
sign-in or sign-up screen. Tokens issued inside Expo Go carry Expo Go's ID
(`host.exp.Exponent`), which the server accepts outside production.

The first time, Apple asks whether to share or hide your email and sends your
name; the server uses the name for the username (for example `Ahmad_Shouly`).
Apple only sends the name once. To see the first-time flow again, remove
ChessMate under iPhone Settings → your name → Sign-In & Security → Sign in with
Apple. Since Expo Go is the app Apple sees there, it may be listed as Expo Go.

### For installed builds (before TestFlight / App Store)

Needs the Apple Developer Program.

1. Go to https://developer.apple.com/account/resources/identifiers/list.
2. Open (or create) the App ID **com.chessmate.app**, tick **Sign In with Apple**
   under Capabilities, and save.
3. Nothing else: `app.config.ts` already sets `ios.usesAppleSignIn`, and EAS
   adds the entitlement when it builds. The server accepts `com.chessmate.app`
   by default (`APPLE_CLIENT_IDS`).

### On the web (your public https site)

Apple only signs in on https, on a domain you register with it, so this can't
be tried on `localhost`. Needs the Apple Developer Program.

1. **Services ID.** https://developer.apple.com/account/resources/identifiers/list
   → **+** → **Services IDs** → Continue. Description `ChessMate web`,
   identifier e.g. `com.chessmate.web` (it must differ from the app's bundle
   ID). Register.
2. Open the new Services ID, tick **Sign In with Apple** → **Configure**:
   - Primary App ID: `com.chessmate.app`.
   - Domains and Subdomains: your site's host, e.g. `chessmate.pages.dev`
     (no `https://`).
   - Return URLs: the site's address exactly, e.g. `https://chessmate.pages.dev`
     (no trailing slash). Add every address people use, e.g. a custom domain too.
   - Save, Continue, Save.
3. **Server** (Fly): `fly.toml` → `[env]` → `APPLE_SERVICES_ID = "com.chessmate.web"`,
   or `fly secrets set APPLE_SERVICES_ID=com.chessmate.web`. Locally: the same
   line in `.env`. The server then accepts tokens for the Services ID.
4. **Web build**: add `EXPO_PUBLIC_APPLE_SERVICES_ID=com.chessmate.web` as a
   GitHub Actions variable (repo Settings → Secrets and variables → Actions →
   Variables) and run the Deploy workflow with target `web`.

The **Continue with Apple** button then shows on the website's welcome,
sign-in and sign-up screens. It stays hidden on http and localhost.

Before the App Store release, Apple also requires that deleting an account
revokes the Apple sign-in. That needs a Sign in with Apple private key (.p8)
on the server and is not built yet.

---

## Google

You do this once in Google Cloud. It's free.

### 1. Project and consent screen

1. Go to https://console.cloud.google.com/ and create a project, e.g. **ChessMate**.
2. Open **Google Auth Platform** (APIs & Services → OAuth consent screen) and
   click **Get started**:
   - App name: `ChessMate`. User support email: your email.
   - Audience: **External**.
   - Contact email: your email. Agree and **Create**.
3. Under **Audience → Test users**, add the Google accounts you'll test with.
   While the app is in "Testing", only those accounts can sign in. (Publishing
   the app later removes that limit; for the basic `openid email profile`
   scopes no Google review is needed.)

### 2. Create the client IDs

In **Google Auth Platform → Clients → Create client**, create these:

**a. Web** (needed for the web app, and for local testing):
- Application type: **Web application**, name `ChessMate web`.
- Authorized JavaScript origins: `http://localhost:8081`
- Authorized redirect URIs: `http://localhost:8081`
- Later, add your public web address to both lists (e.g. `https://chessmate.app`).

Google only allows plain `http` for `localhost`, so test Google on web at
`http://localhost:8081` on the laptop, not at `http://192.168.x.x:8081`.

**b. iOS** (for installed iPhone builds):
- Application type: **iOS**, name `ChessMate iOS`, Bundle ID: `com.chessmate.app`.

**c. Android** (for installed Android builds):
- Application type: **Android**, name `ChessMate Android`, package name `com.chessmate.app`.
- SHA-1 certificate fingerprint: from the keystore that signs the build. For EAS
  builds run `npx eas-cli@latest credentials`, choose Android, and copy the
  SHA-1. (Creating the credentials doesn't start a build.) If you also install
  from Google Play later, add Play's **App signing key** SHA-1 (Play Console →
  Test and release → App integrity) as a second Android client.
- Nothing else. The app never uses this client's ID; Google only checks that an
  Android client with this package and SHA-1 exists. If it's missing or the
  SHA-1 is wrong, the app says "Google sign-in isn't set up for this build yet".

Your Firebase project (the one behind `google-services.json`) is a Google Cloud
project too. You can do all of this inside it: pick it at the top of the Google
Cloud console. Firebase may already have made a Web client (named "Web client
(auto created by Google Service)"); you can use that one as the web client.

Each client shows a **Client ID** like `1234-abc.apps.googleusercontent.com`.
None of them need the client secret.

### 3. Put the IDs in place

Server: `.env` at the repo root (`C:\Users\Ahmad\ChessMate\.env`). All the
Google client IDs, comma-separated:

```
GOOGLE_CLIENT_IDS=1234-web.apps.googleusercontent.com,1234-ios.apps.googleusercontent.com,1234-android.apps.googleusercontent.com
```

App: `apps/app/.env` (`C:\Users\Ahmad\ChessMate\apps\app\.env`):

```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=1234-web.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=1234-ios.apps.googleusercontent.com
```

Android uses the **web** client ID (that's how Google's native SDK gets an ID
token), so there is no Android variable. iOS needs its own ID, and the build
also turns it into the URL scheme Google returns through.

Both files are git-ignored. You can start with only the web ID in both places,
and add the iOS ID before making iPhone builds. `.env` files aren't uploaded to
EAS, so add both `EXPO_PUBLIC_GOOGLE_*` values as EAS environment variables:

```powershell
npx eas-cli@latest env:create --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value 1234-web.apps.googleusercontent.com --visibility plaintext --environment production --environment preview --environment development
npx eas-cli@latest env:create --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID --value 1234-ios.apps.googleusercontent.com --visibility plaintext --environment production --environment preview --environment development
```

For the published website, add `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` as a GitHub
Actions **variable** (repo Settings → Secrets and variables → Actions →
Variables) so the Deploy workflow bakes it into the web build. On Fly, set
`GOOGLE_CLIENT_IDS` with `fly secrets set GOOGLE_CLIENT_IDS=...`.

Google's native SDK is new in the app, so phones need a **new build** (Expo
Go can't show it).

### 4. Restart and try it

```powershell
pnpm dev:server          # prints "Sign in with Google: on"
pnpm dev:app --clear     # --clear so Expo picks up the new .env values
```

Press `w`, open http://localhost:8081, and choose **Continue with Google**.

---

## How accounts are matched

1. Same Google/Apple account as before: signs into that ChessMate account.
2. New Google/Apple account, but its email is verified and already belongs to a
   ChessMate account: links to that account and signs in.
3. Otherwise: creates an account. The username comes from the name (or the
   email's first part) and gets digits added if it's taken. There's no password;
   **Settings → Set a password** adds one, so email + password sign-in works too.

Server code: `apps/server/src/auth/oauth.ts` (token checks) and
`AuthService.oauthSignIn` in `apps/server/src/auth/service.ts`. App code:
`apps/app/src/components/auth/SocialSignIn.tsx` (the buttons),
`apps/app/src/lib/auth/googleNative.ts` and `apps/app/src/lib/auth/appleWeb.ts`.
Tests: `apps/server/test/oauth.test.ts`, `apps/app/test/appleWeb.test.ts`.
