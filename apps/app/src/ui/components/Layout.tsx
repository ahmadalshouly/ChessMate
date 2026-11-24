import { LinearGradient } from 'expo-linear-gradient';
import { createContext, useContext, type ReactNode } from 'react';
import { Platform, StyleSheet, View, type ScrollViewProps, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '../theme/ThemeProvider';
import type { Space } from '../theme/tokens';
import { KeyboardScrollView } from './Keyboard';
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

/**
 * True inside a frame that already draws the backdrop behind its header (the app shell). Screens
 * there leave their own background off, so the page runs unbroken under the glass header.
 */
export const BackdropContext = createContext(false);

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
  const framed = useContext(BackdropContext);

  return (
    <View style={{ flex: 1, backgroundColor: framed ? 'transparent' : t.colors.bg }}>
      {!framed && <Backdrop />}
      {scroll ? (
        <KeyboardScrollView {...scrollProps} contentContainerStyle={[pad, { alignItems: 'center', flexGrow: 1 }]}>
          {column}
        </KeyboardScrollView>
      ) : (
        <View style={[pad, { flex: 1, alignItems: 'center' }]}>{column}</View>
      )}
    </View>
  );
}

/**
 * The brand backdrop: a tonal gradient, one soft light for the glass to catch, and a
 * faint chessboard that fades out from the top corner. Use alone behind custom layouts.
 */
export function Backdrop() {
  const c = useAppTheme().colors;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <LinearGradient colors={c.bgGradient} style={StyleSheet.absoluteFill} />
      <Glow color={c.bgGlow[0]} size={520} style={{ top: -260, left: '50%', marginLeft: -260 }} />
      <BoardPattern />
      <Glow color={c.bgGlow[1]} size={420} style={{ bottom: -220, left: -160 }} />
    </View>
  );
}

const SQUARE = 64;
const FILES = 8;

/** Eight by eight board in the top right corner, each square fading with its distance from the corner. */
function BoardPattern() {
  const c = useAppTheme().colors;
  const ink = c.scheme === 'dark' ? '255,255,255' : '12,12,13';
  // Enough tone for glass on top to refract something, faint enough to stay a texture.
  const peak = c.scheme === 'dark' ? 0.04 : 0.045;
  const size = SQUARE * FILES;
  const squares = [];
  for (let r = 0; r < FILES; r++) {
    for (let f = 0; f < FILES; f++) {
      if ((r + f) % 2 === 0) continue;
      const dist = Math.hypot(FILES - 1 - f, r) / (FILES - 1);
      const alpha = peak * Math.max(0, 1 - dist) ** 1.3;
      if (alpha < 0.002) continue;
      squares.push(<View key={`${r}${f}`} style={{ position: 'absolute', top: r * SQUARE, left: f * SQUARE, width: SQUARE, height: SQUARE, backgroundColor: `rgba(${ink},${alpha.toFixed(4)})` }} />);
    }
  }
  return <View style={{ position: 'absolute', top: -SQUARE, right: -SQUARE * 1.5, width: size, height: size }}>{squares}</View>;
}

/** Soft round light. Web uses a CSS blur; native fakes the falloff with stacked translucent discs. */
function Glow({ color, size, style }: { color: string; size: number; style: ViewStyle }) {
  if (Platform.OS === 'web') {
    return <View style={[{ position: 'absolute', width: size, height: size, borderRadius: size, backgroundColor: color }, { filter: 'blur(90px)' } as ViewStyle, style]} />;
  }
  return (
    <View style={[{ position: 'absolute', width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      {[1, 0.8, 0.6, 0.4, 0.2].map((k) => (
        <View key={k} style={{ position: 'absolute', width: size * k, height: size * k, borderRadius: size, backgroundColor: color, opacity: 0.35 }} />
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
    <View style={{ height: StyleSheet.hairlineWidth, marginStart: inset, backgroundColor: c.border }} />
  );
}

/**
 * Mono uppercase label above a group of cards or rows, followed by a hairline rule,
 * with an optional action on the right.
 */
export function SectionHeader({ title, action, index }: { title: string; action?: ReactNode; /** Optional "01"-style number before the title. */ index?: number }) {
  const c = useAppTheme().colors;
  return (
    <Row gap="md" style={{ paddingHorizontal: 2, minHeight: 28 }}>
      {index !== undefined && (
        <Text variant="overline" tone="tertiary">
          {String(index).padStart(2, '0')}
        </Text>
      )}
      <Text variant="overline" tone="muted">
        {title}
      </Text>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />
      {action}
    </Row>
  );
}
