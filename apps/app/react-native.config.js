// Autolinking overrides (read by Expo's autolinking at `expo prebuild` / EAS build).
//
// Firebase Analytics on iOS needs GoogleService-Info.plist (EAS file variable
// GOOGLE_SERVICE_INFO_PLIST, or ./GoogleService-Info.plist) and static
// frameworks, which app.config.ts sets only when that file is there. Without
// it, the Firebase pods are left out of the iOS build entirely, so an iOS build
// without Firebase is exactly the build it was before. Android works the same
// with google-services.json. See docs/ANALYTICS.md.
/* global __dirname */
const { existsSync } = require('node:fs');
const { join } = require('node:path');

const has = (envVar, file) => !!process.env[envVar] || existsSync(join(__dirname, file));
const ios = has('GOOGLE_SERVICE_INFO_PLIST', 'GoogleService-Info.plist');
const android = has('GOOGLE_SERVICES_JSON', 'google-services.json');

const platforms = { ...(ios ? null : { ios: null }), ...(android ? null : { android: null }) };
const off = Object.keys(platforms).length ? { platforms } : undefined;

module.exports = {
  dependencies: off ? { '@react-native-firebase/app': off, '@react-native-firebase/analytics': off } : {},
};
