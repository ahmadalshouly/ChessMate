import { formatTimeControl, timeCategory, type ColorChoice, type TimeControl } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSyncExternalStore, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Segmented } from '@/components/play/Controls';
import { RestrictionBanner } from '@/components/shell/RestrictionBanner';
import { dirIcon, useT } from '@/i18n';
import { isGuest, playClient, usePlay } from '@/lib/playClient';
import { Button, Modal, Text, useAppTheme } from '@/ui';

export type RatingWindow = 0 | 100 | 200 | 400;

/** How the player wants to be paired. Shared by the lobby and the quick-play sheet, kept for the session. */
export interface SeekOptions {
  rated: boolean;
  window: RatingWindow;
  color: ColorChoice;
}

// Signed-in players default to rated so every game counts toward their Elo; casual stays one tap away.
let options: SeekOptions = { rated: true, window: 0, color: 'random' };
const listeners = new Set<() => void>();

export function setSeekOptions(patch: Partial<SeekOptions>) {
  options = { ...options, ...patch };
  for (const l of listeners) l();
}

export function useSeekOptions(): SeekOptions {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => options,
    () => options,
  );
}

/** Starts matchmaking with the chosen options. Guests always play casual. */
export function startSeek(timeControl: TimeControl, o: SeekOptions, guest: boolean) {
  playClient.seek({ timeControl, rated: o.rated && !guest, range: o.window === 0 ? undefined : o.window, color: o.color });
}

export function postOpenGame(timeControl: TimeControl, o: SeekOptions, guest: boolean) {
  playClient.createOpenGame(timeControl, o.rated && !guest, o.color, o.window === 0 ? undefined : o.window);
}

/**
 * Game setup that pops up when a time control is tapped: rated or casual,
 * the rating window and your side, then Play (matchmaking) or Post (an open
 * game others can join).
 */
export function GameSetupSheet({
  timeControl,
  visible,
  onClose,
  onPlay,
  onPost,
}: {
  timeControl: TimeControl | null;
  visible: boolean;
  onClose: () => void;
  /** Called after matchmaking started. */
  onPlay?: () => void;
  /** Called after the open game was posted. */
  onPost?: () => void;
}) {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  const s = usePlay();
  const o = useSeekOptions();
  const guest = isGuest(s.me);
  const rated = o.rated && !guest;
  const online = s.connection === 'online';
  const busy = s.seek !== null || s.openGame !== null || (!!s.game && !s.game.outcome);
  const canStart = online && !busy && !s.restricted && !!timeControl;

  if (!timeControl) return null;
  const tcLabel = formatTimeControl(timeControl);
  const category = tr(`common.category.${timeCategory(timeControl)}`);

  return (
    <Modal visible={visible} onClose={onClose} presentation="sheet">
      <View style={{ gap: 2 }}>
        <Text variant="overline" tone="muted">
          {tr('play.setup.title')}
        </Text>
        <Text variant="figure" style={{ fontSize: 28, lineHeight: 32 }}>
          {tcLabel}
          <Text variant="heading" tone="muted">{`  ${category}`}</Text>
        </Text>
      </View>

      <RestrictionBanner />
      <View style={[styles.rows, { borderColor: c.border }]}>
        <SetupRow label={tr('play.lobby.mode')} hint={guest ? tr('server.signInRated') : rated ? tr('play.lobby.ratedHint') : tr('play.lobby.casualHint')}>
          <Segmented
            size="sm"
            value={rated ? 'rated' : 'casual'}
            onChange={(v) => setSeekOptions({ rated: v === 'rated' })}
            options={[
              { value: 'casual', label: tr('play.casual') },
              { value: 'rated', label: tr('play.rated'), disabled: guest },
            ]}
          />
        </SetupRow>
        <View style={[styles.rule, { backgroundColor: c.border }]} />
        <SetupRow label={tr('play.lobby.opponent')} hint={o.window === 0 ? tr('play.lobby.autoHint') : tr('play.lobby.windowHint', { n: o.window })}>
          <Segmented<RatingWindow>
            size="sm"
            value={o.window}
            onChange={(window) => setSeekOptions({ window })}
            options={[
              { value: 0, label: tr('play.lobby.auto') },
              { value: 100, label: '±100' },
              { value: 200, label: '±200' },
              { value: 400, label: '±400' },
            ]}
          />
        </SetupRow>
        <View style={[styles.rule, { backgroundColor: c.border }]} />
        <SetupRow label={tr('play.lobby.yourSide')} hint={tr('play.lobby.yourSideHint')}>
          <Segmented<ColorChoice>
            size="sm"
            value={o.color}
            onChange={(color) => setSeekOptions({ color })}
            options={[
              { value: 'w', label: tr('play.white') },
              { value: 'random', label: tr('play.random') },
              { value: 'b', label: tr('play.black') },
            ]}
          />
        </SetupRow>
      </View>

      {!online && (
        <Text variant="caption" tone="muted" align="center">
          {s.connection === 'connecting' ? tr('play.connecting') : tr('play.offline')}
        </Text>
      )}
      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <Button
            variant="secondary"
            title={tr('play.lobby.post')}
            fullWidth
            disabled={!canStart}
            onPress={() => {
              postOpenGame(timeControl, o, guest);
              onClose();
              onPost?.();
            }}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title={tr('play.lobby.playNow')}
            fullWidth
            disabled={!canStart}
            onPress={() => {
              startSeek(timeControl, o, guest);
              onClose();
              onPlay?.();
            }}
            rightIcon={<Ionicons name={dirIcon('arrow-forward')} size={16} color={c.onAccent} />}
          />
        </View>
      </View>
    </Modal>
  );
}

function SetupRow({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={{ gap: 2 }}>
        <Text variant="label">{label}</Text>
        <Text variant="caption" tone="tertiary">
          {hint}
        </Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  rows: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 16 },
  row: { gap: 10, paddingVertical: 14 },
  rule: { height: StyleSheet.hairlineWidth },
  actions: { flexDirection: 'row', gap: 10 },
});
