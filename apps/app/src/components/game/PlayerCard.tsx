import { DEFAULT_AVATAR, formatClock, type PlayerInfo, type PublicProfile } from '@chessmate/core';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CountryFlag } from '@/components/CountryFlag';
import { Avatar } from '@/features/profile/Avatar';
import { PlayerTagBadge } from '@/features/titles/PlayerTagBadge';
import { RoleTagBadge } from '@/features/titles/RoleTagBadge';
import { TitleBadge } from '@/features/titles/TitleBadge';
import { formatNumber, useT } from '@/i18n';
import { countryLabel } from '@/i18n/chess';
import { Button, GlassView, Modal, Text, useAppTheme } from '@/ui';

import { hasProfile, usePlayerProfile } from './usePlayerProfile';

export const PLAYER_CARD_HEIGHT = 56;

export interface PlayerCardProps {
  player: PlayerInfo | null;
  /** Clock time left; omit for untimed games. */
  ms?: number | null;
  /** Their clock is running (or, untimed, it is their move). */
  active?: boolean;
  offline?: boolean;
  /** Replaces the profile avatar (computer opponents). */
  avatar?: ReactNode;
  /** Replaces "rating" under the name. */
  subtitle?: string;
  /** Small pill at the end: "Thinking…", "Your move". */
  status?: string | null;
  /** Off for computer opponents, which have no profile. */
  pressable?: boolean;
}

/**
 * A player above or below the board: avatar, title, name, country flag, role
 * tag, rating and clock. Tap it to see the player's profile without leaving the game.
 */
export function PlayerCard({ player, ms, active, offline, avatar, subtitle, status, pressable = true }: PlayerCardProps) {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  const profile = usePlayerProfile(player);
  const [open, setOpen] = useState(false);
  const low = ms != null && ms < 20_000;
  const country = countryLabel(profile?.country);
  const rating = player ? `${Math.round(player.rating)}${player.provisional ? '?' : ''}` : '';
  const canOpen = pressable && !!player;
  const tag = profile?.roleTag ?? null;
  const tagName = tag ? tr(`chessTitle.roleTags.${tag}`) : null;
  const label = player
    ? [profile?.title ? tr(`chessTitle.names.${profile.title}`) : null, player.name, country, tagName, rating].filter(Boolean).join(', ')
    : undefined;

  return (
    <>
      <Pressable
        accessibilityRole={canOpen ? 'button' : undefined}
        accessibilityLabel={label}
        disabled={!canOpen}
        onPress={() => setOpen(true)}
        style={styles.row}>
        {({ pressed }) => (
          <>
            <View style={[styles.who, { opacity: pressed ? 0.7 : 1 }]}>
              <View style={[styles.avatarRing, active && { borderColor: c.text }]}>
                {avatar ?? <Avatar avatar={profile?.avatar ?? DEFAULT_AVATAR} name={player?.name ?? '?'} size={36} />}
              </View>
              <View style={styles.names}>
                <View style={styles.nameLine}>
                  <TitleBadge title={profile?.title} />
                  <Text variant="bodyStrong" numberOfLines={1} style={styles.name}>
                    {player?.name ?? '…'}
                  </Text>
                  <CountryFlag code={profile?.country} size={13} decorative />
                  <RoleTagBadge tag={tag} compact />
                  {!tag && <PlayerTagBadge tag={profile?.playerTag} compact />}
                </View>
                <Text variant="caption" tone="muted" numberOfLines={1} style={styles.sub}>
                  {subtitle ?? rating}
                  {tagName && !subtitle ? ` · ${tagName}` : ''}
                  {offline ? ` · ${tr('play.online.reconnecting').split('.')[0]}` : ''}
                </Text>
              </View>
            </View>
            {status ? (
              <View style={[styles.pill, { backgroundColor: c.surfaceSunken, borderColor: c.border }]}>
                <Text variant="caption" style={{ fontSize: 12 }}>
                  {status}
                </Text>
              </View>
            ) : null}
            {ms != null && (
              <View
                style={[
                  styles.clock,
                  {
                    backgroundColor: active ? (low ? c.danger : c.accent) : c.surfaceSunken,
                    borderColor: active ? 'transparent' : c.border,
                  },
                ]}>
                <Text variant="clock" style={styles.clockText} color={active ? (low ? c.onDanger : c.onAccent) : low ? c.danger : c.text}>
                  {formatClock(ms)}
                </Text>
              </View>
            )}
          </>
        )}
      </Pressable>
      {player && <PlayerSheet visible={open} onClose={() => setOpen(false)} player={player} profile={profile} />}
    </>
  );
}

/** Profile summary over the game: who you are playing, without leaving the board. */
function PlayerSheet({ visible, onClose, player, profile }: { visible: boolean; onClose: () => void; player: PlayerInfo; profile: PublicProfile | null }) {
  const tr = useT();
  const country = profile?.country ? (countryLabel(profile.country) ?? profile.country) : null;
  const totals = profile?.totals;
  return (
    <Modal visible={visible} onClose={onClose} presentation="sheet">
      <View style={styles.sheetHead}>
        <Avatar avatar={profile?.avatar ?? DEFAULT_AVATAR} name={player.name} size={64} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.nameLine}>
            <TitleBadge title={profile?.title} size="md" />
            <Text variant="heading" numberOfLines={1} style={styles.name}>
              {profile?.displayName || player.name}
            </Text>
          </View>
          {profile?.roleTag || profile?.playerTag ? (
            <View style={styles.sheetTag}>
              <RoleTagBadge tag={profile.roleTag} />
              <PlayerTagBadge tag={profile.playerTag} />
            </View>
          ) : null}
          <Text tone="muted" numberOfLines={1}>
            {hasProfile(player) ? `@${profile?.username ?? player.name}` : tr('game.player.guest')}
          </Text>
          {country && (
            <View style={styles.country}>
              <CountryFlag code={profile?.country} size={13} decorative />
              <Text tone="muted">{country}</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.stats}>
        <Stat label={tr('game.player.rating')} value={`${Math.round(player.rating)}${player.provisional ? '?' : ''}`} />
        {totals && <Stat label={tr('game.player.games')} value={formatNumber(totals.games)} />}
      </View>
      {totals && (
        <GlassView flat radius="md" padding="md" elevation="none">
          <Text tone="muted" align="center">
            {tr('game.player.record', { w: totals.wins, d: totals.draws, l: totals.losses })}
          </Text>
        </GlassView>
      )}
      {profile?.bio ? <Text tone="muted">{profile.bio}</Text> : null}
      {!hasProfile(player) && <Text tone="muted">{tr('game.player.noProfile')}</Text>}
      {hasProfile(player) && (
        <Button
          variant="secondary"
          title={tr('game.player.viewProfile')}
          fullWidth
          onPress={() => {
            onClose();
            router.push({ pathname: '/profile/[username]', params: { username: profile?.username ?? player.name } });
          }}
        />
      )}
      <Button variant="ghost" title={tr('game.close')} fullWidth onPress={onClose} />
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="figure">{value}</Text>
      <Text variant="overline" tone="tertiary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, height: PLAYER_CARD_HEIGHT },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  avatarRing: { borderRadius: 22, borderWidth: 2, borderColor: 'transparent', padding: 1 },
  names: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1 },
  country: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sub: { fontVariant: ['tabular-nums'] },
  pill: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  clock: { minWidth: 92, height: 44, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  clockText: { fontSize: 24, lineHeight: 28 },
  sheetTag: { flexDirection: 'row', gap: 6, marginVertical: 2 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stats: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
});
