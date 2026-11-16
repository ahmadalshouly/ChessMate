import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';

import { RootStackHeader } from '@/components/shell/StackHeader';
import { Screen } from '@/components/ui';
import { palette } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';

export default function RootLayout() {
  const scheme = useColorScheme();
  const p = scheme === 'dark' ? palette.dark : palette.light;
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider value={{ ...base, colors: { ...base.colors, background: p.bg, card: p.surfaceSolid, text: p.text, primary: p.accent, border: p.border } }}>
      <StatusBar style="auto" />
      <AuthProvider>
        <RootStack />
      </AuthProvider>
    </ThemeProvider>
  );
}

/** Routes anyone may open without a session: the auth flow and emailed reset links. */
const PUBLIC_ROOTS = new Set(['(auth)', 'reset-password']);

function RootStack() {
  const { status } = useAuth();
  const segments = useSegments();
  const onPublicRoute = PUBLIC_ROOTS.has(segments[0] ?? '');
  const mustWelcome = status === 'signedOut' && !onPublicRoute;

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
        <Stack.Screen name="play/online" options={{ title: 'Play online' }} />
        <Stack.Screen name="play/local" options={{ title: 'Practice board' }} />
        {/* Account flow: own full-screen glass layout, no stack header. */}
        <Stack.Screen name="(auth)/welcome" options={{ headerShown: false, title: 'Welcome' }} />
        <Stack.Screen name="(auth)/sign-in" options={{ headerShown: false, title: 'Sign in' }} />
        <Stack.Screen name="(auth)/sign-up" options={{ headerShown: false, title: 'Create account' }} />
        <Stack.Screen name="(auth)/forgot-password" options={{ headerShown: false, title: 'Reset password' }} />
        <Stack.Screen name="reset-password" options={{ headerShown: false, title: 'New password' }} />
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
