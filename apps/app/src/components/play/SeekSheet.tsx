import { formatTimeControl, timeCategory, type ColorChoice, type TimeControl } from '@chessmate/core';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Segmented } from '@/components/play/Controls';
import { GAME_MODES, type GameModeId } from '@/lib/gameModes';
import { isGuest, playClient, usePlay } from '@/lib/playClient';
import { Button, Modal, Text, useAppTheme } from '@/ui';
import { useT } from '@/i18n';

type Window = 0 | 100 | 200 | 400;

export interface SeekChoice {
  mode: GameModeId;
  rated: boolean;
  color: ColorChoice;
  window: Window;
}

const KEY = 'chessmate.seekChoice.v1';
const DEFAULT: SeekChoice = { mode: 'standard', rated: true, color: 'random', window: 0 };

/** Last choices, so the popup opens the way the player left it (per device). */
let remembered: SeekChoice = (() => {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw ? { ...DEFAULT, ...(JSON.parse(raw) as Partial<SeekChoice>) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
})();

function remember(c: SeekChoice) {
  remembered = c;
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(c));
  } catch {
    // Private windows and native: kept in memory for this session only.
  }
}

/**
 * The popup that opens when a player taps a time control: game mode, rated or
 * casual, side and rating range, then "Find opponent" starts the search.
 * `onStarted` runs after the seek is sent (e.g. to open the game screen).
 */
export function SeekSheet({ timeControl, onClose, onStarted }: { timeControl: TimeControl | null; onClose: () => void; onStarted?: () => void }) {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  const s = usePlay();
  const { width } = useWindowDimensions();
  const guest = isGuest(s.me);
  const [choice, setChoice] = useState<SeekChoice>(remembered);
  const visible = timeControl !== null;

  const mode = GAME_MODES.find((m) => m.id === choice.mode) ?? GAME_MODES[0]!;
  const canRate = !guest && mode.ratedAllowed;
  const rated = choice.rated && canRate;
  const online = s.connection === 'online';
  const busy = !!(s.game && !s.game.outcome);
  // Choices are remembered as they change, so every popup opens the way the player left it.
  const patch = (p: Partial<SeekChoice>) => {
    const next = { ...choice, ...p };
    remember(next);
    setChoice(next);
  };

  const start = () => {
    if (!timeControl) return;
    playClient.seek({ timeControl, rated, range: choice.window === 0 ? undefined : choice.window, color: choice.color });
    onClose();
    onStarted?.();
  };

  const tc = timeControl ? formatTimeControl(timeControl) : '';
  const category = timeControl ? tr(`common.category.${timeCategory(timeControl)}`) : '';

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      presentation={width < 600 ? 'sheet' : 'dialog'}
      title={tr('play.seek.title', { tc })}
      description={`${category} · ${rated ? tr('play.rated') : tr('play.casual')}`}
      actions={
        <>
          <Button variant="ghost" title={tr('common.cancel')} onPress={onClose} />
          <Button title={online ? tr('play.seek.find') : tr('play.connecting')} disabled={!online || busy} onPress={start} />
        </>
      }>
      <View style={{ gap: t.space.lg }}>
        <Field label={tr('play.seek.mode')}>
          <View style={styles.modes}>
            {GAME_MODES.map((m) => {
              const on = m.id === choice.mode;
              return (
                <Pressable
                  key={m.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => patch({ mode: m.id })}
                  style={[styles.mode, { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.surfacePressed : 'transparent' }]}>
                  <MaterialCommunityIcons name={m.glyph} size={20} color={c.text} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="label">{tr(m.title)}</Text>
                    <Text variant="caption" tone="muted" numberOfLines={2}>
                      {tr(m.body)}
                    </Text>
                  </View>
                  {on && <MaterialCommunityIcons name="check-circle" size={18} color={c.text} />}
                </Pressable>
              );
            })}
          </View>
        </Field>
        <Field label={tr('play.lobby.mode')} hint={guest ? tr('server.signInRated') : rated ? tr('play.lobby.ratedHint') : tr('play.lobby.casualHint')}>
          <Segmented
            size="sm"
            value={rated ? 'rated' : 'casual'}
            onChange={(v) => patch({ rated: v === 'rated' })}
            options={[
              { value: 'casual', label: tr('play.casual') },
              { value: 'rated', label: tr('play.rated'), disabled: !canRate },
            ]}
          />
        </Field>
        <Field label={tr('play.lobby.yourSide')}>
          <Segmented<ColorChoice>
            size="sm"
            value={choice.color}
            onChange={(color) => patch({ color })}
            options={[
              { value: 'w', label: tr('play.white') },
              { value: 'random', label: tr('play.random') },
              { value: 'b', label: tr('play.black') },
            ]}
          />
        </Field>
        <Field label={tr('play.lobby.opponent')} hint={choice.window === 0 ? tr('play.lobby.autoHint') : tr('play.lobby.windowHint', { n: choice.window })}>
          <Segmented<Window>
            size="sm"
            value={choice.window}
            onChange={(window) => patch({ window })}
            options={[
              { value: 0, label: tr('play.lobby.auto') },
              { value: 100, label: '±100' },
              { value: 200, label: '±200' },
              { value: 400, label: '±400' },
            ]}
          />
        </Field>
      </View>
    </Modal>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text variant="overline" tone="muted">
        {label}
      </Text>
      {children}
      {hint ? (
        <Text variant="caption" tone="tertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  modes: { gap: 8 },
  mode: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
});
