import { type PublicProfile, type RatingPoint, type RecentGame, type TimeCategory } from '@chessmate/core';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH, useTheme } from '@/constants/theme';
import { useAccountSession } from '@/features/account/session';
import { formatDate, translate, useT } from '@/i18n';
import { CountryFlag } from '@/components/CountryFlag';
import { countryLabel } from '@/i18n/chess';
import { reasonText } from '@/components/play/GameOverCard';
import { serverText } from '@/i18n/serverMessages';
import { Badge, Button, GlassView, ListGroup, ListRow, Row, SectionHeader, Stack, Text, useAppTheme } from '@/ui';

import { Avatar } from './Avatar';
import { RatingGraph } from './RatingGraph';
import { RoleTagBadge } from '@/features/titles/RoleTagBadge';
import { PlayerTagBadge } from '@/features/titles/PlayerTagBadge';
import { ProfileActions } from './ProfileActions';
import { HeadToHeadCard } from '@/components/HeadToHead';
import { AwardsSummary } from '@/features/awards/AwardsSummary';
import { ProfileStreamer } from '@/features/watch/ProfileStreamer';
import { TitleBadge } from '@/features/titles/TitleBadge';

const categoryLabel = (c: TimeCategory) => translate(`common.category.${c}`);

/** Loads and shows a profile. `username` null means the signed-in player. */
export function ProfileView({ username }: { username: string | null }) {
  const session = useAccountSession();
  const tr = useT();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    setError(null);
    const path = username ? `/api/profiles/${encodeURIComponent(username)}` : '/api/me/profile';
    session
      .apiFetch<PublicProfile>(path)
      .then((p) => live && setProfile(p))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [username, session, reload]);

  // Back on this screen (after a game, a rating change, a new friend): fetch it again.
  const visited = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (visited.current) setReload((n) => n + 1);
      visited.current = true;
    }, []),
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.inner}>
          {!username && !session.signedIn ? (
            <GlassView radius="xl" padding="lg" style={{ gap: 12 }}>
              <Text variant="heading">{tr('profile.signInTitle')}</Text>
              <Text tone="muted">{tr('profile.signInBody')}</Text>
              <View style={styles.actions}>
                <View style={{ flex: 1 }}>
                  <Button fullWidth title={tr('auth.signIn')} onPress={() => router.push({ pathname: '/sign-in', params: { next: '/profile' } })} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button fullWidth variant="secondary" title={tr('settings.title')} onPress={() => router.push('/settings')} />
                </View>
              </View>
            </GlassView>
          ) : error ? (
            <GlassView radius="xl" padding="lg" style={{ gap: 12, alignItems: 'flex-start' }}>
              <Text variant="heading">{tr('profile.loadFailed')}</Text>
              <Text tone="muted">{serverText(error)}</Text>
              <Button variant="secondary" title={tr('common.tryAgain')} onPress={() => setReload((n) => n + 1)} />
            </GlassView>
          ) : !profile ? (
            <ActivityIndicator style={{ marginTop: 48 }} />
          ) : (
            <ProfileBody profile={profile} />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

function ProfileBody({ profile }: { profile: PublicProfile }) {
  const tr = useT();
  const { signedIn } = useAccountSession();
  const c = useAppTheme().colors;
  const played = profile.ratings.filter((r) => r.games > 0);
  const [category, setCategory] = useState<TimeCategory>(([...played].sort((a, b) => b.games - a.games)[0]?.category as TimeCategory) ?? 'blitz');
  const country = countryLabel(profile.country);
  const joined = formatDate(profile.createdAt, { month: 'long', year: 'numeric' });
  const { totals } = profile;
  const totalGames = totals.wins + totals.draws + totals.losses;
  const best = played.length ? played.reduce((a, b) => (b.rating > a.rating ? b : a)) : null;

  return (
    <>
      <GlassView radius="xl" padding="lg" elevation="lg" style={{ gap: 16 }}>
        <View style={styles.hero}>
          <Avatar avatar={profile.avatar} name={profile.displayName} size={88} />
          <Stack gap="xs" flex={1} style={{ minWidth: 200 }}>
            <Row gap="sm" wrap>
              <TitleBadge title={profile.title} size="md" />
              <Text variant="title" numberOfLines={1} style={{ flexShrink: 1 }}>
                {profile.displayName}
              </Text>
              <RoleTagBadge tag={profile.roleTag} size="md" />
            </Row>
            <Row gap="sm" wrap>
              <Text tone="muted">@{profile.username}</Text>
              {profile.online !== null &&
                (profile.online ? <Badge tone="live" label={tr('profile.online')} /> : <Badge tone="outline" label={tr('play.offline')} />)}
              {profile.playerTag ? <PlayerTagBadge tag={profile.playerTag} /> : null}
            </Row>
            <Row gap="xs" wrap>
              <CountryFlag code={profile.country} decorative />
              <Text variant="caption" tone="muted">
                {country ? `${country} · ` : ''}
                {tr('profile.joined', { date: joined })}
              </Text>
            </Row>
          </Stack>
        </View>
        {profile.bio ? <Text>{profile.bio}</Text> : profile.isMe ? <Text tone="muted">{tr('profile.addBio')}</Text> : null}
        <View style={[styles.heroStats, { borderTopColor: c.border }]}>
          <HeroStat value={best ? `${best.rating}` : '—'} label={best ? tr('profile.bestRating', { category: categoryLabel(best.category) }) : tr('nav.unrated')} />
          <HeroStat value={`${totalGames}`} label={tr('profile.games')} />
          <HeroStat value={totalGames ? `${Math.round(((totals.wins + totals.draws / 2) / totalGames) * 100)}%` : '—'} label={tr('profile.score')} />
        </View>
        <ProfileActions profile={profile} />
      </GlassView>

      {!profile.isMe && signedIn && <HeadToHeadCard userId={profile.id} name={profile.displayName} />}

      <ProfileStreamer userId={profile.id} />

      <AwardsSummary username={profile.username} isMe={profile.isMe} />

      <Stack gap="sm">
        <SectionHeader title={tr('profile.ratings')} />
        <View style={styles.tiles}>
          {profile.ratings.map((r) => {
            const on = r.category === category;
            return (
              <Pressable
                key={r.category}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setCategory(r.category)}
                style={styles.tileWrap}>
                {({ pressed }) => (
                  <GlassView
                    radius="lg"
                    padding="md"
                    elevation={on ? 'md' : 'sm'}
                    style={[styles.tile, { borderColor: on ? c.accent : 'transparent', opacity: pressed ? 0.8 : 1 }]}>
                    <Text variant="overline" tone="muted">
                      {categoryLabel(r.category)}
                    </Text>
                    <Text variant="figure">
                      {r.rating}
                      {r.provisional ? '?' : ''}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {r.games === 0 ? tr('nav.unrated') : tr('profile.gamesPeak', { count: r.games, peak: r.peak })}
                    </Text>
                  </GlassView>
                )}
              </Pressable>
            );
          })}
        </View>
      </Stack>

      <Stack gap="sm">
        <SectionHeader title={tr('profile.categoryRating', { category: categoryLabel(category) })} />
        <GlassView radius="lg" padding="lg">
          <RatingHistory username={profile.username} category={category} />
        </GlassView>
      </Stack>

      <Stack gap="sm">
        <SectionHeader title={tr('profile.allGames')} />
        <GlassView radius="lg" padding="lg" style={{ gap: 16 }}>
          <ResultBar wins={totals.wins} draws={totals.draws} losses={totals.losses} />
          <StatsByCategory profile={profile} />
        </GlassView>
      </Stack>

      <Stack gap="sm">
        <SectionHeader title={tr('profile.recentGames')} />
        {profile.recentGames === null ? (
          <GlassView radius="lg" padding="lg">
            <Text tone="muted">{tr('profile.gamesPrivate', { name: profile.displayName })}</Text>
          </GlassView>
        ) : profile.recentGames.length === 0 ? (
          <GlassView radius="lg" padding="lg">
            <Text tone="muted">{tr('profile.noGames')}</Text>
          </GlassView>
        ) : (
          <>
            <ListGroup>
              {profile.recentGames.map((g) => (
                <GameRow key={g.id} game={g} />
              ))}
            </ListGroup>
            <Text variant="caption" tone="tertiary" style={{ paddingHorizontal: 4 }}>
              {tr('profile.gamesHint')}
            </Text>
          </>
        )}
      </Stack>
    </>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text variant="numeric" style={{ fontSize: 20, lineHeight: 26 }}>
        {value}
      </Text>
      <Text variant="caption" tone="muted" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function RatingHistory({ username, category }: { username: string; category: TimeCategory }) {
  const session = useAccountSession();
  const [state, setState] = useState<{ points: RatingPoint[] | null; error: string | null; loading: boolean }>({ points: null, error: null, loading: true });
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    session
      .apiFetch<{ points: RatingPoint[] }>(`/api/profiles/${encodeURIComponent(username)}/rating-history?category=${category}`)
      .then((r) => live && setState({ points: r.points, error: null, loading: false }))
      .catch((e: Error) => live && setState({ points: null, error: e.message, loading: false }));
    return () => {
      live = false;
    };
  }, [username, category, session]);
  if (state.loading && !state.points) return <ActivityIndicator style={{ height: 160 }} />;
  if (state.error) return <Text tone="muted">{serverText(state.error)}</Text>;
  return <RatingGraph points={state.points ?? []} />;
}

function ResultBar({ wins, draws, losses }: { wins: number; draws: number; losses: number }) {
  const t = useTheme();
  const tr = useT();
  const total = wins + draws + losses;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
  const parts = [
    { label: tr('profile.won'), n: wins, color: t.text },
    { label: tr('profile.drawn'), n: draws, color: t.muted },
    { label: tr('profile.lost'), n: losses, color: t.border },
  ];
  return (
    <View style={{ gap: 10 }}>
      <View style={[styles.bar, { backgroundColor: t.border }]}>
        {total > 0 && parts.map((p) => <View key={p.label} style={{ flex: p.n, backgroundColor: p.color }} />)}
      </View>
      <View style={styles.legend}>
        {parts.map((p) => (
          <View key={p.label} style={{ flex: 1 }}>
            <Text style={[styles.legendValue, { color: t.text }]}>{p.n}</Text>
            <View style={styles.meta}>
              <View style={[styles.swatch, { backgroundColor: p.color, borderColor: t.muted }]} />
              <Text style={{ color: t.muted, fontSize: 13 }}>
                {p.label} · {pct(p.n)}%
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function StatsByCategory({ profile }: { profile: PublicProfile }) {
  const t = useTheme();
  const tr = useT();
  const rows = profile.ratings.filter((r) => r.games > 0);
  if (rows.length === 0) return null;
  return (
    <View style={{ gap: 6, marginTop: 4 }}>
      <View style={styles.statRow}>
        {['', tr('profile.games'), tr('profile.w'), tr('profile.d'), tr('profile.l')].map((h, i) => (
          <Text key={i} style={[styles.statCell, h === '' && styles.statFirst, { color: t.muted, fontSize: 12, fontWeight: '600' }]}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((r) => (
        <View key={r.category} style={styles.statRow}>
          {[categoryLabel(r.category), r.games, r.wins, r.draws, r.losses].map((v, i) => (
            <Text key={i} style={[styles.statCell, i === 0 && styles.statFirst, { color: t.text }]}>
              {v}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const openGame = (game: RecentGame, review = false) =>
  router.push({ pathname: '/game/[id]', params: { id: game.id, side: game.color, ...(review ? { review: '1' } : {}) } });

function GameRow({ game }: { game: RecentGame }) {
  const c = useAppTheme().colors;
  const tr = useT();
  const mark = game.outcome === 'win' ? tr('profile.w') : game.outcome === 'loss' ? tr('profile.l') : tr('profile.d');
  const when = formatDate(game.endedAt, { day: 'numeric', month: 'short' });
  const result = tr(game.outcome === 'draw' ? 'profile.resultDraw' : game.outcome === 'win' ? 'profile.resultWon' : 'profile.resultLost');
  const d = game.rated && game.ratingDelta !== null ? Math.round(game.ratingDelta) : null;
  return (
    <ListRow
      onPress={() => openGame(game)}
      left={
        <View
          style={[
            styles.mark,
            game.outcome === 'win'
              ? { backgroundColor: c.accent }
              : { borderWidth: 1, borderColor: c.borderStrong, backgroundColor: game.outcome === 'draw' ? c.surface : 'transparent' },
          ]}>
          <Text variant="label" color={game.outcome === 'win' ? c.onAccent : c.text} style={{ fontWeight: '700' }}>
            {mark}
          </Text>
        </View>
      }
      title={`${game.color === 'w' ? '○' : '●'} ${tr('profile.vs', { name: game.opponent.username })} (${game.opponent.rating})`}
      subtitle={`${game.timeControl} ${categoryLabel(game.category)} · ${result} ${reasonText(game.reason)} · ${tr('profile.moves', { count: game.moves })} · ${when}`}
      right={
        <Row gap="sm">
          {d !== null && (
            <Text variant="numeric" tone={d > 0 ? 'success' : d < 0 ? 'danger' : 'muted'} style={styles.delta}>
              {d > 0 ? `+${d}` : d === 0 ? '±0' : `−${Math.abs(d)}`}
            </Text>
          )}
          {game.moves > 0 && <Button size="sm" variant="secondary" title={tr('profile.review')} onPress={() => openGame(game, true)} />}
        </Row>
      }
      chevron
    />
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 24 },
  hero: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'center' },
  heroStats: { flexDirection: 'row', gap: 12, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
  actions: { flexDirection: 'row', gap: 8 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tileWrap: { flexGrow: 1, flexBasis: 140 },
  tile: { gap: 2, borderWidth: 1.5 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  bar: { height: 10, borderRadius: 5, overflow: 'hidden', flexDirection: 'row' },
  legend: { flexDirection: 'row', gap: 8 },
  legendValue: { fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  swatch: { width: 10, height: 10, borderRadius: 2, borderWidth: StyleSheet.hairlineWidth },
  statRow: { flexDirection: 'row' },
  statCell: { flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
  statFirst: { flex: 2, textAlign: 'left' },
  mark: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  delta: { minWidth: 36, textAlign: 'right' },
});
