import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { InAppBanner } from '@/components/notifications/InAppBanner';
import { RootStackHeader } from '@/components/shell/StackHeader';
import { Screen } from '@/components/ui';
import { useAccountSession } from '@/features/account/session';
import { SettingsBridge } from '@/features/account/settingsStore';
import { AuthProvider, useAuth } from '@/lib/auth';
import { playClient } from '@/lib/playClient';
import { NO_SWIPE_BACK, useNoBrowserSwipeBack } from '@/lib/useNoSwipeBack';
import { heatOff, heatTestParts } from '@/lib/heatTest';
import { Probe } from '@/lib/Probe';
import { preloadSounds } from '@/lib/sounds';
import { setSocialIdentity, setSocialToken, setSocialTokenProvider } from '@/lib/social/session';
import { UIProvider, useAppTheme } from '@/ui';
import { AwardsListener } from '@/features/awards/AwardsListener';
import { EngineHost } from '@/features/engine/EngineHost';
import { CookieBanner } from '@/features/privacy/CookieBanner';
import { loadArabicFonts, useAppFonts } from '@/ui/theme/fonts';
import { NotificationsProvider, setNotificationsTokenProvider } from '@/lib/notifications';
import { initI18n, useI18n } from '@/i18n';

// Web: when Google's sign-in pop-up returns to the app, hand the result to the opener and close it.
WebBrowser.maybeCompleteAuthSession();

const rootStyle = { flex: 1 } as const;

export default function RootLayout() {
  // Fonts are bundled, so this resolves in a frame or two; the splash covers it.
  const fontsReady = useAppFonts();
  // Load the saved language (or follow the device) and apply text direction before the
  // first real render, so every screen starts in the right language and direction.
  const { ready: i18nReady } = useI18n();
  useEffect(() => {
    void initI18n({ beforeReady: (lang) => (lang === 'ar' ? loadArabicFonts() : undefined) });
    // Board sounds load now, so the first move of a session is heard too.
    if (!heatOff('sounds')) preloadSounds();
  }, []);
  if (!fontsReady || !i18nReady) return null;
  if (heatOff('blank')) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111' }}>
        <Text style={{ color: '#fff', fontSize: 18 }}>Heat test: everything off</Text>
      </View>
    );
  }
  const app = (
    <UIProvider>
      <Navigator />
      {heatTestParts.length > 0 && <HeatTestNote />}
    </UIProvider>
  );
  return (
    // Board drag-and-drop runs on gesture-handler, which needs this at the root.
    <GestureHandlerRootView style={rootStyle}>
      {/* Tracks the keyboard so focused fields stay above it (iPhone and edge-to-edge Android). */}
      {heatOff('keyboard') ? app : <KeyboardProvider>{app}</KeyboardProvider>}
    </GestureHandlerRootView>
  );
}

/** Reminds the developer that parts of the app are switched off (EXPO_PUBLIC_HEAT_TEST). */
function HeatTestNote() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 54, alignSelf: 'center', backgroundColor: '#c00', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
      <Text style={{ color: '#fff', fontSize: 12 }}>Heat test: {heatTestParts.join(', ')}</Text>
    </View>
  );
}

function HeatNoScreens() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111' }}>
      <Text style={{ color: '#fff', fontSize: 18 }}>Heat test: no screens</Text>
    </View>
  );
}

function Navigator() {
  const { scheme, colors: p } = useAppTheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  useNoBrowserSwipeBack();
  return (
    <ThemeProvider value={{ ...base, colors: { ...base.colors, background: p.bg, card: p.surfaceSolid, text: p.text, primary: p.accent, border: p.border } }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <AuthProvider>
        <NotificationsProvider>
          <PlayAuthBridge />
          <SocialAuthBridge />
          <AccountSettingsBridge />
          <Probe id="screens">{heatOff('screens') ? <HeatNoScreens /> : <RootStack />}</Probe>
          <Probe id="overlays">
            {!heatOff('overlays') && <InAppBanner />}
            {!heatOff('overlays') && <AwardsListener />}
          </Probe>
          {/* Runs Stockfish on phones (hidden; only while a review needs it). */}
          <EngineHost />
        </NotificationsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

/** Loads the player's saved settings (board, pieces, sounds) at sign-in so every board uses them. */
function AccountSettingsBridge() {
  return <SettingsBridge session={useAccountSession()} />;
}

/** Signed-in players join games with their account; guests keep their guest identity. */
function PlayAuthBridge() {
  const { status, getAccessToken } = useAuth();
  const signedIn = status === 'signedIn';
  const prev = useRef<boolean | null>(null);
  useEffect(() => {
    const changed = prev.current !== null && prev.current !== signedIn;
    prev.current = signedIn;
    playClient.setTokenProvider(signedIn ? getAccessToken : null, changed);
  }, [signedIn, getAccessToken]);
  // Keep the live connection open on every screen, not only while playing:
  // notifications, friend requests, challenges and messages arrive over it.
  useEffect(() => {
    const unsubscribe = playClient.subscribe(() => undefined);
    return () => void unsubscribe();
  }, []);
  return null;
}

/**
 * Friends, messages and tournaments act as the signed-in account: no separate
 * username to pick. Signing out clears it.
 */
function SocialAuthBridge() {
  const { status, user, getAccessToken } = useAuth();
  useEffect(() => {
    if (status === 'loading') return;
    if (status !== 'signedIn' || !user) {
      setSocialTokenProvider(null);
      setSocialIdentity(null);
      setNotificationsTokenProvider(null);
      return;
    }
    setSocialTokenProvider(getAccessToken);
    // The notification inbox (warnings, tournament news, ...) belongs to the signed-in account.
    setNotificationsTokenProvider(getAccessToken, user.id);
    let live = true;
    void getAccessToken().then((token) => {
      if (live && token) setSocialToken(token, user.id, user.username);
    });
    return () => {
      live = false;
    };
  }, [status, user, getAccessToken]);
  return null;
}

/** Routes anyone may open without a session: the auth flow and emailed reset links. */
const PUBLIC_ROOTS = new Set(['(auth)', 'reset-password', 'privacy', 'cookies', 'fair-play', 'about', 'support']);

function RootStack() {
  const { status } = useAuth();
  const segments = useSegments();
  const onPublicRoute = PUBLIC_ROOTS.has(segments[0] ?? '');
  const mustWelcome = status === 'signedOut' && !onPublicRoute;
  const { tr } = useI18n();

  // First-time visitors (no account, never chose guest) start on the welcome screen.
  useEffect(() => {
    if (mustWelcome) router.replace('/welcome');
  }, [mustWelcome]);

  return (
    <>
      <Stack screenOptions={{ header: (props) => <RootStackHeader {...props} />, ...NO_SWIPE_BACK }}>
        {/* The app shell: header + tab bar / sidebar around the main sections. */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'ChessMate' }} />
        {/* Full-screen flows shown above the shell. */}
        <Stack.Screen name="play/index" options={{ title: tr('nav.play') }} />
        <Stack.Screen name="play/online" options={{ title: tr('titles.playOnline') }} />
        <Stack.Screen name="play/local" options={{ title: tr('titles.practice') }} />
        <Stack.Screen name="puzzles/index" options={{ title: tr('nav.puzzles') }} />
        <Stack.Screen name="leaderboard" options={{ title: tr('titles.leaderboards') }} />
        <Stack.Screen name="play/computer" options={{ title: tr('titles.computer') }} />
        {/* Account flow: own full-screen glass layout, no stack header. */}
        <Stack.Screen name="(auth)/welcome" options={{ headerShown: false, title: tr('titles.welcome') }} />
        <Stack.Screen name="(auth)/sign-in" options={{ headerShown: false, title: tr('auth.signIn') }} />
        <Stack.Screen name="(auth)/sign-up" options={{ headerShown: false, title: tr('auth.signUp.submit') }} />
        <Stack.Screen name="(auth)/forgot-password" options={{ headerShown: false, title: tr('titles.resetPassword') }} />
        <Stack.Screen name="reset-password" options={{ headerShown: false, title: tr('auth.newPassword') }} />
        <Stack.Screen name="analysis" options={{ title: tr('titles.analysis') }} />
        <Stack.Screen name="dig-deep" options={{ title: tr('titles.digDeep') }} />
        <Stack.Screen name="review" options={{ title: tr('titles.review') }} />
        <Stack.Screen name="news/index" options={{ title: tr('news.title') }} />
        <Stack.Screen name="news/[id]" options={{ title: tr('news.title') }} />
        <Stack.Screen name="forum/index" options={{ title: tr('forum.title') }} />
        <Stack.Screen name="forum/[id]" options={{ title: tr('forum.title') }} />
        <Stack.Screen name="about" options={{ title: tr('pages.about.title') }} />
        <Stack.Screen name="support" options={{ title: tr('pages.support.title') }} />
        <Stack.Screen name="donate" options={{ title: tr('pages.donate.title') }} />
        <Stack.Screen name="privacy" options={{ title: tr('pages.privacy.title') }} />
        <Stack.Screen name="cookies" options={{ title: tr('pages.cookies.title') }} />
        <Stack.Screen name="fair-play" options={{ title: tr('pages.fairPlay.title') }} />
        <Stack.Screen name="play-limits" options={{ title: tr('limits.title') }} />
        <Stack.Screen name="awards" options={{ title: tr('awards.title') }} />
        <Stack.Screen name="collections/index" options={{ title: tr('collections.mine') }} />
        <Stack.Screen name="collections/[id]" options={{ title: tr('collections.title') }} />
        <Stack.Screen name="design" options={{ title: tr('titles.design') }} />
        {/* Staff console: its own layout (side rail on wide screens). */}
        <Stack.Screen name="admin" options={{ headerShown: false, title: tr('admin.title') }} />
      </Stack>
      <CookieBanner />
      {/* Cover the first frame while the saved session is read, and while redirecting to welcome. */}
      {status === 'loading' || mustWelcome ? (
        <View style={StyleSheet.absoluteFill}>
          <Screen>{null}</Screen>
        </View>
      ) : null}
    </>
  );
}
