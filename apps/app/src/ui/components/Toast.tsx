import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '../theme/ThemeProvider';
import { GlassView } from './Glass';
import { Text } from './Text';
import { useProbe } from '@/lib/heatProbe';

export type ToastTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface ToastOptions {
  title: string;
  message?: string;
  tone?: ToastTone;
  /** Milliseconds before it hides. Default 3500. 0 keeps it until tapped. */
  duration?: number;
  action?: { label: string; onPress: () => void };
}

interface ToastItem extends Required<Pick<ToastOptions, 'title' | 'tone' | 'duration'>>, Pick<ToastOptions, 'message' | 'action'> {
  id: number;
}

interface ToastApi {
  show: (opts: ToastOptions) => number;
  hide: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const useNative = Platform.OS !== 'web';
let nextId = 1;

/** Mount once near the root (inside ThemeProvider). `UIProvider` does this for you. */
export function ToastProvider({ children }: { children: ReactNode }) {
  useProbe('ToastProvider');
  const [items, setItems] = useState<ToastItem[]>([]);
  const insets = useSafeAreaInsets();

  const hide = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const show = useCallback((o: ToastOptions) => {
    const id = nextId++;
    // Keep at most three on screen; newest on top.
    setItems((xs) => [{ id, title: o.title, message: o.message, tone: o.tone ?? 'neutral', duration: o.duration ?? 3500, action: o.action }, ...xs].slice(0, 3));
    return id;
  }, []);
  const api = useMemo(() => ({ show, hide }), [show, hide]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 8 }]}>
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onHide={() => hide(item.id)} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

/**
 *   const toast = useToast();
 *   toast.show({ title: 'Game saved', tone: 'success' });
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <UIProvider> or <ToastProvider>');
  return ctx;
}

function ToastCard({ item, onHide }: { item: ToastItem; onHide: () => void }) {
  const t = useAppTheme();
  const c = t.colors;
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: t.motion.normal, useNativeDriver: useNative }).start();
    if (!item.duration) return;
    const timer = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: t.motion.fast, useNativeDriver: useNative }).start(() => onHide());
    }, item.duration);
    return () => clearTimeout(timer);
  }, [anim, item.duration, onHide, t.motion]);

  const dot = item.tone === 'success' ? c.success : item.tone === 'warning' ? c.warning : item.tone === 'danger' ? c.danger : c.text;

  return (
    <Animated.View
      style={{
        width: '100%',
        maxWidth: 440,
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
      }}>
      <Pressable onPress={onHide} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <GlassView strength="strong" elevation="lg" radius="lg" style={styles.card}>
          <View style={[styles.dot, { backgroundColor: dot }]} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">{item.title}</Text>
            {item.message && (
              <Text variant="caption" tone="muted">
                {item.message}
              </Text>
            )}
          </View>
          {item.action && (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => {
                item.action?.onPress();
                onHide();
              }}>
              <Text variant="label">{item.action.label}</Text>
            </Pressable>
          )}
        </GlassView>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 12, right: 12, alignItems: 'center', gap: 8, zIndex: 1000, elevation: 1000 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
