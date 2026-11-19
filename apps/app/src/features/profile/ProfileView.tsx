import { countryFlag, type PublicProfile, type RatingPoint, type RecentGame, type TimeCategory } from '@chessmate/core';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { Button, Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH, useTheme } from '@/constants/theme';
import { useAccountSession } from '@/features/account/session';
import { formatDate, translate, useT } from '@/i18n';
import { countryLabel } from '@/i18n/chess';
import { reasonText } from '@/components/play/GameOverCard';

import { Avatar } from './Avatar';
import { Divider, Segmented, SectionTitle } from './controls';
import { RatingGraph } from './RatingGraph';
import { RoleTagBadge } from '@/features/titles/RoleTagBadge';
import { PlayerTagBadge } from '@/features/titles/PlayerTagBadge';
import { ProfileActions } from './ProfileActions';
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

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.inner}>
          {!username && !session.signedIn ? (
            <Card>
              <Label size={18} bold>
                {tr('profile.signInTitle')}
              </Label>
              <Label muted>{tr('profile.signInBody')}</Label>
              <View style={styles.actions}>
                <View style={{ flex: 1 }}>
                  <Button title={tr('auth.signIn')} onPress={() => router.push({ pathname: '/sign-in', params: { next: '/profile' } })} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button variant="secondary" title={tr('settings.title')} onPress={() => router.push('/settings')} />
                </View>
              </View>
            </Card>
          ) : error ? (
            <Card>
              <Label bold>{tr('profile.loadFailed')}</Label>
              <Label muted>{error}</Label>
              <Button variant="secondary" title={tr('common.tryAgain')} onPress={() => setReload((n) => n + 1)} />
            </Card>
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
  const t = useTheme();
  const tr = useT();
  const played = profile.ratings.filter((r) => r.games > 0);
  const [category, setCategory] = useState<TimeCategory>((played.sort((a, b) => b.games - a.games)[0]?.category as TimeCategory) ?? 'blitz');
  const country = countryLabel(profile.country);
  const joined = formatDate(profile.createdAt, { month: 'long', year: 'numeric' });
  const { totals } = profile;

  return (
    <>
      <Card>
        <View style={styles.header}>
          <Avatar avatar={profile.avatar} name={profile.displayName} size={84} />
          <View style={{ flex: 1, gap: 4 }}>
            <View style={styles.meta}>
              <TitleBadge title={profile.title} size="md" />
              <Text style={[styles.name, { color: t.text, flexShrink: 1 }]} numberOfLines={1}>
                {profile.displayName}
              </Text>
              <RoleTagBadge tag={profile.roleTag} size="md" />
            </View>
            {profile.playerTag ? (
              <View style={styles.meta}>
                <PlayerTagBadge tag={profile.playerTag} />
              </View>
            ) : null}
            <View style={styles.meta}>
              <Text style={{ color: t.muted }}>@{profile.username}</Text>
              {profile.online !== null && (
                <View style={styles.meta}>
                  <View style={[styles.onlineDot, { backgroundColor: profile.online ? '#2FBF71' : t.muted }]} />
                  <Text style={{ color: t.muted }}>{profile.online ? tr('profile.online') : tr('play.offline')}</Text>
                </View>
              )}
            </View>
            <Text style={{ color: t.muted }}>
              {country ? `${countryFlag(profile.country)} ${country} · ` : ''}{tr('profile.joined', { date: joined })}
            </Text>
          </View>
        </View>
        {profile.bio ? <Label>{profile.bio}</Label> : profile.isMe ? <Label muted>{tr('profile.addBio')}</Label> : null}
        <ProfileActions profile={profile} />
      </Card>

      <View style={styles.tiles}>
        {profile.ratings.map((r) => {
          const on = r.category === category;
          return (
            <Pressable
              key={r.category}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setCategory(r.category)}
              style={[styles.tile, { borderColor: on ? t.text : t.glassBorder, backgroundColor: t.surface }]}>
              <Text style={[styles.tileLabel, { color: t.muted }]}>{categoryLabel(r.category)}</Text>
              <Text style={[styles.tileValue, { color: t.text }]}>
                {r.rating}
                {r.provisional ? '?' : ''}
              </Text>
              <Text style={{ color: t.muted, fontSize: 12 }}>{r.games === 0 ? tr('nav.unrated') : tr('profile.gamesPeak', { count: r.games, peak: r.peak })}</Text>
            </Pressable>
          );
        })}
      </View>

      <Card>
        <SectionTitle>{tr('profile.categoryRating', { category: categoryLabel(category) })}</SectionTitle>
        <RatingHistory username={profile.username} category={category} />
      </Card>

      <Card>
        <SectionTitle>{tr('profile.allGames')}</SectionTitle>
        <ResultBar wins={totals.wins} draws={totals.draws} losses={totals.losses} />
        <StatsByCategory profile={profile} />
      </Card>

      <Card>
        <SectionTitle>{tr('profile.recentGames')}</SectionTitle>
        {profile.recentGames === null ? (
          <Label muted>{tr('profile.gamesPrivate', { name: profile.displayName })}</Label>
        ) : profile.recentGames.length === 0 ? (
          <Label muted>{tr('profile.noGames')}</Label>
        ) : (
          profile.recentGames.map((g, i) => (
            <View key={g.id} style={{ gap: 10 }}>
              {i > 0 && <Divider />}
              <GameRow game={g} />
            </View>
          ))
        )}
      </Card>
    </>
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
  if (state.error) return <Label muted>{state.error}</Label>;
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

function GameRow({ game }: { game: RecentGame }) {
  const t = useTheme();
  const tr = useT();
  const mark = game.outcome === 'win' ? tr('profile.w') : game.outcome === 'loss' ? tr('profile.l') : tr('profile.d');
  const when = formatDate(game.endedAt, { day: 'numeric', month: 'short' });
  return (
    <View style={styles.game}>
      <View
        style={[
          styles.badge,
          game.outcome === 'win' ? { backgroundColor: t.accent } : { borderWidth: 1, borderColor: t.border, backgroundColor: game.outcome === 'draw' ? t.surface : 'transparent' },
        ]}>
        <Text style={{ color: game.outcome === 'win' ? t.onAccent : t.text, fontWeight: '700' }}>{mark}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: t.text, fontSize: 15 }} numberOfLines={1}>
          <Text style={{ color: t.muted }}>{game.color === 'w' ? '○ ' : '● '}</Text>
          {tr('profile.vs', { name: game.opponent.username })} <Text style={{ color: t.muted }}>({game.opponent.rating})</Text>
        </Text>
        <Text style={{ color: t.muted, fontSize: 13 }}>
          {game.timeControl} {categoryLabel(game.category)} · {tr(game.outcome === 'draw' ? 'profile.resultDraw' : game.outcome === 'win' ? 'profile.resultWon' : 'profile.resultLost')}{' '}
          {reasonText(game.reason)} · {tr('profile.moves', { count: game.moves })} · {when}
        </Text>
      </View>
      {game.rated && game.ratingDelta !== null && (
        <Text style={[styles.delta, { color: t.text }]}>
          {game.ratingDelta > 0 ? `+${game.ratingDelta}` : game.ratingDelta === 0 ? '±0' : `−${Math.abs(game.ratingDelta)}`}
        </Text>
      )}
    </View>
  );
}


const styles = StyleSheet.create({
  page: { padding: 16, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 16 },
  header: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  name: { fontSize: 24, fontWeight: '700', letterSpacing: -0.4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  actions: { flexDirection: 'row', gap: 8 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { flexGrow: 1, flexBasis: 140, borderWidth: 1, borderRadius: 16, padding: 12, gap: 2 },
  tileLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  tileValue: { fontSize: 26, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  bar: { height: 10, borderRadius: 5, overflow: 'hidden', flexDirection: 'row' },
  legend: { flexDirection: 'row', gap: 8 },
  legendValue: { fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  swatch: { width: 10, height: 10, borderRadius: 2, borderWidth: StyleSheet.hairlineWidth },
  statRow: { flexDirection: 'row' },
  statCell: { flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
  statFirst: { flex: 2, textAlign: 'left' },
  game: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  delta: { fontWeight: '700', fontVariant: ['tabular-nums'], minWidth: 36, textAlign: 'right' },
});
