import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View, type ScrollViewProps, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '../theme/ThemeProvider';
import type { Space } from '../theme/tokens';
import { Text } from './Text';

type Edge = 'top' | 'bottom' | 'left' | 'right';

export interface ScreenProps {
  children?: ReactNode;
  /** Wrap content in a ScrollView. Default false. */
  scroll?: boolean;
  /** Horizontal and vertical page padding. Default `lg`. Use `none` for edge-to-edge. */
  padding?: Space;
  /** Gap between direct children. Default `lg`. */
  gap?: Space;
  /** Centre the content in a readable column. Default `content` (720). */
  width?: 'content' | 'wide' | 'full';
  /** Safe-area edges to pad. Default bottom only (the stack header covers the top). */
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  scrollProps?: Omit<ScrollViewProps, 'contentContainerStyle'>;
}

/** Brand page background (monochrome gradient + soft glow) with optional scroll and column. */
export function Screen({
  children,
  scroll,
  padding = 'lg',
  gap = 'lg',
  width = 'content',
  edges = ['bottom'],
  contentStyle,
  scrollProps,
}: ScreenProps) {
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  const p = t.space[padding];
  const maxWidth = width === 'content' ? t.layout.maxContentWidth : width === 'wide' ? t.layout.maxWideWidth : undefined;
  const pad = {
    paddingTop: p + (edges.includes('top') ? insets.top : 0),
    paddingBottom: p + (edges.includes('bottom') ? insets.bottom : 0),
    paddingLeft: p + (edges.includes('left') ? insets.left : 0),
    paddingRight: p + (edges.includes('right') ? insets.right : 0),
  };
  const column = <View style={[{ width: '100%', maxWidth, gap: t.space[gap] }, !scroll && { flex: 1 }, contentStyle]}>{children}</View>;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Backdrop />
      {scroll ? (
        <ScrollView {...scrollProps} contentContainerStyle={[pad, { alignItems: 'center', flexGrow: 1 }]}>
          {column}
        </ScrollView>
      ) : (
        <View style={[pad, { flex: 1, alignItems: 'center' }]}>{column}</View>
      )}
    </View>
  );
}

/** Gradient and glow shapes. Use alone behind custom layouts. */
export function Backdrop() {
  const c = useAppTheme().colors;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <LinearGradient colors={c.bgGradient} style={StyleSheet.absoluteFill} />
      <Glow color={c.bgGlow[0]} size={380} style={{ top: -140, right: -120 }} />
      <Glow color={c.bgGlow[1]} size={460} style={{ bottom: -200, left: -160 }} />
    </View>
  );
}

/** Soft round light. Web uses a CSS blur; native fakes the falloff with stacked translucent discs. */
function Glow({ color, size, style }: { color: string; size: number; style: ViewStyle }) {
  if (Platform.OS === 'web') {
    return <View style={[{ position: 'absolute', width: size, height: size, borderRadius: size, backgroundColor: color }, { filter: 'blur(70px)' } as ViewStyle, style]} />;
  }
  return (
    <View style={[{ position: 'absolute', width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      {[1, 0.78, 0.56, 0.34].map((k) => (
        <View key={k} style={{ position: 'absolute', width: size * k, height: size * k, borderRadius: size, backgroundColor: color, opacity: 0.45 }} />
      ))}
    </View>
  );
}

interface StackProps extends ViewProps {
  gap?: Space;
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  wrap?: boolean;
  flex?: number;
}

/** Vertical layout with token gap. */
export function Stack({ gap = 'md', align, justify, wrap, flex, style, ...rest }: StackProps) {
  const t = useAppTheme();
  return <View {...rest} style={[{ gap: t.space[gap], alignItems: align, justifyContent: justify, flexWrap: wrap ? 'wrap' : undefined, flex }, style]} />;
}

/** Horizontal layout with token gap. Items are vertically centred by default. */
export function Row({ gap = 'sm', align = 'center', justify, wrap, flex, style, ...rest }: StackProps) {
  const t = useAppTheme();
  return (
    <View
      {...rest}
      style={[{ flexDirection: 'row', gap: t.space[gap], alignItems: align, justifyContent: justify, flexWrap: wrap ? 'wrap' : undefined, flex }, style]}
    />
  );
}

/** Flexible space (no size) or a fixed token gap. */
export function Spacer({ size }: { size?: Space }) {
  const t = useAppTheme();
  return size ? <View style={{ width: t.space[size], height: t.space[size] }} /> : <View style={{ flex: 1 }} />;
}

export function Divider({ vertical, inset = 0 }: { vertical?: boolean; inset?: number }) {
  const c = useAppTheme().colors;
  return vertical ? (
    <View style={{ width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: c.border }} />
  ) : (
    <View style={{ height: StyleSheet.hairlineWidth, marginLeft: inset, backgroundColor: c.border }} />
  );
}

/** Small uppercase label above a group of cards or rows, with optional action on the right. */
export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <Row justify="space-between" style={{ paddingHorizontal: 4 }}>
      <Text variant="overline" tone="muted">
        {title}
      </Text>
      {action}
    </Row>
  );
}

