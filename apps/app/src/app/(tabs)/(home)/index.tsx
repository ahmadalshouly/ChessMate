import { PRESET_TIME_CONTROLS, formatTimeControl, timeCategory } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, type Href } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { LiveStats } from '@/components/LiveStats';
import { Page } from '@/components/shell/Page';
import { useCurrentUser } from '@/lib/currentUser';
import { Button, GlassView, SectionHeader, Text, useAppTheme } from '@/ui';

type Glyph = ComponentProps<typeof MaterialCommunityIcons>['name'];

interface Mode {
  title: string;
  body: string;
  href: Href;
  glyph: Glyph;
}

const PLAY: Mode[] = [
  { title: 'Play vs computer', body: 'Eight opponents, beginner to expert. Hints and takebacks, works offline.', href: '/play/computer', glyph: 'chess-rook' },
  { title: 'Challenge a friend', body: 'Send an invite link or challenge a player directly.', href: { pathname: '/play/online', params: { mode: 'friend' } }, glyph: 'chess-knight' },
  { title: 'Over the board', body: 'Face to face on one device, with a shared clock.', href: '/play/otb', glyph: 'chess-pawn' },
  { title: 'Practice board', body: 'Play both sides with live threat detection.', href: '/play/local', glyph: 'chess-bishop' },
];

const IMPROVE: Mode[] = [
  { title: 'AI coach review', body: 'The key moments of a game, explained. Then ask about any position.', href: '/review/demo', glyph: 'chess-queen' },
  { title: 'Analysis board', body: 'Engine lines, evaluation bar and arrows for any position or PGN.', href: '/analysis', glyph: 'chess-king' },
  { title: 'Game history', body: 'Replay past games move by move. Share or import PGN.', href: '/games', glyph: 'history' },
];

const COMMUNITY: Mode[] = [
  { title: 'Friends', body: 'See who is online and watch their live games.', href: '/friends', glyph: 'account-multiple-outline' },
  { title: 'Leaderboards', body: 'Top players worldwide, in your country and among friends.', href: '/leaderboard', glyph: 'podium' },
];

const QUICK = PRESET_TIME_CONTROLS.slice(0, 8);

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  const t = useAppTheme();
  const c = t.colors;
  const user = useCurrentUser();
  const { width } = useWindowDimensions();
  // The shell's sidebar takes ~250px at 960 and up.
  const content = width >= 960 ? width - 250 : width;
  const cols = content >= 900 ? 3 : content >= 560 ? 2 : 1;

  return (
    <Page maxWidth={1080}>
      <View style={[styles.hero, { gap: t.space.xl }]}>
        <View style={{ gap: t.space.sm }}>
          <Text variant="overline" tone="muted">
            {greeting()}
            {user.displayName ? `, ${user.displayName}` : ''}
          </Text>
          <Text variant="display" style={width < 420 && { fontSize: 32, lineHeight: 38 }}>
            Your move.
          </Text>
          <Text tone="muted" style={{ maxWidth: 520 }}>
            Real-time games against players worldwide, and a coach that shows you why a move works.
          </Text>
        </View>
        <View style={styles.heroActions}>
          <Button title="Play online" size="lg" onPress={() => router.push('/play')} rightIcon={<Ionicons name="arrow-forward" size={18} color={c.onAccent} />} />
          <Button title="Puzzles" size="lg" variant="secondary" onPress={() => router.navigate('/puzzles')} />
        </View>
      </View>

      <LiveStats />

      <View style={{ gap: t.space.md }}>
        <SectionHeader index={1} title="Quick pair" action={<Text variant="caption" tone="tertiary">Tap to start searching</Text>} />
        <View style={styles.quick}>
          {QUICK.map((tc) => {
            const key = formatTimeControl(tc);
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={`Quick pair ${key} ${timeCategory(tc)}`}
                onPress={() => router.push({ pathname: '/play/online', params: { tc: key } })}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  styles.quickCell,
                  { borderColor: hovered ? c.borderStrong : c.border, backgroundColor: hovered ? c.surfacePressed : c.surface, transform: [{ scale: pressed ? 0.97 : 1 }] },
                ]}>
                <Text variant="figure" style={{ fontSize: 20, lineHeight: 24 }}>
                  {key}
                </Text>
                <Text variant="overline" tone="tertiary" style={{ fontSize: 9.5 }}>
                  {timeCategory(tc)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ModeSection index={2} title="Play" modes={PLAY} cols={cols} />
      <ModeSection index={3} title="Improve" modes={IMPROVE} cols={cols} />
      <ModeSection index={4} title="Community" modes={COMMUNITY} cols={cols} />
    </Page>
  );
}

function ModeSection({ index, title, modes, cols }: { index: number; title: string; modes: Mode[]; cols: number }) {
  const t = useAppTheme();
  const [w, setW] = useState(0);
  const gap = t.space.md;
  const cell = w > 0 ? (w - gap * (cols - 1)) / cols : undefined;
  return (
    <View style={{ gap: t.space.md }}>
      <SectionHeader index={index} title={title} />
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={[styles.grid, { gap }]}>
        {modes.map((m) => (
          <View key={m.title} style={{ width: cell ?? '100%' }}>
            <ModeTile mode={m} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** A destination: line-art piece in a hairline circle, title, one line, and an arrow. A large faint piece sits in the corner. */
function ModeTile({ mode }: { mode: Mode }) {
  const t = useAppTheme();
  const c = t.colors;
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={mode.title} onPress={() => router.push(mode.href)}>
      {({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => (
        <GlassView radius="xl" padding="lg" elevation={hovered ? 'lg' : 'md'} style={[styles.tile, { transform: [{ scale: pressed ? 0.985 : 1 }, { translateY: hovered ? -2 : 0 }] }]}>
          <View style={styles.tileTop}>
            <View style={[styles.icon, { borderColor: c.borderStrong }]}>
              <MaterialCommunityIcons name={mode.glyph} size={18} color={c.text} />
            </View>
            <Ionicons name="arrow-forward" size={16} color={hovered ? c.text : c.textTertiary} style={{ transform: [{ rotate: '-45deg' }] }} />
          </View>
          <View style={{ gap: 4 }}>
            <Text variant="subheading">{mode.title}</Text>
            <Text variant="caption" tone="muted" numberOfLines={2}>
              {mode.body}
            </Text>
          </View>
        </GlassView>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { paddingTop: 12, paddingBottom: 4, paddingHorizontal: 2 },
  heroActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickCell: { flexGrow: 1, flexBasis: 76, alignItems: 'center', gap: 4, paddingVertical: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: { gap: 22, minHeight: 148 },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  icon: { width: 38, height: 38, borderRadius: 19, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
});
