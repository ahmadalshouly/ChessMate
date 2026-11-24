# Push notifications

ChessMate sends push through **Expo's push service**. The server never talks to
Apple or Google directly: it posts to `https://exp.host/--/api/v2/push/send`,
and Expo forwards to Apple (APNs) for iPhones and Google (Firebase Cloud
Messaging, FCM) for Android. That means:

| What | Needed? | Where it lives |
| --- | --- | --- |
| Expo account and EAS project | Yes, already set up (`owner: ahmadshouly`, project id in `apps/app/app.json`) | expo.dev |
| **APNs key** (iPhone) | **Yes**, for TestFlight and App Store builds | Uploaded to Expo with `eas credentials` |
| **Firebase project + FCM V1 key** (Android) | **Yes**, for any Android build | `google-services.json` in the build, service account key uploaded to Expo |
| `EXPO_ACCESS_TOKEN` on the server | Only if "Enhanced push security" is on in Expo | `fly secrets set` |
| Firebase SDK in the app, OneSignal, or any other push service | **No** | |

Nothing is paid beyond the Apple Developer Program you need anyway; Firebase
Cloud Messaging and Expo push are free.

## iPhone: APNs key (about 5 minutes)

EAS can create the key for you during a build:

```bash
cd apps/app
npx eas-cli@latest credentials -p ios
# Choose the production profile → Push Notifications → "Set up a new key"
```

Or create it yourself: Apple Developer → Certificates, IDs & Profiles → Keys →
"+" → tick **Apple Push Notifications service (APNs)** → download the `.p8`
file (you can download it only once), then upload it with the same
`eas credentials` menu ("Use existing key"). One key works for every app on
the team and for both sandbox and production.

The `expo-notifications` config plugin already adds the push entitlement, so a
new iOS build after this picks it up. Expo Go on iPhone can receive push
without any of this (it uses Expo's own key), which is why push "works" in
development.

## Android: Firebase (about 10 minutes)

1. Go to <https://console.firebase.google.com> → **Add project** (Analytics not needed).
2. **Add app → Android**, package name `com.chessmate.app`. Download
   **`google-services.json`**.
3. Give the build that file. Either:
   - put it at `apps/app/google-services.json` (it is not a secret: it only
     identifies the Firebase project; commit it or not as you like), or
   - upload it as an EAS file variable so it stays out of git:
     ```bash
     cd apps/app
     npx eas-cli@latest env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret --environment production --environment preview --environment development
     ```
   `app.config.ts` picks up either one. An Android EAS build without it prints
   a warning: that build cannot get a push token.
4. Let Expo send through your project: Firebase console → Project settings →
   **Service accounts** → **Generate new private key** (a JSON file). Then:
   ```bash
   npx eas-cli@latest credentials -p android
   # production → Google Service Account → "Manage your Google Service Account Key for Push Notifications (FCM V1)" → upload the JSON
   ```
   This key **is** secret. Do not commit it.
5. Make a new Android build (`eas build -p android --profile preview`).

Expo Go on Android cannot receive push at all (since SDK 53); test on a
development or preview build.

## Checking it works

- **Admin → Notifications → New notification → Send me a test** sends the
  message to your own phones.
- **Admin → Notifications → Push health** shows how many phones have push on
  per platform, how many messages Expo accepted, how many Apple or Google
  confirmed, and the recent errors. The server reads Expo's delivery receipts
  every few minutes, so a missing key shows up there as `InvalidCredentials`
  (with the platform) about 15 minutes after a send.

| Error | Meaning | Fix |
| --- | --- | --- |
| `InvalidCredentials` on android | No FCM V1 key in Expo | Step 4 above |
| `InvalidCredentials` on ios | No APNs key in Expo | iPhone section |
| `MismatchSenderId` | FCM key and `google-services.json` are from different Firebase projects | Use one project |
| `DeviceNotRegistered` | App removed or push turned off | Nothing: the token is deleted automatically |
| HTTP 401 | Enhanced push security is on but `EXPO_ACCESS_TOKEN` is missing | Create a token at expo.dev → Access tokens, then `fly secrets set EXPO_ACCESS_TOKEN=...` |

## How delivery works

- The app asks for permission only when the player taps **Turn on** (a card on
  Home for signed-in players who were never asked, or Settings →
  Notifications). It then registers its Expo push token with the server for
  the signed-in account, again whenever the token rotates or another account
  signs in, and removes it on sign-out.
- Every notification goes through `NotificationService.notify`: the player's
  per-kind settings and quiet hours apply, an inbox copy is stored, and push is
  sent only when no device has the app in front. The app tells the server when
  it goes to the background (`appState`), and the server pings sockets every
  30 seconds, so a locked phone counts as away even while its socket is open.
- Pushes are gathered into requests of 100, as Expo asks.

## Admin console: campaigns

**Admin → Notifications** (admins; permission `notifications.send`):

- **Send now**: to everyone, a filter, or listed usernames. Shows the reach and
  asks for confirmation first.
- **Schedule**: goes out at the chosen time (checked every 30 seconds; survives
  restarts and deploys).
- **Triggers**, sent per player automatically:
  - *Opened the app and left without playing*: N minutes after leaving, unless
    they came back or played.
  - *Has not opened the app for N days*: once per absence.
  - *Signed up but has not played*: N minutes after sign-up.
  - *Finished an online game*: N minutes after the game.

  Each trigger has a cooldown and an optional per-player limit, and no player
  gets more than 3 campaign notifications a day from triggers.
- Filters: device (iPhone, Android, no phone app), days since last opened the
  app, days since sign-up, games played, country.
- `{username}` in the title or message becomes the player's name.

Campaign notifications use the **News and reminders** kind, which players can
turn off in Settings → Notifications (Apple's App Review guideline 4.5.4 asks
for that for promotional push).
