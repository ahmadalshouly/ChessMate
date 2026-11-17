import {
  Game,
  PRESET_TIME_CONTROLS,
  createClock,
  formatClock,
  formatTimeControl,
  isFlagged,
  outcomeFor,
  pressClock,
  remaining,
  startClock,
  stopClock,
  type ClockState,
  type Color,
  type GameOutcome,
  type PlayedMove,
  type TimeControl,
} from '@chessmate/core';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { Board } from '@/components/Board';
import { useTicker } from '@/components/PlayerBar';
import { Button, Card, Label, Screen } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { useMoveFeedback } from '@/lib/feedback';
import { checkSquareOf, useBoardInteraction } from '@/lib/useBoardInteraction';
import { useBoardSize } from '@/lib/useBoardSize';

const NAMES: Record<Color, string> = { w: 'White', b: 'Black' };
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

const REASONS: Record<string, string> = {
  checkmate: 'checkmate',
  resignation: 'resignation',
  timeout: 'time',
  timeout_vs_insufficient: 'timeout vs insufficient material',
  stalemate: 'stalemate',
  insufficient_material: 'insufficient material',
  threefold_repetition: 'threefold repetition',
  fifty_move_rule: 'fifty-move rule',
  draw_agreement: 'agreement',
};

function describe(o: GameOutcome): string {
  const why = REASONS[o.reason] ?? o.reason.replace(/_/g, ' ');
  return o.winner ? `${NAMES[o.winner]} wins by ${why}` : `Draw by ${why}`;
}

/** Flagging loses, unless the opponent cannot possibly mate. */
function timeoutOutcome(board: Game, flagged: Color): GameOutcome {
  const winner = other(flagged);
  return board.hasMatingMaterial(winner) ? outcomeFor('timeout', winner) : outcomeFor('timeout_vs_insufficient', null);
}

/**
 * Over-the-board: two people share one device. Optional chess clock, a
 * face-to-face layout for a phone or tablet lying flat between players, and
 * auto-rotating board for passing the device back and forth. Fully offline.
 */
export default function OverTheBoard() {
  const [tc, setTc] = useState<TimeControl | null>(PRESET_TIME_CONTROLS[6]!);
  const [started, setStarted] = useState(false);
  const [faceToFace, setFaceToFace] = useState(false);
  const [autoFlip, setAutoFlip] = useState(false);

  const game = useRef(new Game());
  const [view, setView] = useState<{ fen: string; history: PlayedMove[] }>({ fen: game.current.fen, history: [] });
  const [clock, setClock] = useState<ClockState | null>(null);
  const [outcome, setOutcome] = useState<GameOutcome | null>(null);
  const [drawOffer, setDrawOffer] = useState<Color | null>(null);
  const size = useBoardSize(340);
  const t = useTheme();

  const running = !!clock?.running && !outcome;
  useTicker(running);

  // Flag check: runs on every tick while a clock is running.
  const flagged = clock && !outcome ? isFlagged(clock, Date.now()) : null;
  useEffect(() => {
    if (!flagged || !clock) return;
    setClock(stopClock(clock, Date.now()));
    setOutcome(timeoutOutcome(game.current, flagged));
  }, [flagged, clock]);

  const turn = game.current.turn;

  const play = (uci: string) => {
    if (outcome || !started) return false;
    const mover = game.current.turn;
    const now = Date.now();
    let nextClock = clock;
    if (clock) {
      // Like an online game, the clock starts after White's first move.
      if (game.current.ply === 0) nextClock = startClock(clock, 'b', now);
      else {
        const r = pressClock(clock, mover, now);
        if (r.flagged) {
          setClock(r.clock);
          setOutcome(timeoutOutcome(game.current, mover));
          return false;
        }
        nextClock = r.clock;
      }
    }
    const played = game.current.move(uci);
    if (!played) return false;
    setDrawOffer(null);
    const end = game.current.boardOutcome();
    setClock(end && nextClock ? stopClock(nextClock, now) : nextClock);
    if (end) setOutcome(end);
    setView({ fen: game.current.fen, history: game.current.history() });
    return true;
  };

  const interaction = useBoardInteraction(view.fen, (c) => started && !outcome && c === turn, play);
  useMoveFeedback(view.history, !!outcome, { startCue: started });

  const start = () => {
    game.current = new Game();
    setView({ fen: game.current.fen, history: [] });
    setClock(tc ? createClock(tc) : null);
    setOutcome(null);
    setDrawOffer(null);
    interaction.clear();
    setStarted(true);
  };

  const finish = (o: GameOutcome) => {
    setOutcome(o);
    if (clock) setClock(stopClock(clock, Date.now()));
  };

  const orientation: Color = autoFlip && !faceToFace ? turn : 'w';
  const top = other(orientation);
  const bottom = orientation;
  const last = view.history[view.history.length - 1];
  const ms = (c: Color) => (clock ? remaining(clock, c, Date.now()) : null);

  const bar = (c: Color, rotated: boolean) => (
    <View style={[styles.bar, rotated && styles.rotated]}>
      <View style={{ flexShrink: 1, gap: 6 }}>
        <Text style={[styles.name, { color: t.text }]}>
          {NAMES[c]}
          {started && !outcome && turn === c ? ' · to move' : ''}
        </Text>
        {started && !outcome && (
          <View style={styles.row}>
            <SmallButton label="Resign" onPress={() => finish(outcomeFor('resignation', other(c)))} />
            {drawOffer === other(c) ? (
              <>
                <SmallButton label="Accept draw" strong onPress={() => finish(outcomeFor('draw_agreement', null))} />
                <SmallButton label="Decline" onPress={() => setDrawOffer(null)} />
              </>
            ) : (
              <SmallButton label={drawOffer === c ? 'Draw offered' : 'Offer draw'} onPress={() => setDrawOffer(c)} disabled={drawOffer === c || view.history.length < 2} />
            )}
          </View>
        )}
      </View>
      {clock && (
        <View
          style={[
            styles.clock,
            {
              backgroundColor: clock.running === c ? ((ms(c) ?? 0) < 20_000 ? t.danger : t.accent) : t.surface,
              borderColor: t.glassBorder,
            },
          ]}>
          <Text style={[styles.clockText, { color: clock.running === c ? ((ms(c) ?? 0) < 20_000 ? '#FFF' : t.onAccent) : t.text }]}>{formatClock(ms(c) ?? 0)}</Text>
        </View>
      )}
    </View>
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Over the board' }} />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={{ width: size, gap: 8 }}>
          {!started ? (
            <Card>
              <Label size={18} bold>
                Play over the board
              </Label>
              <Label muted>Two players, one device. Works offline.</Label>
              <Label muted>Clock</Label>
              <View style={styles.wrap}>
                <SmallButton label="No clock" strong={tc === null} onPress={() => setTc(null)} />
                {PRESET_TIME_CONTROLS.map((p) => {
                  const key = formatTimeControl(p);
                  return <SmallButton key={key} label={key} strong={!!tc && formatTimeControl(tc) === key} onPress={() => setTc(p)} />;
                })}
              </View>
              <Toggle label="Face-to-face (device flat between players)" value={faceToFace} onChange={setFaceToFace} />
              <Toggle label="Rotate board after each move" value={autoFlip && !faceToFace} onChange={setAutoFlip} disabled={faceToFace} />
              <Button title="Start game" onPress={start} />
            </Card>
          ) : (
            <>
              {bar(top, faceToFace)}
              <Board
                fen={view.fen}
                orientation={orientation}
                size={size}
                selected={interaction.selected}
                targets={interaction.targets}
                lastMove={last ? { from: last.from, to: last.to } : null}
                checkSquare={checkSquareOf(view.fen)}
                onSquarePress={interaction.onSquarePress}
                {...interaction.dragProps}
              />
              {bar(bottom, false)}
              <Card>
                {outcome ? (
                  <Label size={18} bold>
                    {describe(outcome)}
                  </Label>
                ) : (
                  <Label muted>{view.history.length === 0 && clock ? 'Clocks start after White’s first move.' : `${NAMES[turn]} to move`}</Label>
                )}
                {view.history.length > 0 && (
                  <Label muted>{view.history.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m.san}` : m.san)).join(' ')}</Label>
                )}
                <View style={styles.row}>
                  {outcome && <Button title="Rematch" onPress={start} />}
                  <Button variant="secondary" title={outcome ? 'Change settings' : 'Quit game'} onPress={() => setStarted(false)} />
                </View>
              </Card>
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

function SmallButton({ label, onPress, strong, disabled }: { label: string; onPress: () => void; strong?: boolean; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.small,
        { backgroundColor: strong ? t.accent : t.surface, borderColor: strong ? t.accent : t.glassBorder, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
      ]}>
      <Text style={{ color: strong ? t.onAccent : t.text, fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

function Toggle({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={styles.toggle}>
      <View style={{ flexShrink: 1 }}>
        <Label muted>{label}</Label>
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 12, alignItems: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, gap: 12 },
  rotated: { transform: [{ rotate: '180deg' }] },
  name: { fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  small: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9, borderWidth: 1 },
  clock: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, minWidth: 84, alignItems: 'center' },
  clockText: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
