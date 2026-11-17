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
| Web, `http://localhost:8081` | Not offered | Works after steps 1 to 4 below |
| Installed builds (EAS) | Works (Apple Developer account) | Works after steps 1 to 4 below |

**Why Google can't run in Expo Go:** Google sends the sign-in result back to the
app through a URL that belongs to the app (`com.chessmate.app:/oauthredirect`).
Expo Go is a different app with its own URL, so Google can't hand the result to
it, and Google no longer accepts the proxy Expo used to offer. In Expo Go the
Google button shows a short note instead. Use the web version (press `w` in
Expo) to try Google locally, or an installed build.

**Apple on Android and web** needs a Services ID and a public https domain for
Apple's return URL, so it is not set up yet. The button only appears on iOS.

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
  SHA-1. (Creating the credentials doesn't start a build.)
- After saving, open the client, expand **Advanced settings** and turn on
  **Enable custom URI scheme**. The app returns from Google through
  `com.chessmate.app:/oauthredirect`.

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
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=1234-android.apps.googleusercontent.com
```

Both files are git-ignored. You can start with only the web ID in both places,
and add the iOS and Android IDs before making builds. For EAS builds, add the
three `EXPO_PUBLIC_GOOGLE_*` values as EAS environment variables (expo.dev →
project → Environment variables) too, since `.env` files aren't uploaded.

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
`AuthService.oauthSignIn` in `apps/server/src/auth/service.ts`. Tests:
`apps/server/test/oauth.test.ts`.
