import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { UIProvider, useAppTheme } from '@/ui';

export default function RootLayout() {
  return (
    <UIProvider>
      <Navigator />
    </UIProvider>
  );
}

function Navigator() {
  const { scheme, colors: p } = useAppTheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider value={{ ...base, colors: { ...base.colors, background: p.bg, card: p.surfaceSolid, text: p.text, primary: p.accent, border: p.border } }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack>
        <Stack.Screen name="index" options={{ title: 'ChessMate' }} />
        <Stack.Screen name="play/online" options={{ title: 'Play online' }} />
        <Stack.Screen name="play/local" options={{ title: 'Practice board' }} />
        <Stack.Screen name="design" options={{ title: 'Design system' }} />
      </Stack>
    </ThemeProvider>
  );
}
