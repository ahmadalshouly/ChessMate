import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { RootStackHeader } from '@/components/shell/StackHeader';
import { palette } from '@/constants/theme';

export default function RootLayout() {
  const scheme = useColorScheme();
  const p = scheme === 'dark' ? palette.dark : palette.light;
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider value={{ ...base, colors: { ...base.colors, background: p.bg, card: p.surfaceSolid, text: p.text, primary: p.accent, border: p.border } }}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ header: (props) => <RootStackHeader {...props} /> }}>
        {/* The app shell: header + tab bar / sidebar around the main sections. */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'ChessMate' }} />
        {/* Full-screen flows shown above the shell. */}
        <Stack.Screen name="play/online" options={{ title: 'Play online' }} />
        <Stack.Screen name="play/local" options={{ title: 'Practice board' }} />
      </Stack>
    </ThemeProvider>
  );
}
