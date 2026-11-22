import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { InAppBanner } from '@/components/notifications/InAppBanner';
import { RootStackHeader } from '@/components/shell/StackHeader';
import { Screen } from '@/components/ui';
import { useAccountSession } from '@/features/account/session';
import { SettingsBridge } from '@/features/account/settingsStore';
import { AuthProvider, useAuth } from '@/lib/auth';
import { playClient } from '@/lib/playClient';
import { preloadSounds } from '@/lib/sounds';
import { setSocialIdentity, setSocialToken, setSocialTokenProvider } from '@/lib/social/session';
import { UIProvider, useAppTheme } from '@/ui';
import { AwardsListener } from '@/features/awards/AwardsListener';
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
    preloadSounds();
  }, []);
  if (!fontsReady || !i18nReady) return null;
  return (
    // Board drag-and-drop runs on gesture-handler, which needs this at the root.
    <GestureHandlerRootView style={rootStyle}>
      <UIProvider>
        <Navigator />
      </UIProvider>
    </GestureHandlerRootView>
  );
}

function Navigator() {
  const { scheme, colors: p } = useAppTheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider value={{ ...base, colors: { ...base.colors, background: p.bg, card: p.surfaceSolid, text: p.text, primary: p.accent, border: p.border } }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <AuthProvider>
        <NotificationsProvider>
          <PlayAuthBridge />
          <SocialAuthBridge />
          <AccountSettingsBridge />
          <RootStack />
          <InAppBanner />
          <AwardsListener />
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
const PUBLIC_ROOTS = new Set(['(auth)', 'reset-password', 'privacy', 'fair-play', 'about', 'support']);

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
      <Stack screenOptions={{ header: (props) => <RootStackHeader {...props} /> }}>
        {/* The app shell: header + tab bar / sidebar around the main sections. */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'ChessMate' }} />
        {/* Full-screen flows shown above the shell. */}
        <Stack.Screen name="play/index" options={{ title: tr('nav.play') }} />
        <Stack.Screen name="play/online" options={{ title: tr('titles.playOnline') }} />
        <Stack.Screen name="play/local" options={{ title: tr('titles.practice') }} />
        <Stack.Screen name="leaderboard" options={{ title: tr('titles.leaderboards') }} />
        <Stack.Screen name="play/computer" options={{ title: tr('titles.computer') }} />
        {/* Account flow: own full-screen glass layout, no stack header. */}
        <Stack.Screen name="(auth)/welcome" options={{ headerShown: false, title: tr('titles.welcome') }} />
        <Stack.Screen name="(auth)/sign-in" options={{ headerShown: false, title: tr('auth.signIn') }} />
        <Stack.Screen name="(auth)/sign-up" options={{ headerShown: false, title: tr('auth.signUp.submit') }} />
        <Stack.Screen name="(auth)/forgot-password" options={{ headerShown: false, title: tr('titles.resetPassword') }} />
        <Stack.Screen name="reset-password" options={{ headerShown: false, title: tr('auth.newPassword') }} />
        <Stack.Screen name="analysis" options={{ title: tr('titles.analysis') }} />
        <Stack.Screen name="review" options={{ title: tr('titles.review') }} />
        <Stack.Screen name="news/index" options={{ title: tr('news.title') }} />
        <Stack.Screen name="news/[id]" options={{ title: tr('news.title') }} />
        <Stack.Screen name="forum/index" options={{ title: tr('forum.title') }} />
        <Stack.Screen name="forum/[id]" options={{ title: tr('forum.title') }} />
        <Stack.Screen name="about" options={{ title: tr('pages.about.title') }} />
        <Stack.Screen name="support" options={{ title: tr('pages.support.title') }} />
        <Stack.Screen name="donate" options={{ title: tr('pages.donate.title') }} />
        <Stack.Screen name="privacy" options={{ title: tr('pages.privacy.title') }} />
        <Stack.Screen name="fair-play" options={{ title: tr('pages.fairPlay.title') }} />
        <Stack.Screen name="play-limits" options={{ title: tr('limits.title') }} />
        <Stack.Screen name="awards" options={{ title: tr('awards.title') }} />
        <Stack.Screen name="design" options={{ title: tr('titles.design') }} />
        {/* Staff console: its own layout (side rail on wide screens). */}
        <Stack.Screen name="admin" options={{ headerShown: false, title: tr('admin.title') }} />
      </Stack>
      {/* Cover the first frame while the saved session is read, and while redirecting to welcome. */}
      {status === 'loading' || mustWelcome ? (
        <View style={StyleSheet.absoluteFill}>
          <Screen>{null}</Screen>
        </View>
      ) : null}
    </>
  );
}
