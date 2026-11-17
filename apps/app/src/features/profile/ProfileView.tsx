import { countryFlag, countryName, type PublicProfile, type RatingPoint, type RecentGame, type TimeCategory } from '@chessmate/core';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { Button, Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH, useTheme } from '@/constants/theme';
import { useAccountSession } from '@/features/account/session';

import { Avatar } from './Avatar';
import { Divider, Segmented, SectionTitle } from './controls';
import { RatingGraph } from './RatingGraph';

const CATEGORY_LABEL: Record<TimeCategory, string> = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', classical: 'Classical', correspondence: 'Daily' };

/** Loads and shows a profile. `username` null means the signed-in player. */
export function ProfileView({ username }: { username: string | null }) {
  const session = useAccountSession();
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
                Sign in to see your profile
              </Label>
              <Label muted>Your ratings, stats and game history live on your account.</Label>
            </Card>
          ) : error ? (
            <Card>
              <Label bold>Couldn't load this profile</Label>
              <Label muted>{error}</Label>
              <Button variant="secondary" title="Try again" onPress={() => setReload((n) => n + 1)} />
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
  const played = profile.ratings.filter((r) => r.games > 0);
  const [category, setCategory] = useState<TimeCategory>((played.sort((a, b) => b.games - a.games)[0]?.category as TimeCategory) ?? 'blitz');
  const country = countryName(profile.country);
  const joined = new Date(profile.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const { totals } = profile;

  return (
    <>
      <Card>
        <View style={styles.header}>
          <Avatar avatar={profile.avatar} name={profile.displayName} size={84} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>
              {profile.displayName}
            </Text>
            <View style={styles.meta}>
              <Text style={{ color: t.muted }}>@{profile.username}</Text>
              {profile.online !== null && (
                <View style={styles.meta}>
                  <View style={[styles.onlineDot, { backgroundColor: profile.online ? '#2FBF71' : t.muted }]} />
                  <Text style={{ color: t.muted }}>{profile.online ? 'Online' : 'Offline'}</Text>
                </View>
              )}
            </View>
            <Text style={{ color: t.muted }}>
              {country ? `${countryFlag(profile.country)} ${country} · ` : ''}Joined {joined}
            </Text>
          </View>
        </View>
        {profile.bio ? <Label>{profile.bio}</Label> : profile.isMe ? <Label muted>Add a short bio so opponents know who they're playing.</Label> : null}
        {profile.isMe && (
          <View style={styles.actions}>
            <View style={{ flex: 1 }}>
              <Button variant="secondary" title="Edit profile" onPress={() => router.push('/profile/edit')} />
            </View>
            <View style={{ flex: 1 }}>
              <Button variant="secondary" title="Settings" onPress={() => router.push('/settings')} />
            </View>
          </View>
        )}
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
              <Text style={[styles.tileLabel, { color: t.muted }]}>{CATEGORY_LABEL[r.category]}</Text>
              <Text style={[styles.tileValue, { color: t.text }]}>
                {r.rating}
                {r.provisional ? '?' : ''}
              </Text>
              <Text style={{ color: t.muted, fontSize: 12 }}>{r.games === 0 ? 'Unrated' : `${r.games} games · peak ${r.peak}`}</Text>
            </Pressable>
          );
        })}
      </View>

      <Card>
        <SectionTitle>{`${CATEGORY_LABEL[category]} rating`}</SectionTitle>
        <RatingHistory username={profile.username} category={category} />
      </Card>

      <Card>
        <SectionTitle>All games</SectionTitle>
        <ResultBar wins={totals.wins} draws={totals.draws} losses={totals.losses} />
        <StatsByCategory profile={profile} />
      </Card>

      <Card>
        <SectionTitle>Recent games</SectionTitle>
        {profile.recentGames === null ? (
          <Label muted>{profile.displayName} keeps their games private.</Label>
        ) : profile.recentGames.length === 0 ? (
          <Label muted>No finished games yet.</Label>
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
  const total = wins + draws + losses;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
  const parts = [
    { label: 'Won', n: wins, color: t.text },
    { label: 'Drawn', n: draws, color: t.muted },
    { label: 'Lost', n: losses, color: t.border },
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
  const rows = profile.ratings.filter((r) => r.games > 0);
  if (rows.length === 0) return null;
  return (
    <View style={{ gap: 6, marginTop: 4 }}>
      <View style={styles.statRow}>
        {['', 'Games', 'W', 'D', 'L'].map((h) => (
          <Text key={h} style={[styles.statCell, h === '' && styles.statFirst, { color: t.muted, fontSize: 12, fontWeight: '600' }]}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((r) => (
        <View key={r.category} style={styles.statRow}>
          {[CATEGORY_LABEL[r.category], r.games, r.wins, r.draws, r.losses].map((v, i) => (
            <Text key={i} style={[styles.statCell, i === 0 && styles.statFirst, { color: t.text }]}>
              {v}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const REASON: Record<string, string> = {
  checkmate: 'checkmate',
  resignation: 'resignation',
  timeout: 'time',
  timeout_vs_insufficient: 'time vs insufficient material',
  stalemate: 'stalemate',
  insufficient_material: 'insufficient material',
  threefold_repetition: 'repetition',
  fifty_move_rule: '50-move rule',
  draw_agreement: 'agreement',
  abandoned: 'abandonment',
  aborted: 'aborted',
};

function GameRow({ game }: { game: RecentGame }) {
  const t = useTheme();
  const mark = game.outcome === 'win' ? 'W' : game.outcome === 'loss' ? 'L' : 'D';
  const when = new Date(game.endedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
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
          vs {game.opponent.username} <Text style={{ color: t.muted }}>({game.opponent.rating})</Text>
        </Text>
        <Text style={{ color: t.muted, fontSize: 13 }}>
          {game.timeControl} {CATEGORY_LABEL[game.category].toLowerCase()} · {game.outcome === 'draw' ? 'draw' : `${game.outcome === 'win' ? 'won' : 'lost'}`} by {REASON[game.reason] ?? game.reason} · {game.moves} moves · {when}
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
