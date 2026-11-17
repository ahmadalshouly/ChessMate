import {
  BOTS,
  Game,
  analyzePosition,
  chooseBotMove,
  pieceName,
  suggestMove,
  type BotProfile,
  type Color,
  type GameOutcome,
  type PlayedMove,
  type Square,
} from '@chessmate/core';
import { Stack } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Board } from '@/components/Board';
import { Button, Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH, useTheme } from '@/constants/theme';
import { useMoveFeedback } from '@/lib/feedback';
import { checkSquareOf, useBoardInteraction } from '@/lib/useBoardInteraction';
import { useBoardSize } from '@/lib/useBoardSize';

type ColorChoice = 'w' | 'random' | 'b';

interface Setup {
  bot: BotProfile;
  color: Color;
  threats: boolean;
}

/**
 * Unrated practice against ChessMate's built-in computer opponents. The
 * engine runs on device, so it works offline and costs no server time.
 */
export default function PlayComputer() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [round, setRound] = useState(0);
  const begin = (s: Setup) => {
    setRound((r) => r + 1);
    setSetup(s);
  };
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Play vs computer' }} />
      {setup ? <ComputerGame key={round} setup={setup} onExit={() => setSetup(null)} onRematch={begin} /> : <BotPicker onStart={begin} />}
    </Screen>
  );
}

// ------------------------------------------------------------------ picker

function BotPicker({ onStart }: { onStart: (s: Setup) => void }) {
  const t = useTheme();
  const [botId, setBotId] = useState(BOTS[2]!.id);
  const [color, setColor] = useState<ColorChoice>('w');
  const [threats, setThreats] = useState(true);
  const bot = BOTS.find((b) => b.id === botId)!;

  const start = () => {
    const c: Color = color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color;
    onStart({ bot, color: c, threats });
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.inner}>
        <Label size={26} bold>
          Choose your opponent
        </Label>
        <Label muted>Unrated practice. Takebacks and hints are always allowed.</Label>

        <View style={styles.botGrid}>
          {BOTS.map((b) => {
            const active = b.id === botId;
            return (
              <View key={b.id} style={styles.botCell}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${b.name}, level ${b.level}, about ${b.rating}`}
                  onPress={() => setBotId(b.id)}
                  style={({ pressed }) => [
                    styles.botTile,
                    {
                      backgroundColor: active ? t.accent : t.surface,
                      borderColor: active ? t.accent : t.glassBorder,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}>
                  <Avatar bot={b} inverted={active} />
                  <Text style={[styles.botName, { color: active ? t.onAccent : t.text }]}>{b.name}</Text>
                  <Text style={[styles.botMeta, { color: active ? t.onAccent : t.muted }]}>
                    Level {b.level} · ~{b.rating}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        <Card>
          <View style={styles.row}>
            <Avatar bot={bot} size={48} />
            <View style={{ flex: 1, gap: 2 }}>
              <Label size={18} bold>
                {bot.name}
              </Label>
              <Label muted>{bot.tagline}</Label>
            </View>
          </View>

          <Label bold>Play as</Label>
          <Segmented
            value={color}
            onChange={setColor}
            options={[
              { value: 'w', label: 'White' },
              { value: 'random', label: 'Random' },
              { value: 'b', label: 'Black' },
            ]}
          />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Label bold>Live threat feedback</Label>
              <Label muted>Highlights pieces you could lose and what the computer is threatening.</Label>
            </View>
            <Switch value={threats} onValueChange={setThreats} trackColor={{ true: t.accent, false: t.border }} thumbColor={t.surfaceSolid} />
          </View>

          <Button title={`Play ${bot.name}`} onPress={start} />
        </Card>
      </View>
    </ScrollView>
  );
}

function Avatar({ bot, size = 40, inverted }: { bot: BotProfile; size?: number; inverted?: boolean }) {
  const t = useTheme();
  // Ring thickness grows with level: a quiet visual cue for strength.
  const ring = 1 + Math.floor(bot.level / 3);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: ring,
        borderColor: inverted ? t.onAccent : t.text,
        backgroundColor: inverted ? 'transparent' : t.surfaceSolid,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ color: inverted ? t.onAccent : t.text, fontSize: size * 0.42, fontWeight: '700' }}>{bot.initial}</Text>
    </View>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  const t = useTheme();
  return (
    <View style={[styles.segmented, { borderColor: t.glassBorder, backgroundColor: t.surface }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, { backgroundColor: active ? t.accent : 'transparent' }]}>
            <Text style={{ color: active ? t.onAccent : t.text, fontWeight: '600' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// -------------------------------------------------------------------- game

interface GameView {
  fen: string;
  history: PlayedMove[];
}

/** Lets React paint (e.g. "Thinking…") before a blocking engine call. */
const nextFrame = (fn: () => void, delay = 0) => setTimeout(fn, delay);

function ComputerGame({ setup, onExit, onRematch }: { setup: Setup; onExit: () => void; onRematch: (s: Setup) => void }) {
  const t = useTheme();
  const { bot, color: me } = setup;
  const game = useRef(new Game());
  const [view, setView] = useState<GameView>(() => ({ fen: game.current.fen, history: [] }));
  const [flip, setFlip] = useState(me === 'b');
  const [showThreats, setShowThreats] = useState(setup.threats);
  const [resigned, setResigned] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [hint, setHint] = useState<{ from: Square; to: Square; san: string } | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const [stats, setStats] = useState({ takebacks: 0, hints: 0 });
  /** Incremented to cancel a pending bot move (takeback, new game). */
  const epoch = useRef(0);
  const size = useBoardSize(300);

  const sync = () => setView({ fen: game.current.fen, history: game.current.history() });

  const snapshot = useMemo(() => new Game(view.fen), [view.fen]);
  const boardOutcome = useMemo<GameOutcome | null>(
    () => (view.history.length ? Game.fromUciMoves(view.history.map((m) => m.uci)).boardOutcome() : null),
    [view.history],
  );
  const outcome: GameOutcome | null = boardOutcome ?? (resigned ? { result: me === 'w' ? '0-1' : '1-0', reason: 'resignation', winner: me === 'w' ? 'b' : 'w' } : null);
  const myTurn = snapshot.turn === me && !outcome;

  // Bot's turn: think after a short pause so the player's move is visible.
  useEffect(() => {
    if (outcome || snapshot.turn === me) return;
    const token = ++epoch.current;
    setThinking(true);
    const moves = game.current.uciHistory();
    const pause = 250 + Math.min(500, bot.level * 60);
    const id = nextFrame(() => {
      if (token !== epoch.current) return;
      const started = Date.now();
      const m = chooseBotMove(bot, { moves });
      // Keep a natural rhythm: weak bots never answer instantly.
      const rest = Math.max(0, 350 - (Date.now() - started));
      nextFrame(() => {
        if (token !== epoch.current) return;
        game.current.move(m.uci);
        setThinking(false);
        sync();
      }, rest);
    }, pause);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.fen, outcome?.reason]);

  const play = (uci: string) => {
    if (!myTurn) return false;
    const ok = !!game.current.move(uci);
    if (ok) {
      setHint(null);
      sync();
    }
    return ok;
  };
  const interaction = useBoardInteraction(view.fen, (c) => c === me && myTurn, play);
  useMoveFeedback(view.history, !!outcome, { startCue: true });

  // Takeback: return to the last position where it was the player's turn.
  const plyCount = view.history.length;
  const canTakeback = plyCount > 0 && !(plyCount === 1 && me === 'b');
  const takeback = () => {
    epoch.current++;
    setThinking(false);
    setResigned(false);
    setHint(null);
    interaction.clear();
    game.current.undo();
    if (game.current.turn !== me) game.current.undo();
    setStats((s) => ({ ...s, takebacks: s.takebacks + 1 }));
    sync();
  };

  const askHint = () => {
    if (!myTurn || hintBusy) return;
    setHintBusy(true);
    const moves = game.current.uciHistory();
    nextFrame(() => {
      const r = suggestMove({ moves, timeMs: 700 });
      const from = r.best.slice(0, 2) as Square;
      const to = r.best.slice(2, 4) as Square;
      const san = snapshot.legalMoves(from).find((m) => m.to === to)?.san ?? r.best;
      setHint({ from, to, san });
      setHintBusy(false);
      setStats((s) => ({ ...s, hints: s.hints + 1 }));
    }, 30);
  };

  const insight = useMemo(() => analyzePosition(view.fen, me), [view.fen, me]);
  const threatened: Square[] = showThreats && !outcome ? insight.hanging.map((h) => h.square) : [];
  const last = view.history[view.history.length - 1];

  const selected = hint ? hint.from : interaction.selected;
  const targets = hint && !interaction.selected ? [hint.to] : interaction.targets;

  const verdict = outcome ? resultText(outcome, me) : null;
  const botColor: Color = me === 'w' ? 'b' : 'w';

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={{ width: size, gap: 10 }}>
        <PlayerRow
          title={bot.name}
          subtitle={`Level ${bot.level} · ~${bot.rating}`}
          avatar={<Avatar bot={bot} size={36} />}
          status={thinking ? 'Thinking…' : !outcome && snapshot.turn === botColor ? 'To move' : null}
        />
        <Board
          fen={view.fen}
          orientation={flip ? 'b' : 'w'}
          size={size}
          selected={selected}
          targets={targets}
          lastMove={last ? { from: last.from, to: last.to } : null}
          checkSquare={checkSquareOf(view.fen)}
          threatened={threatened}
          onSquarePress={(sq) => {
            setHint(null);
            interaction.onSquarePress(sq);
          }}
          {...interaction.dragProps}
          onPieceDrop={(from, to) => {
            setHint(null);
            interaction.dragProps.onPieceDrop(from, to);
          }}
        />
        <PlayerRow
          title="You"
          subtitle={`${me === 'w' ? 'White' : 'Black'} · unrated`}
          avatar={
            <View style={[styles.youDot, { borderColor: t.text, backgroundColor: me === 'w' ? '#FFFFFF' : '#15171B' }]} />
          }
          status={myTurn ? 'Your move' : null}
        />

        <View style={styles.controls}>
          <View style={styles.controlCell}>
            <Button variant="secondary" title="Takeback" disabled={!canTakeback} onPress={takeback} />
          </View>
          <View style={styles.controlCell}>
            <Button variant="secondary" title={hintBusy ? 'Hint…' : 'Hint'} disabled={!myTurn || hintBusy} onPress={askHint} />
          </View>
          <View style={styles.controlCell}>
            <Button variant="secondary" title="Flip" onPress={() => setFlip((f) => !f)} />
          </View>
          <View style={styles.controlCell}>
            {outcome ? (
              <Button variant="secondary" title="New" onPress={onExit} />
            ) : (
              <Button
                variant="danger"
                title="Resign"
                disabled={plyCount < 1}
                onPress={() => {
                  epoch.current++;
                  setThinking(false);
                  setResigned(true);
                }}
              />
            )}
          </View>
        </View>

        {verdict && (
          <Card>
            <Label size={20} bold>
              {verdict.title}
            </Label>
            <Label muted>
              {verdict.detail} · Unrated
              {stats.takebacks ? ` · ${stats.takebacks} takeback${stats.takebacks > 1 ? 's' : ''}` : ''}
              {stats.hints ? ` · ${stats.hints} hint${stats.hints > 1 ? 's' : ''}` : ''}
            </Label>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Button title="Rematch" onPress={() => onRematch({ ...setup, color: me === 'w' ? 'b' : 'w', threats: showThreats })} />
              </View>
              <View style={{ flex: 1 }}>
                <Button variant="secondary" title="Change opponent" onPress={onExit} />
              </View>
            </View>
          </Card>
        )}

        <Card>
          <View style={styles.row}>
            <Label bold>Threat feedback</Label>
            <View style={{ marginLeft: 'auto' }}>
              <Switch value={showThreats} onValueChange={setShowThreats} trackColor={{ true: t.accent, false: t.border }} thumbColor={t.surfaceSolid} />
            </View>
          </View>
          {hint && <Label>Hint: {hint.san} looks strongest here.</Label>}
          {showThreats && !outcome && (
            <>
              {insight.hanging.slice(0, 3).map((h) => (
                <Label key={h.square} muted>
                  ⚠ Your {pieceName(h.piece)} on {h.square} can be won
                </Label>
              ))}
              {snapshot.turn === me &&
                insight.threats.slice(0, 3).map((th) => (
                  <Label key={`t${th.uci}`} muted>
                    ⚔ {bot.name} threatens {th.description}
                  </Label>
                ))}
              {snapshot.turn === me &&
                insight.opportunities
                  .filter((o) => o.kind !== 'check')
                  .slice(0, 3)
                  .map((o) => (
                    <Label key={`o${o.uci}`} muted>
                      ★ Chance: {o.description}
                    </Label>
                  ))}
              {insight.hanging.length === 0 &&
                (snapshot.turn !== me || insight.threats.length + insight.opportunities.filter((o) => o.kind !== 'check').length === 0) && (
                  <Label muted>No immediate tactics.</Label>
                )}
            </>
          )}
          {view.history.length > 0 && (
            <Label muted>{view.history.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m.san}` : m.san)).join(' ')}</Label>
          )}
        </Card>
      </View>
    </ScrollView>
  );
}

function PlayerRow({ title, subtitle, avatar, status }: { title: string; subtitle: string; avatar: ReactNode; status: string | null }) {
  const t = useTheme();
  return (
    <View style={styles.playerRow}>
      {avatar}
      <View style={{ flex: 1 }}>
        <Text style={[styles.playerName, { color: t.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={{ color: t.muted, fontSize: 13 }}>{subtitle}</Text>
      </View>
      {status && (
        <View style={[styles.pill, { backgroundColor: t.surface, borderColor: t.glassBorder }]}>
          <Text style={{ color: t.text, fontSize: 13, fontWeight: '600' }}>{status}</Text>
        </View>
      )}
    </View>
  );
}

function resultText(o: GameOutcome, me: Color): { title: string; detail: string } {
  const reason = o.reason.replace(/_/g, ' ');
  if (o.winner === null) return { title: 'Draw', detail: `${o.result} by ${reason}` };
  return o.winner === me ? { title: 'You won', detail: `${o.result} by ${reason}` } : { title: 'You lost', detail: `${o.result} by ${reason}` };
}

const styles = StyleSheet.create({
  page: { padding: 12, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  botGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  botCell: { width: '50%', padding: 5 },
  botTile: { borderRadius: 16, borderWidth: 1, padding: 12, gap: 6, alignItems: 'flex-start' },
  botName: { fontSize: 16, fontWeight: '700' },
  botMeta: { fontSize: 13 },
  segmented: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 3 },
  segment: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  playerName: { fontSize: 16, fontWeight: '700' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  youDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 2 },
  controls: { flexDirection: 'row', marginHorizontal: -4 },
  controlCell: { flex: 1, paddingHorizontal: 4 },
});
