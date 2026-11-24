/**
 * ChessMate UI kit. Import everything from '@/ui':
 *
 *   import { Screen, Card, Button, Text, useAppTheme } from '@/ui';
 *
 * See src/ui/README.md for guidelines and examples, and the /design screen for a live gallery.
 */
import type { ReactNode } from 'react';

import { ToastProvider } from './components/Toast';
import { ThemeProvider, type AppearanceSettings, type AppearanceStorage } from './theme/ThemeProvider';

export * from './theme/tokens';
export * from './theme/boardThemes';
export * from './theme/ThemeProvider';

export * from './components/Text';
export * from './components/Glass';
export * from './components/Layout';
export * from './components/Button';
export * from './components/TextField';
export * from './components/Modal';
export * from './components/Keyboard';
export * from './components/Toast';
export * from './components/Avatar';
export * from './components/Badge';
export * from './components/Tabs';
export * from './components/ListRow';
export * from './components/Skeleton';
export * from './components/Switch';
export * from './components/BoardThemePicker';

/** Theme + toasts. Mounted once in the root layout. */
export function UIProvider({ children, storage, initial }: { children: ReactNode; storage?: AppearanceStorage; initial?: Partial<AppearanceSettings> }) {
  return (
    <ThemeProvider storage={storage} initial={initial}>
      <ToastProvider>{children}</ToastProvider>
    </ThemeProvider>
  );
}
export { PressableScale, nativeLiquidGlass, rimShadow, useReduceTransparency } from './components/liquid';
