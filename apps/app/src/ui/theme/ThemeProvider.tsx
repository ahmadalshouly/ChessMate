import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, useColorScheme } from 'react-native';

import { getSettings, updateSettings, useSettings } from '@/features/account/settingsStore';

import { boardThemes, DEFAULT_BOARD_THEME, type BoardTheme, type BoardThemeId } from './boardThemes';
import { themes, type ColorScheme, type ColorTokens, type Theme } from './tokens';

export type ThemePreference = 'system' | ColorScheme;

/**
 * Where the provider keeps the user's appearance choices. The default stores them in
 * `localStorage` on web and in memory on native; pass your own (for example backed by
 * the account settings API or AsyncStorage) to persist across launches.
 */
export interface AppearanceStorage {
  load(): Promise<Partial<AppearanceSettings> | null> | Partial<AppearanceSettings> | null;
  save(settings: AppearanceSettings): void;
}

export interface AppearanceSettings {
  preference: ThemePreference;
}

const STORAGE_KEY = 'chessmate.appearance';

const defaultStorage: AppearanceStorage = {
  load() {
    if (Platform.OS !== 'web') return null;
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Partial<AppearanceSettings>) : null;
    } catch {
      return null;
    }
  },
  save(settings) {
    if (Platform.OS !== 'web') return;
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Storage can be blocked (private mode); the choice still applies for this session.
    }
  },
};

interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  /** Flip between light and dark (leaves "system"). */
  toggleScheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  storage = defaultStorage,
  initial,
}: {
  children: ReactNode;
  storage?: AppearanceStorage;
  initial?: Partial<AppearanceSettings>;
}) {
  const system = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [settings, setSettings] = useState<AppearanceSettings>(() => ({
    preference: initial?.preference ?? 'system',
  }));

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(storage.load()).then((saved) => {
      if (cancelled || !saved) return;
      setSettings((s) => ({
        preference: isPreference(saved.preference) ? saved.preference : s.preference,
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const value = useMemo<ThemeContextValue>(() => {
    const scheme: ColorScheme = settings.preference === 'system' ? system : settings.preference;
    const update = (patch: Partial<AppearanceSettings>) =>
      setSettings((s) => {
        const next = { ...s, ...patch };
        storage.save(next);
        return next;
      });
    return {
      theme: themes[scheme],
      preference: settings.preference,
      setPreference: (preference) => update({ preference }),
      toggleScheme: () => update({ preference: scheme === 'dark' ? 'light' : 'dark' }),
    };
  }, [settings, system, storage]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function isPreference(v: unknown): v is ThemePreference {
  return v === 'system' || v === 'light' || v === 'dark';
}

/** Fallback when a component renders outside the provider (tests, isolated stories). */
function useFallback(): ThemeContextValue {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return {
    theme: themes[scheme],
    preference: 'system',
    setPreference: () => {},
    toggleScheme: () => {},
  };
}

function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  const fallback = useFallback();
  return ctx ?? fallback;
}

/** Full theme: colours, spacing, radii, type, shadows. */
export function useAppTheme(): Theme {
  return useThemeContext().theme;
}

/** Just the colour tokens. */
export function useColors(): ColorTokens {
  return useThemeContext().theme.colors;
}

/** Light/dark/system choice, for a settings screen or a header toggle. */
export function useThemePreference() {
  const { preference, setPreference, toggleScheme, theme } = useThemeContext();
  return { preference, setPreference, toggleScheme, scheme: theme.scheme };
}

const setBoardTheme = (theme: BoardThemeId) => updateSettings({ board: { theme } }).catch(() => undefined);

/**
 * Active board theme and setter. The choice lives in the player's settings
 * (saved to their account when signed in, on the device otherwise).
 */
export function useBoardTheme(): { boardTheme: BoardTheme; setBoardTheme: (id: BoardThemeId) => void } {
  const id = useSettings().board.theme;
  return { boardTheme: boardThemes[id] ?? boardThemes[DEFAULT_BOARD_THEME], setBoardTheme };
}

/** Board theme outside React (e.g. sharing images). */
export function currentBoardTheme(): BoardTheme {
  return boardThemes[getSettings().board.theme] ?? boardThemes[DEFAULT_BOARD_THEME];
}
