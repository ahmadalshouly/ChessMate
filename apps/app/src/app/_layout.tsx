import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { palette } from '@/constants/theme';

export default function RootLayout() {
  const scheme = useColorScheme();
  const p = scheme === 'dark' ? palette.dark : palette.light;
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider value={{ ...base, colors: { ...base.colors, background: p.bg, card: p.surfaceSolid, text: p.text, primary: p.accent, border: p.border } }}>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="index" options={{ title: 'ChessMate' }} />
        <Stack.Screen name="play/online" options={{ title: 'Play online' }} />
        <Stack.Screen name="play/local" options={{ title: 'Practice board' }} />
        <Stack.Screen name="leaderboard" options={{ title: 'Leaderboards' }} />
      </Stack>
    </ThemeProvider>
  );
}
