import { PRESET_TIME_CONTROLS, formatTimeControl, timeCategory, type TimeControl } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, type Href } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { BreakBanner } from '@/components/BreakBanner';
import { AdSpot } from '@/features/ads/AdSpot';
import { DailyPuzzleCard } from '@/components/DailyPuzzleCard';
import { LiveBoard } from '@/components/LiveBoard';
import { OnlineFriends } from '@/components/OnlineFriends';
import { PushPrompt } from '@/components/notifications/PushPrompt';
import { GameSetupSheet } from '@/components/play/GameSetupSheet';
import { BrandLine } from '@/components/shell/BrandLine';
import { Page } from '@/components/shell/Page';
import { useCurrentUser } from '@/lib/currentUser';
import { Button, GlassView, SectionHeader, Text, rimShadow, useAppTheme } from '@/ui';
import { translate, useI18n, type TKey } from '@/i18n';
import { useProbe } from '@/lib/heatProbe';

type Glyph = ComponentProps<typeof MaterialCommunityIcons>['name'];

interface Mode {
  title: TKey;
  body: TKey;
  href: Href;
  glyph: Glyph;
}

const PLAY: Mode[] = [
  { title: 'home.computer.title', body: 'home.computer.body', href: '/play/computer', glyph: 'chess-rook' },
  { title: 'home.friend.title', body: 'home.friend.body', href: { pathname: '/play/online', params: { mode: 'friend' } }, glyph: 'chess-knight' },
  { title: 'home.otb.title', body: 'home.otb.body', href: '/play/otb', glyph: 'chess-pawn' },
  { title: 'home.practice.title', body: 'home.practice.body', href: '/play/local', glyph: 'chess-bishop' },
];

const IMPROVE: Mode[] = [
  { title: 'home.lessons.title', body: 'home.lessons.body', href: '/learn', glyph: 'chess-queen' },
  { title: 'home.analysis.title', body: 'home.analysis.body', href: '/analysis', glyph: 'chess-king' },
  { title: 'home.digDeep.title', body: 'home.digDeep.body', href: '/dig-deep', glyph: 'compass-outline' },
  { title: 'home.history.title', body: 'home.history.body', href: '/games', glyph: 'history' },
];

const COMMUNITY: Mode[] = [
  { title: 'home.friends.title', body: 'home.friends.body', href: '/friends', glyph: 'account-multiple-outline' },
  { title: 'home.leaderboards.title', body: 'home.leaderboards.body', href: '/leaderboard', glyph: 'podium' },
];

const QUICK = PRESET_TIME_CONTROLS.slice(0, 8);

function greeting() {
  const h = new Date().getHours();
  return translate(h < 5 ? 'home.greeting.night' : h < 12 ? 'home.greeting.morning' : h < 18 ? 'home.greeting.afternoon' : 'home.greeting.evening');
}

export default function Home() {
  useProbe('Home');
  const t = useAppTheme();
  const c = t.colors;
  const user = useCurrentUser();
  const { tr, rtl } = useI18n();
  const { width } = useWindowDimensions();
  // The shell's sidebar takes ~250px at 960 and up.
  const content = width >= 960 ? width - 250 : width;
  const cols = content >= 900 ? 3 : content >= 560 ? 2 : 1;
  // Tapping a time opens the game setup (mode, rating window, side) before searching.
  const [setupTc, setSetupTc] = useState<TimeControl | null>(null);

  return (
    <Page maxWidth={1080}>
      <AdSpot spot="home.top" />

      <View style={[styles.hero, { gap: t.space.xl }]}>
        <View style={{ gap: t.space.sm }}>
          <Text variant="overline" tone="muted">
            {greeting()}
            {user.displayName ? `, ${user.displayName}` : ''}
          </Text>
          <Text variant="display" style={width < 420 && { fontSize: 32, lineHeight: 40 }}>
            {tr('brand.slogan')}
          </Text>
          <Text tone="muted" style={{ maxWidth: 520 }}>
            {tr('home.heroBody')}
          </Text>
        </View>
        <View style={styles.heroActions}>
          <Button title={tr('home.online.title')} size="lg" onPress={() => router.push('/play')} rightIcon={<Ionicons name={rtl ? 'arrow-back' : 'arrow-forward'} size={18} color={c.onAccent} />} />
          <Button title={tr('nav.puzzles')} size="lg" variant="secondary" onPress={() => router.push('/puzzles')} />
        </View>
      </View>

      <BreakBanner />
      <PushPrompt />

      <View style={{ gap: t.space.md }}>
        <SectionHeader index={1} title={tr('home.quick.title')} action={<Text variant="caption" tone="tertiary">{tr('home.quick.hint')}</Text>} />
        <View style={styles.quick}>
          {QUICK.map((tc) => {
            const key = formatTimeControl(tc);
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={tr('home.quick.a11y', { tc: key, category: tr(`common.category.${timeCategory(tc)}`) })}
                onPress={() => setSetupTc(tc)}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  styles.quickCell,
                  { borderColor: hovered ? c.borderStrong : c.glassBorder, backgroundColor: hovered || pressed ? c.surfacePressed : c.surface, transform: [{ scale: pressed ? 0.95 : 1 }] },
                  rimShadow(c),
                ]}>
                <Text variant="figure" style={{ fontSize: 20, lineHeight: 24 }}>
                  {key}
                </Text>
                <Text variant="overline" tone="tertiary" style={{ fontSize: 9.5 }}>
                  {tr(`common.category.${timeCategory(tc)}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <OnlineFriends width={Math.min(content, 1080) - 32} />
      </View>

      <View style={{ gap: t.space.md }}>
        <SectionHeader index={2} title={tr('home.liveBoard.title')} />
        <LiveBoard width={Math.min(content, 1080) - 32} />
      </View>

      <View style={{ gap: t.space.md }}>
        <SectionHeader index={3} title={tr('puzzles.daily')} />
        <DailyPuzzleCard width={Math.min(content, 1080) - 32} />
      </View>

      <AdSpot spot="home.mid" />

      <ModeSection index={4} title={tr('nav.play')} modes={PLAY} cols={cols} />
      <ModeSection index={5} title={tr('home.improve')} modes={IMPROVE} cols={cols} />
      <ModeSection index={6} title={tr('home.community')} modes={COMMUNITY} cols={cols} />

      <AdSpot spot="home.end" />

      <BrandLine />
      <GameSetupSheet
        timeControl={setupTc}
        visible={setupTc !== null}
        onClose={() => setSetupTc(null)}
        onPlay={() => router.push('/play/online')}
        onPost={() => router.push('/play')}
      />
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
  const { tr, rtl } = useI18n();
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={tr(mode.title)} onPress={() => router.push(mode.href)}>
      {({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => (
        <GlassView radius="xl" padding="lg" elevation={hovered ? 'lg' : 'md'} style={[styles.tile, { transform: [{ scale: pressed ? 0.985 : 1 }, { translateY: hovered ? -2 : 0 }] }]}>
          <View style={styles.tileTop}>
            <View style={[styles.icon, { borderColor: c.borderStrong }]}>
              <MaterialCommunityIcons name={mode.glyph} size={18} color={c.text} />
            </View>
            <Ionicons name={rtl ? 'arrow-back' : 'arrow-forward'} size={16} color={hovered ? c.text : c.textTertiary} style={{ transform: [{ rotate: rtl ? '45deg' : '-45deg' }] }} />
          </View>
          <View style={{ gap: 4 }}>
            <Text variant="subheading">{tr(mode.title)}</Text>
            <Text variant="caption" tone="muted" numberOfLines={2}>
              {tr(mode.body)}
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
  quickCell: { flexGrow: 1, flexBasis: 76, alignItems: 'center', gap: 4, paddingVertical: 14, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: { gap: 22, minHeight: 148 },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  icon: { width: 38, height: 38, borderRadius: 19, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
});
