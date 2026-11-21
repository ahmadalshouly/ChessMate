import {
  PRESET_TIME_CONTROLS,
  formatTimeControl,
  timeCategory,
  type Challenge,
  type ChallengeColor,
  type ChallengeEndReason,
  type PlayerInfo,
  type SocialUser,
  type TimeControl,
} from '@chessmate/core';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { Text, TextInput } from '@/ui/primitives';

import { Button, Label } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { challengeLink, copyText, shareLink } from '@/lib/links';
import { translate, useT, type TKey } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { Segmented as SegmentedControl } from '@/components/play/Controls';
import { Avatar } from '@/components/social';
import { useOnlineFriends } from '@/components/OnlineFriends';
import { socialApi } from '@/lib/social/api';

type Actions = {
  createChallenge: (o: { to?: string; timeControl: TimeControl; rated: boolean; color: ChallengeColor }) => void;
  getChallenge: (id: string) => void;
  acceptChallenge: (id: string) => void;
  declineChallenge: (id: string) => void;
  cancelChallenge: (id: string) => void;
};

const ENDED: Record<ChallengeEndReason, TKey> = {
  accepted: 'challenge.ended.accepted',
  declined: 'challenge.ended.declined',
  cancelled: 'challenge.ended.cancelled',
  expired: 'challenge.ended.expired',
};

export function isGuestId(id: string | undefined): boolean {
  return !id || id.startsWith('g_');
}

export function summary(c: Pick<Challenge, 'timeControl' | 'rated'>): string {
  return `${formatTimeControl(c.timeControl)} ${translate(`common.category.${timeCategory(c.timeControl)}`)} · ${translate(c.rated ? 'challenge.rated' : 'challenge.casual')}`;
}

/** Colour the viewer will play if they accept. */
function viewerColor(c: Challenge): string {
  return translate(c.color === 'w' ? 'challenge.youPlay.b' : c.color === 'b' ? 'challenge.youPlay.w' : 'challenge.youPlay.random');
}

/** Colour the challenger chose for themselves. */
function ownColor(c: Challenge): string {
  return translate(c.color === 'w' ? 'challenge.youPlay.w' : c.color === 'b' ? 'challenge.youPlay.b' : 'challenge.youPlay.random');
}

/** Small segmented control in the monochrome glass style. */
function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return <SegmentedControl size="sm" value={value} onChange={onChange} options={options} />;
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.chip, { borderColor: on ? t.accent : t.glassBorder, backgroundColor: on ? t.accent : t.surface }]}>
      <Text style={{ color: on ? t.onAccent : t.text, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{label}</Text>
    </Pressable>
  );
}

/**
 * Set up a game with a friend: pick time control and colour, then either
 * create a shareable invite link or send a challenge to a player id.
 */
export function CreateChallenge({ me, actions, initialTo, initialTc }: { me: PlayerInfo | null; actions: Actions; initialTo?: string; initialTc?: TimeControl }) {
  const t = useTheme();
  const tr = useT();
  const [tc, setTc] = useState<TimeControl>(initialTc ?? PRESET_TIME_CONTROLS[5]!);
  const [color, setColor] = useState<ChallengeColor>('random');
  const [rated, setRated] = useState(false);
  const [to, setTo] = useState<SocialUser | null>(null);
  const guest = isGuestId(me?.id);
  // A `to=<id>` link (e.g. from a friend's page) preselects that player.
  useEffect(() => {
    if (!initialTo) return;
    let live = true;
    socialApi.user(initialTo).then(
      (u) => live && setTo({ id: u.id, username: u.username, displayName: u.displayName, country: u.country }),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [initialTo]);
  const target = to?.id ?? '';

  return (
    <View style={{ gap: 12 }}>
      <Label size={18} bold>
        {tr('home.friend.title')}
      </Label>
      <Label muted>{tr('play.lobby.timeControl')}</Label>
      <View style={styles.wrap}>
        {PRESET_TIME_CONTROLS.map((p) => {
          const key = formatTimeControl(p);
          return <Chip key={key} label={key} on={formatTimeControl(tc) === key} onPress={() => setTc(p)} />;
        })}
      </View>
      <Label muted>{tr('challenge.yourColour')}</Label>
      <Segmented<ChallengeColor>
        value={color}
        onChange={setColor}
        options={[
          { value: 'w', label: tr('play.white') },
          { value: 'random', label: tr('play.random') },
          { value: 'b', label: tr('play.black') },
        ]}
      />
      <View style={styles.row}>
        <Label muted>{guest ? tr('challenge.ratedNeedsAccount') : tr('challenge.ratedGame')}</Label>
        <Switch value={rated && !guest} onValueChange={setRated} disabled={guest} style={{ marginStart: 'auto' }} />
      </View>
      <Button title={tr('challenge.createLink')} onPress={() => actions.createChallenge({ timeControl: tc, rated: rated && !guest, color })} />
      <Label muted>{tr('challenge.orDirect')}</Label>
      <PlayerPicker selected={to} onSelect={setTo} meId={me?.id ?? null} />
      <Button
        variant="secondary"
        title={to ? tr('challenge.sendTo', { name: to.displayName || to.username }) : tr('challenge.send')}
        disabled={!target || target === me?.id}
        onPress={() => actions.createChallenge({ to: target, timeControl: tc, rated: rated && !guest, color })}
      />
    </View>
  );
}

/**
 * Finds the player to challenge by username: online friends first, then search
 * results as you type. No player IDs to copy around.
 */
function PlayerPicker({ selected, onSelect, meId }: { selected: SocialUser | null; onSelect: (u: SocialUser | null) => void; meId: string | null }) {
  const t = useTheme();
  const tr = useT();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SocialUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { friends } = useOnlineFriends();
  const query = q.trim().replace(/^@/, '');

  useEffect(() => {
    if (query.length < 2) {
      setResults(null);
      setError(null);
      return;
    }
    let live = true;
    const id = setTimeout(() => {
      socialApi.search(query).then(
        (list) => {
          if (!live) return;
          setResults(list.filter((u) => u.id !== meId && !u.relationship.blocked));
          setError(null);
        },
        (e: Error) => live && setError(e.message),
      );
    }, 300);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [query, meId]);

  if (selected) {
    return (
      <View style={[styles.picked, { borderColor: t.glassBorder, backgroundColor: t.surface }]}>
        <Avatar user={selected} size={36} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Label bold>
            {selected.displayName || selected.username}
          </Label>
          <Label muted>
            @{selected.username}
          </Label>
        </View>
        <Pressable accessibilityRole="button" onPress={() => onSelect(null)} hitSlop={8}>
          <Label muted>{tr('challenge.change')}</Label>
        </Pressable>
      </View>
    );
  }

  const list: SocialUser[] = query.length >= 2 ? (results ?? []) : friends.map((f) => f.user).slice(0, 5);
  return (
    <View style={{ gap: 8 }}>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder={tr('challenge.searchPlayer')}
        placeholderTextColor={t.muted}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={tr('challenge.searchPlayer')}
        style={[styles.input, { color: t.text, borderColor: t.glassBorder, backgroundColor: t.surface }]}
      />
      {query.length < 2 && list.length > 0 && <Label muted>{tr('challenge.friendsOnline')}</Label>}
      {list.map((u) => (
        <Pressable
          key={u.id}
          accessibilityRole="button"
          onPress={() => {
            onSelect(u);
            setQ('');
          }}
          style={({ pressed }) => [styles.picked, { borderColor: t.glassBorder, backgroundColor: pressed ? t.glassBorder : 'transparent' }]}>
          <Avatar user={u} size={32} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Label>{u.displayName || u.username}</Label>
            <Label muted>
              @{u.username}
            </Label>
          </View>
        </Pressable>
      ))}
      {query.length >= 2 && results !== null && results.length === 0 && <Label muted>{tr('challenge.noPlayers')}</Label>}
      {error && <Label muted>{serverText(error)}</Label>}
    </View>
  );
}

/** A challenge you sent: link to share, status, cancel. */
export function OutgoingChallenge({ challenge, actions }: { challenge: Challenge; actions: Actions }) {
  const link = challengeLink(challenge.id);
  const [note, setNote] = useState<string | null>(null);
  const t = useTheme();
  const tr = useT();
  return (
    <View style={{ gap: 10 }}>
      <Label bold>{challenge.to ? tr('challenge.waitingFor', { name: challenge.to.name }) : tr('challenge.linkReady')}</Label>
      <Label muted>
        {summary(challenge)} · {ownColor(challenge)}
      </Label>
      {!challenge.to && (
        <>
          <Text selectable style={[styles.link, { color: t.text, borderColor: t.glassBorder, backgroundColor: t.surface }]}>
            {link}
          </Text>
          <View style={styles.row}>
            <Button
              title={tr('challenge.shareLink')}
              onPress={async () => {
                const r = await shareLink(link, tr('challenge.shareMessage'));
                setNote(r === 'copied' ? tr('challenge.copied') : r === 'failed' ? tr('challenge.copyAbove') : null);
              }}
            />
            <Button variant="secondary" title={tr('challenge.copy')} onPress={async () => setNote((await copyText(link)) ? tr('challenge.copied') : tr('challenge.longPress'))} />
          </View>
          {note && <Label muted>{note}</Label>}
          <Label muted>{tr('challenge.startsWhen')}</Label>
        </>
      )}
      <Button variant="secondary" title={tr('challenge.cancel')} onPress={() => actions.cancelChallenge(challenge.id)} />
    </View>
  );
}

/** A direct challenge someone sent you. */
export function IncomingChallenge({ challenge, actions }: { challenge: Challenge; actions: Actions }) {
  const tr = useT();
  return (
    <View style={{ gap: 8 }}>
      <Label bold>
        {tr('challenge.challengesYou', { name: challenge.from.name, rating: `${challenge.from.rating}${challenge.from.provisional ? '?' : ''}` })}
      </Label>
      <Label muted>
        {summary(challenge)} · {viewerColor(challenge)}
      </Label>
      <View style={styles.row}>
        <Button title={tr('common.accept')} onPress={() => actions.acceptChallenge(challenge.id)} />
        <Button variant="secondary" title={tr('common.decline')} onPress={() => actions.declineChallenge(challenge.id)} />
      </View>
    </View>
  );
}

/** Someone opened an invite link: look it up and offer to join. */
export function InviteDetails({
  id,
  me,
  challenge,
  ended,
  error,
  connected,
  actions,
}: {
  id: string;
  me: PlayerInfo | null;
  challenge: Challenge | undefined;
  ended: ChallengeEndReason | undefined;
  error: string | null;
  connected: boolean;
  actions: Actions;
}) {
  const tr = useT();
  useEffect(() => {
    if (connected) actions.getChallenge(id);
    // Re-fetch after every reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, connected]);

  if (ended && ended !== 'accepted') return <Label>{tr(ENDED[ended])}.</Label>;
  if (!challenge) return <Label muted>{error ? serverText(error) : connected ? tr('challenge.loading') : tr('play.connecting')}</Label>;
  if (challenge.status === 'accepted') return <Label muted>{tr('challenge.used')}</Label>;
  if (me && challenge.from.id === me.id) return <OutgoingChallenge challenge={challenge} actions={actions} />;
  return (
    <View style={{ gap: 8 }}>
      <IncomingChallenge challenge={challenge} actions={actions} />
      {error && <Label muted>{serverText(error)}</Label>}
    </View>
  );
}

export function challengeEndedText(reason: ChallengeEndReason): string {
  return translate(ENDED[reason]);
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  segment: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 3 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9 },
  picked: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 10 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  link: { borderWidth: 1, borderRadius: 12, padding: 10, fontSize: 13 },
});
