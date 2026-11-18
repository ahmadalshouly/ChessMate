import Ionicons from '@expo/vector-icons/Ionicons';
import type { AdminGameSummary, AdminPlayerSummary, StaffRole } from '@chessmate/core';
import { router } from 'expo-router';
import { useCallback, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';

import { dirIcon, formatAgo, formatDateTime, formatNumber, useT, type TFunction } from '@/i18n';
import { Avatar, Badge, GlassView, Row, Screen, SectionHeader, Stack, Text, useAppTheme, type BadgeTone } from '@/ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Title block at the top of each console page. */
export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <Row gap="md" align="flex-end" justify="space-between" wrap>
      <Stack gap="xs" style={{ flexShrink: 1, minWidth: 220 }}>
        <Text variant="title">{title}</Text>
        {subtitle ? <Text tone="muted">{subtitle}</Text> : null}
      </Stack>
      {right}
    </Row>
  );
}

/** Numbered section: mono header + glass panel. */
export function Section({ title, index, action, children, padding = 'lg' }: { title: string; index?: number; action?: ReactNode; children: ReactNode; padding?: 'none' | 'lg' }) {
  return (
    <Stack gap="sm">
      <SectionHeader title={title} index={index} action={action} />
      <GlassView radius="lg" padding={padding} flat>
        {children}
      </GlassView>
    </Stack>
  );
}

/** A single figure with its label; tappable when it leads somewhere. */
export function StatTile({ label, value, hint, tone, onPress, icon }: { label: string; value: number | string; hint?: string; tone?: 'danger' | 'warning' | 'success'; onPress?: () => void; icon?: IconName }) {
  const { colors: c } = useAppTheme();
  const body = (
    <GlassView radius="md" padding="lg" flat style={styles.tile}>
      <Row justify="space-between" align="flex-start">
        <Text variant="overline" tone="muted" style={{ flex: 1 }}>
          {label}
        </Text>
        {icon ? <Ionicons name={icon} size={15} color={tone ? c[tone] : c.textTertiary} /> : null}
      </Row>
      <Text variant="figure" style={{ marginTop: 10 }}>
        {typeof value === 'number' ? formatNumber(value) : value}
      </Text>
      {hint ? (
        <Text variant="caption" tone="tertiary">
          {hint}
        </Text>
      ) : null}
      {tone && typeof value === 'number' && value > 0 ? <View style={[styles.tileAccent, { backgroundColor: c[tone] }]} /> : null}
    </GlassView>
  );
  if (!onPress) return <View style={styles.tileWrap}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.tileWrap, { opacity: pressed ? 0.75 : 1 }]}>
      {body}
    </Pressable>
  );
}

export function TileGrid({ children }: { children: ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

/**
 * One series of daily counts as bars (single series: no legend, the title names
 * it). Tap or hover a bar to read its day and value.
 */
export function DailyBars({ title, data }: { title: string; data: { day: string; value: number }[] }) {
  const { colors: c } = useAppTheme();
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  const shown = active === null ? null : data[active];
  return (
    <Stack gap="sm" style={{ flex: 1, minWidth: 240 }}>
      <Row justify="space-between">
        <Text variant="label" tone="muted">
          {title}
        </Text>
        <Text variant="numeric">{shown ? `${shown.day.slice(5)} · ${formatNumber(shown.value)}` : formatNumber(total)}</Text>
      </Row>
      <View style={[styles.bars, { borderBottomColor: c.border, direction: 'ltr' } as never]}>
        {data.map((d, i) => (
          <Pressable
            key={d.day}
            accessibilityLabel={`${d.day}: ${d.value}`}
            onPress={() => setActive(active === i ? null : i)}
            onHoverIn={() => setActive(i)}
            onHoverOut={() => setActive(null)}
            style={styles.barHit}>
            <View
              style={{
                height: d.value === 0 ? 2 : Math.max(4, (d.value / max) * 84),
                borderTopLeftRadius: 4,
                borderTopRightRadius: 4,
                backgroundColor: d.value === 0 ? c.border : c.text,
                opacity: active === null || active === i ? 1 : 0.35,
              }}
            />
          </Pressable>
        ))}
      </View>
      <Row justify="space-between">
        <Text variant="caption" tone="tertiary">
          {data[0]?.day.slice(5)}
        </Text>
        <Text variant="caption" tone="tertiary">
          {data[data.length - 1]?.day.slice(5)}
        </Text>
      </Row>
    </Stack>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  const { colors: c } = useAppTheme();
  return (
    <Stack gap="sm" align="center" style={{ paddingVertical: 28, paddingHorizontal: 16, maxWidth: 460, alignSelf: 'center' }}>
      <View style={[styles.emptyIcon, { borderColor: c.border }]}>
        <Ionicons name={icon} size={18} color={c.muted} />
      </View>
      <Text variant="bodyStrong" align="center">
        {title}
      </Text>
      {body ? (
        <Text tone="muted" align="center">
          {body}
        </Text>
      ) : null}
      {action}
    </Stack>
  );
}

export function ErrorLine({ message }: { message: string | null }) {
  const { colors: c } = useAppTheme();
  if (!message) return null;
  return (
    <Row gap="xs">
      <Ionicons name="alert-circle-outline" size={15} color={c.danger} />
      <Text tone="danger" variant="caption">
        {message}
      </Text>
    </Row>
  );
}

export function roleTone(role: StaffRole): BadgeTone {
  return role === 'admin' ? 'solid' : role === 'moderator' ? 'outline' : 'neutral';
}

/** Account status chips: role, closed, muted, live, fair play. */
export function PlayerBadges({ p }: { p: AdminPlayerSummary }) {
  const tr = useT();
  return (
    <Row gap="xs" wrap>
      {p.role !== 'user' && <Badge label={tr(`admin.roles.${p.role}`)} tone={roleTone(p.role)} />}
      {p.status === 'closed' && <Badge label={tr('admin.status.closed')} tone="danger" />}
      {p.playingGameId ? <Badge label={tr('admin.status.playing')} tone="live" /> : p.online ? <Badge label={tr('admin.status.online')} tone="success" /> : null}
      {p.chatMutedUntil && <Badge label={tr('admin.status.muted')} tone="warning" />}
      {p.fairPlay === 'open' && <Badge label={tr('admin.nav.fairplay')} tone="warning" />}
      {p.devAccount && <Badge label={tr('admin.status.dev')} />}
    </Row>
  );
}

export function PlayerRow({ p, last }: { p: AdminPlayerSummary; last?: boolean }) {
  const { colors: c } = useAppTheme();
  const tr = useT();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/admin/players/${encodeURIComponent(p.id)}`)}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
        (pressed || hovered) && { backgroundColor: c.surfaceSunken },
      ]}>
      <Avatar name={p.username} size={38} status={p.playingGameId ? 'playing' : p.online ? 'online' : undefined} />
      <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
        <Row gap="sm" wrap>
          <Text variant="bodyStrong" numberOfLines={1}>
            {p.username}
          </Text>
          <PlayerBadges p={p} />
        </Row>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {[p.email, tr('admin.player.joined', { date: formatDateTime(p.createdAt).split(',')[0] ?? '' }), p.openReports ? tr('admin.players.reports', { count: p.openReports }) : null].filter(Boolean).join(' · ')}
        </Text>
      </Stack>
      <Text variant="numeric" tone="muted">
        {p.blitz}
      </Text>
      <Ionicons name={dirIcon('chevron-forward')} size={14} color={c.textTertiary} />
    </Pressable>
  );
}

export const tcLabel = (g: Pick<AdminGameSummary, 'initialMs' | 'incrementMs'>) => `${Math.round(g.initialMs / 60000) || g.initialMs / 60000}+${g.incrementMs / 1000}`;

export function GameRow({ g, last, tr }: { g: AdminGameSummary; last?: boolean; tr: TFunction }) {
  const { colors: c } = useAppTheme();
  const side = (s: AdminGameSummary['white']) => `${s.name}${s.ratingBefore ? ` (${Math.round(s.ratingBefore)})` : ''}`;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/admin/games/${encodeURIComponent(g.id)}`)}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
        (pressed || hovered) && { backgroundColor: c.surfaceSunken },
      ]}>
      <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {`${side(g.white)}  –  ${side(g.black)}`}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {[tcLabel(g), tr(g.rated ? 'admin.games.rated' : 'admin.games.casual'), g.endReason ? tr(`admin.games.reasons.${g.endReason}` as never) : null, formatAgo(g.startedAt)].filter(Boolean).join(' · ')}
        </Text>
      </Stack>
      {g.live ? <Badge label={tr('admin.status.live')} tone="live" /> : <Text variant="numeric">{g.result === '*' ? '–' : g.result.replace('1/2', '½')}</Text>}
      <Ionicons name={dirIcon('chevron-forward')} size={14} color={c.textTertiary} />
    </Pressable>
  );
}

/** Label / value pair for detail panels. */
export function Field({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <Stack gap="xxs" style={{ minWidth: 140, flexGrow: 1, flexBasis: 160 }}>
      <Text variant="overline" tone="tertiary">
        {label}
      </Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text variant={mono ? 'mono' : 'body'} selectable numberOfLines={2}>
          {value}
        </Text>
      ) : (
        value
      )}
    </Stack>
  );
}

/** Score as a short meter: grey below the queue threshold (50), then ink. */
export function ScoreMeter({ score, width = 64 }: { score: number; width?: number }) {
  const { colors: c } = useAppTheme();
  return (
    <View style={{ alignItems: 'flex-end', gap: 4 }}>
      <Text variant="numeric">{score}</Text>
      <View style={{ width, height: 4, borderRadius: 2, backgroundColor: c.border, overflow: 'hidden', direction: 'ltr' } as never}>
        <View style={{ width: `${Math.min(100, Math.max(0, score))}%`, height: 4, borderRadius: 2, backgroundColor: score >= 75 ? c.danger : score >= 50 ? c.warning : c.textTertiary }} />
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  tileWrap: { flexGrow: 1, flexBasis: 120, minWidth: 120 },
  tile: { minHeight: 104, overflow: 'hidden' },
  tileAccent: { position: 'absolute', left: 0, top: 18, bottom: 18, width: 3, borderTopRightRadius: 2, borderBottomRightRadius: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 90, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth },
  barHit: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  emptyIcon: { width: 40, height: 40, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 60 },
});

/** Scrolling page for console screens (wide column; clears the status bar where there is no header). */
export function AdminPage({ children, onRefresh, refreshing }: { children: ReactNode; onRefresh?: () => void; refreshing?: boolean }) {
  const { width } = useWindowDimensions();
  const wide = width >= 960;
  return (
    <Screen
      scroll
      width="wide"
      gap="xl"
      padding={wide ? 'xxxl' : 'lg'}
      edges={wide ? ['top', 'bottom'] : ['bottom']}
      scrollProps={onRefresh ? { refreshControl: <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> } : undefined}>
      {children}
    </Screen>
  );
}

/** Loads data for a console screen, with loading, error and reload. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);
  useEffect(() => {
    let live = true;
    setLoading(true);
    run()
      .then((d) => live && (setData(d), setError(null)))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [run, tick]);
  return { data, setData, error, loading, reload: () => setTick((n) => n + 1) };
}
