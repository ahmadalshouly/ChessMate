import { formatTimeControl, parseTimeControl, timeCategory, type ColorChoice, type OpenGame, type TimeControl } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTicker } from '@/components/PlayerBar';
import { Pill, Segmented, Stepper, Tile } from '@/components/play/Controls';
import { GameSetupSheet, postOpenGame, setSeekOptions, startSeek, useSeekOptions, type RatingWindow } from '@/components/play/GameSetupSheet';
import { Glass } from '@/components/shell/Glass';
import { RestrictionBanner } from '@/components/shell/RestrictionBanner';
import { isGuest, playClient, usePlay } from '@/lib/playClient';
import { Avatar, Backdrop, Button, GlassView, SectionHeader, Text, useAppTheme } from '@/ui';
import { dirIcon, useT, type TKey } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';

const GROUPS: { name: TKey; icon: 'flash' | 'flame' | 'time' | 'hourglass'; controls: string[] }[] = [
  { name: 'common.category.bullet', icon: 'flash', controls: ['1+0', '1+1', '2+1'] },
  { name: 'common.category.blitz', icon: 'flame', controls: ['3+0', '3+2', '5+0', '5+3'] },
  { name: 'common.category.rapid', icon: 'time', controls: ['10+0', '10+5', '15+10'] },
  { name: 'common.category.classical', icon: 'hourglass', controls: ['30+0', '30+20'] },
];

const MINUTES = [0.5, 1, 2, 3, 4, 5, 7, 10, 15, 20, 25, 30, 45, 60, 90, 120, 180];
const INCREMENTS = [0, 1, 2, 3, 5, 10, 15, 20, 30, 45, 60];
const WIDE = 960;

type Window = RatingWindow;


/**
 * The play lobby. Pick a time control, set a couple of options, press one button.
 * Phones get a sticky glass action bar; wide screens put the open games beside the setup.
 */
export default function Lobby() {
  const t = useAppTheme();
  const tr = useT();
  const c = t.colors;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const s = usePlay();
  const guest = isGuest(s.me);
  const [tcKey, setTcKey] = useState('5+0');
  const [custom, setCustom] = useState({ min: 7, inc: 2 });
  // Options are shared with the setup pop-up (and Home's quick play), so they stay in step.
  const seekOptions = useSeekOptions();
  const { window, color } = seekOptions;
  const setRated = (v: boolean) => setSeekOptions({ rated: v });
  const setWindow = (v: Window) => setSeekOptions({ window: v });
  const setColor = (v: ColorChoice) => setSeekOptions({ color: v });
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(() => playClient.lobbySub(), []);

  // A game started (quick pairing, open game joined, or resumed): go play it.
  const liveGameId = s.game && !s.game.outcome ? s.game.gameId : null;
  useEffect(() => {
    if (liveGameId) router.push('/play/online');
  }, [liveGameId]);

  const timeControl: TimeControl = useMemo(
    () => (tcKey === 'custom' ? { initialMs: custom.min * 60_000, incrementMs: custom.inc * 1000 } : parseTimeControl(tcKey)),
    [tcKey, custom],
  );
  const tcLabel = formatTimeControl(timeControl);
  const category = tr(`common.category.${timeCategory(timeControl)}`);
  const seeking = s.seek !== null;
  const busy = seeking || s.openGame !== null;
  const online = s.connection === 'online';
  const canStart = !busy && !liveGameId && online && !s.restricted;
  // Open games are standard chess only; Secret Queen pairs through matchmaking.
  const canCreate = canStart;
  const rated = seekOptions.rated && !guest;

  const step = (list: number[], cur: number, dir: 1 | -1) => list[Math.max(0, Math.min(list.length - 1, list.indexOf(cur) + dir))]!;
  // The lobby's own Play button is always normal chess; Secret Queen starts only from the setup pop-up.
  const play = () => startSeek(timeControl, { ...seekOptions, variant: 'standard' }, guest);
  const create = () => postOpenGame(timeControl, seekOptions, guest);

  // Only a connection problem is worth a badge; player counts are not shown.
  const status = online ? null : s.connection === 'connecting' ? tr('play.connecting') : tr('play.offline');

  const setup = (
    <View style={{ gap: t.space.xl }}>
      {/* Time control */}
      <View style={{ gap: t.space.md }}>
        <SectionHeader index={1} title={tr('play.lobby.timeControl')} />
        <GlassView padding="lg" radius="xl" style={{ gap: t.space.lg }}>
          {GROUPS.map((g) => (
            <View key={g.name} style={[styles.group, !wide && width < 560 && styles.groupStacked]}>
              <View style={[styles.groupLabel, !wide && width < 560 && { width: 'auto' }]}>
                <Ionicons name={`${g.icon}-outline`} size={13} color={c.muted} />
                <Text variant="overline" tone="muted">
                  {tr(g.name)}
                </Text>
              </View>
              <View style={styles.tiles}>
                {g.controls.map((key) => {
                  return (
                    <View key={key} style={{ flex: 1 }}>
                      <Tile title={key} selected={tcKey === key}
                        onPress={() => {
                          setTcKey(key);
                          if (canStart) setSetupOpen(true);
                        }}
                      />
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: tcKey === 'custom' }}
            onPress={() => setTcKey('custom')}
            style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
              styles.customRow,
              { borderColor: tcKey === 'custom' ? c.accent : c.border, backgroundColor: hovered ? c.surfacePressed : 'transparent' },
            ]}>
            <Ionicons name="options-outline" size={16} color={c.text} />
            <Text variant="label" style={{ flex: 1 }}>
              {tr('play.lobby.customTitle')}
            </Text>
            <Text variant="numeric" tone="muted">
              {tcKey === 'custom' ? `${tcLabel} · ${category}` : tr('play.lobby.pickOwn')}
            </Text>
            <Ionicons name={tcKey === 'custom' ? 'chevron-up' : 'chevron-down'} size={14} color={c.muted} />
          </Pressable>
          {tcKey === 'custom' && (
            <View style={{ gap: t.space.md, paddingHorizontal: 4 }}>
              <Stepper
                label={tr('play.lobby.minutes')}
                value={custom.min < 1 ? '½' : String(custom.min)}
                onDec={() => setCustom((v) => ({ ...v, min: step(MINUTES, v.min, -1) }))}
                onInc={() => setCustom((v) => ({ ...v, min: step(MINUTES, v.min, 1) }))}
              />
              <Stepper
                label={tr('play.lobby.increment')}
                value={`${custom.inc}s`}
                onDec={() => setCustom((v) => ({ ...v, inc: step(INCREMENTS, v.inc, -1) }))}
                onInc={() => setCustom((v) => ({ ...v, inc: step(INCREMENTS, v.inc, 1) }))}
              />
            </View>
          )}
        </GlassView>
      </View>

      {/* Options */}
      <View style={{ gap: t.space.md }}>
        <SectionHeader index={2} title={tr('play.lobby.options')} />
        <GlassView radius="xl" style={styles.options}>
          <OptionRow label={tr('play.lobby.mode')} hint={guest ? tr('server.signInRated') : rated ? tr('play.lobby.ratedHint') : tr('play.lobby.casualHint')}>
            <Segmented
              size="sm"
              value={rated ? 'rated' : 'casual'}
              onChange={(v) => setRated(v === 'rated')}
              options={[
                { value: 'casual', label: tr('play.casual') },
                { value: 'rated', label: tr('play.rated'), disabled: guest },
              ]}
            />
          </OptionRow>
          <View style={[styles.rule, { backgroundColor: c.border }]} />
          <OptionRow label={tr('play.lobby.opponent')} hint={window === 0 ? tr('play.lobby.autoHint') : tr('play.lobby.windowHint', { n: window })}>
            <Segmented<Window>
              size="sm"
              value={window}
              onChange={setWindow}
              options={[
                { value: 0, label: tr('play.lobby.auto') },
                { value: 100, label: '±100' },
                { value: 200, label: '±200' },
                { value: 400, label: '±400' },
              ]}
            />
          </OptionRow>
          <View style={[styles.rule, { backgroundColor: c.border }]} />
          <OptionRow label={tr('play.lobby.yourSide')} hint={tr('play.lobby.yourSideHint')}>
            <Segmented<ColorChoice>
              size="sm"
              value={color}
              onChange={setColor}
              options={[
                { value: 'w', label: tr('play.white') },
                { value: 'random', label: tr('play.random') },
                { value: 'b', label: tr('play.black') },
              ]}
            />
          </OptionRow>
        </GlassView>
      </View>

      {wide && <ActionPanel tcLabel={tcLabel} category={category} rated={rated} canStart={canStart} canCreate={canCreate} onPlay={play} onCreate={create} />}
    </View>
  );

  const side = (
    <View style={{ gap: t.space.xl }}>
      {liveGameId && (
        <GlassView padding="lg" radius="xl" style={{ gap: t.space.md }}>
          <Pill text={tr('play.lobby.gameInProgress')} tone="live" />
          <Text variant="heading">{tr('play.lobby.stillRunning')}</Text>
          <Button title={tr('play.lobby.resume')} onPress={() => router.push('/play/online')} rightIcon={<Ionicons name={dirIcon('arrow-forward')} size={16} color={c.onAccent} />} />
        </GlassView>
      )}
      {seeking && s.seek && <SeekingCard />}
      {s.openGame && (
        <GlassView padding="lg" radius="xl" style={{ gap: t.space.md }}>
          <Pill text={tr('play.lobby.posted')} tone="live" />
          <Text variant="heading">
            {tr(s.openGame.rated ? 'play.lobby.waitingRated' : 'play.lobby.waitingCasual', { tc: formatTimeControl(s.openGame.timeControl) })}
          </Text>
          <Text tone="muted">{tr('play.lobby.listedBelow')}</Text>
          <Button variant="secondary" title={tr('common.cancel')} onPress={() => playClient.cancelOpenGame()} />
        </GlassView>
      )}
      {s.error && (
        <GlassView padding="lg" radius="xl" style={{ gap: t.space.md, borderColor: c.danger }}>
          <Text tone="danger">{serverText(s.error)}</Text>
          <Button variant="secondary" size="sm" title={tr('common.dismiss')} onPress={() => playClient.clearError()} />
        </GlassView>
      )}
      <OpenGamesList />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Backdrop />
      <Stack.Screen options={{ title: tr('nav.play') }} />
      <ScrollView contentContainerStyle={[styles.page, { paddingBottom: wide ? 48 : 140 + insets.bottom }]}>
        <View style={[styles.inner, { maxWidth: wide ? 1160 : 640 }]}>
          <RestrictionBanner />
          <View style={styles.hero}>
            <View style={{ flex: 1, gap: 6, minWidth: 240 }}>
              <Text variant="display">
                {tr('play.lobby.findGame')}
              </Text>
              <Text tone="muted">{tr('play.lobby.intro')}</Text>
            </View>
            <View style={styles.stats}>
              {status ? <Pill text={status} tone="muted" /> : null}
            </View>
          </View>

          {wide ? (
            <View style={styles.columns}>
              <View style={{ flex: 1.35 }}>{setup}</View>
              <View style={{ flex: 1 }}>{side}</View>
            </View>
          ) : (
            <View style={{ gap: t.space.xl }}>
              {(liveGameId || seeking || s.openGame || s.error) && side}
              {setup}
              {!(liveGameId || seeking || s.openGame || s.error) && <OpenGamesList />}
            </View>
          )}
        </View>
      </ScrollView>

      <GameSetupSheet timeControl={timeControl} visible={setupOpen} onClose={() => setSetupOpen(false)} />
      {!wide && (
        <View pointerEvents="box-none" style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Glass radius={30} intensity={80} style={styles.dockBar}>
            <View style={styles.dockRow}>
              <View style={{ flex: 1, paddingStart: 10 }}>
                <Text variant="figure" style={{ fontSize: 22, lineHeight: 26 }}>
                  {tcLabel}
                </Text>
                <Text variant="overline" tone="muted">
                  {category} · {rated ? tr('play.rated') : tr('play.casual')}
                </Text>
              </View>
              <Button title={tr('play.lobby.createShort')} variant="ghost" size="md" disabled={!canCreate} onPress={create} />
              <Button title={tr('nav.play')} size="md" disabled={!canStart} onPress={play} rightIcon={<Ionicons name={dirIcon('arrow-forward')} size={16} color={c.onAccent} />} />
            </View>
          </Glass>
        </View>
      )}
    </View>
  );
}

function OptionRow({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  const t = useAppTheme();
  return (
    <View style={[styles.optionRow, { gap: t.space.md }]}>
      <View style={{ flex: 1, minWidth: 150, gap: 2 }}>
        <Text variant="label">{label}</Text>
        <Text variant="caption" tone="tertiary">
          {hint}
        </Text>
      </View>
      <View style={{ flexGrow: 1, flexBasis: 240, maxWidth: 360 }}>{children}</View>
    </View>
  );
}

/** Wide screens: summary of the chosen game and the two actions. */
function ActionPanel({
  tcLabel,
  category,
  rated,
  canStart,
  canCreate,
  onPlay,
  onCreate,
}: {
  tcLabel: string;
  category: string;
  rated: boolean;
  canStart: boolean;
  canCreate: boolean;
  onPlay: () => void;
  onCreate: () => void;
}) {
  const t = useAppTheme();
  const tr = useT();
  const c = t.colors;
  return (
    <GlassView radius="xl" padding="lg" strength="strong" style={styles.action}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="overline" tone="muted">
          {tr('play.lobby.ready')}
        </Text>
        <Text variant="figure" style={{ fontSize: 30, lineHeight: 34 }}>
          {tcLabel}{' '}
          <Text variant="body" tone="muted">
            {category} · {rated ? tr('play.rated') : tr('play.casual')}
          </Text>
        </Text>
      </View>
      <Button title={tr('play.lobby.post')} variant="secondary" disabled={!canCreate} onPress={onCreate} />
      <Button title={tr('play.lobby.playNow')} size="lg" disabled={!canStart} onPress={onPlay} rightIcon={<Ionicons name={dirIcon('arrow-forward')} size={18} color={c.onAccent} />} />
    </GlassView>
  );
}

function SeekingCard() {
  const t = useAppTheme();
  const tr = useT();
  const s = usePlay();
  useTicker(true);
  if (!s.seek) return null;
  const st = s.seekStatus;
  const waited = st ? st.waitedMs + (Date.now() - st.at) : 0;
  const secs = Math.floor(waited / 1000);
  return (
    <GlassView padding="lg" radius="xl" strength="strong" style={{ gap: t.space.md }}>
      <View style={styles.seekTop}>
        <Pill text={tr('play.lobby.searching')} tone="live" />
        <Text variant="clock">
          {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
        </Text>
      </View>
      <Text variant="title" style={{ fontSize: 28, lineHeight: 32 }}>
        {tr(s.seek.rated ? 'play.lobby.findingRated' : 'play.lobby.findingCasual', { tc: formatTimeControl(s.seek.timeControl) })}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {st && <Pill text={st.window === null ? tr('play.lobby.anyRating') : tr('play.lobby.ratingWindow', { n: st.window })} />}
        {st && <Pill text={tr('play.lobby.othersSearching', { count: st.poolSize })} />}
      </View>
      <Button variant="secondary" title={tr('play.lobby.cancelSearch')} onPress={() => playClient.cancelSeek()} />
    </GlassView>
  );
}

function OpenGamesList() {
  const t = useAppTheme();
  const tr = useT();
  const c = t.colors;
  const s = usePlay();
  const games = s.lobby?.openGames ?? [];
  const myRating = s.me?.rating ?? 1500;
  const sideText = (g: OpenGame) => (g.color === 'random' ? tr('play.random') : g.color === 'w' ? tr('play.lobby.youBlack') : tr('play.lobby.youWhite'));
  return (
    <View style={{ gap: t.space.md }}>
      <SectionHeader title={tr('play.lobby.openGames')} action={<Text variant="numeric" tone="tertiary">{games.length}</Text>} />
      <GlassView radius="xl" style={{ paddingVertical: games.length ? 6 : 0 }}>
        {games.length === 0 && (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { borderColor: c.border }]}>
              <Ionicons name="hourglass-outline" size={18} color={c.muted} />
            </View>
            <Text variant="label">{tr('play.lobby.noOpenTitle')}</Text>
            <Text variant="caption" tone="muted" align="center">
              {tr('play.lobby.noOpenBody')}
            </Text>
          </View>
        )}
        {games.map((g, i) => {
          const mine = g.by.id === s.me?.id;
          const outOfRange = g.range !== undefined && Math.abs(g.by.rating - myRating) > g.range;
          const needsAccount = g.rated && isGuest(s.me);
          return (
            <View key={g.id} style={[styles.openRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.border }]}>
              <Avatar name={g.by.name} size={34} />
              <View style={{ flex: 1, gap: 1 }}>
                <Text variant="label" numberOfLines={1}>
                  {g.by.name}{' '}
                  <Text variant="numeric" tone="muted" style={{ fontSize: 12 }}>
                    {g.by.rating}
                    {g.by.provisional ? '?' : ''}
                  </Text>
                </Text>
                <Text variant="caption" tone="tertiary" numberOfLines={1}>
                  {g.rated ? tr('play.rated') : tr('play.casual')} · {mine ? tr('play.lobby.yourGame') : sideText(g)}
                  {g.range ? ` · ±${g.range}` : ''}
                </Text>
              </View>
              <Text variant="numeric" style={{ minWidth: 48, textAlign: 'right', writingDirection: 'ltr' }}>
                {formatTimeControl(g.timeControl)}
              </Text>
              {mine ? (
                <Button variant="secondary" size="sm" title={tr('common.cancel')} onPress={() => playClient.cancelOpenGame()} />
              ) : (
                <Button
                  size="sm"
                  title={needsAccount ? tr('auth.signIn') : outOfRange ? tr('play.lobby.outOfRange') : tr('play.lobby.join')}
                  disabled={needsAccount || outOfRange || !!(s.game && !s.game.outcome)}
                  onPress={() => playClient.joinOpenGame(g.id)}
                />
              )}
            </View>
          );
        })}
      </GlassView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 24, alignItems: 'center' },
  inner: { width: '100%', gap: 28 },
  hero: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 },
  stats: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: 28 },
  group: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  groupStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 8 },
  groupLabel: { width: 96, flexDirection: 'row', alignItems: 'center', gap: 6 },
  tiles: { flex: 1, flexDirection: 'row', gap: 8 },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 14, height: 48, borderStyle: 'dashed' },
  options: { paddingHorizontal: 18, paddingVertical: 6 },
  optionRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', paddingVertical: 14 },
  rule: { height: StyleSheet.hairlineWidth },
  action: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  seekTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 32, paddingHorizontal: 24 },
  emptyIcon: { width: 40, height: 40, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, alignItems: 'center' },
  dockBar: {
    width: '100%',
    maxWidth: 560,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  dockRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 7 },
});
