/**
 * Compatibility layer for screens written before the design system.
 * New code should import from '@/ui' instead (Screen, Card, Button, Text, ...).
 */
import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Backdrop, Button as UIButton, Card as UICard, Text, useColors } from '@/ui';

/**
 * Full-screen page background. Content ends above the bottom safe area (the iPhone
 * home indicator, Android gesture bar), so scroll views inside can always reach their
 * last row; screens inside see a bottom inset of 0 so nothing pads for it twice.
 */
export function Screen({ children }: { children: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingBottom: insets.bottom }}>
      <Backdrop />
      <SafeAreaInsetsContext value={{ ...insets, bottom: 0 }}>{children}</SafeAreaInsetsContext>
    </View>
  );
}

export function Button(props: { title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean }) {
  return <UIButton {...props} fullWidth />;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <UICard style={style} gap="sm">
      {children}
    </UICard>
  );
}

export function Label({ children, muted, size = 15, bold }: { children: ReactNode; muted?: boolean; size?: number; bold?: boolean }) {
  // Big bold labels are screen titles: they take the display face.
  if (bold && size >= 24) {
    return (
      <Text variant="title" tone={muted ? 'muted' : 'default'} style={{ fontSize: size, lineHeight: size + 6 }}>
        {children}
      </Text>
    );
  }
  if (bold && size >= 17) {
    return (
      <Text variant="heading" tone={muted ? 'muted' : 'default'} style={{ fontSize: size, lineHeight: size + 6 }}>
        {children}
      </Text>
    );
  }
  return (
    <Text tone={muted ? 'muted' : 'default'} style={{ fontSize: size, lineHeight: Math.round(size * 1.35), fontWeight: bold ? '600' : '400', letterSpacing: -0.1 }}>
      {children}
    </Text>
  );
}
