import { Game, analyzePosition, pieceName, type PlayedMove, type Square } from '@chessmate/core';
import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Board } from '@/components/Board';
import { Button, Card, Label, Screen } from '@/components/ui';
import { checkSquareOf, useBoardInteraction } from '@/lib/useBoardInteraction';
import { useBoardSize } from '@/lib/useBoardSize';

/**
 * Pass-and-play practice board with ChessMate's threat detection. Runs fully
 * on device (no engine) so it works offline; engine review lives server-side.
 */
export default function LocalPlay() {
  const game = useRef(new Game());
  const [view, setView] = useState<{ fen: string; history: PlayedMove[] }>(() => ({ fen: game.current.fen, history: [] }));
  const [flip, setFlip] = useState(false);
  const [showThreats, setShowThreats] = useState(true);
  const size = useBoardSize(320);

  const sync = () => setView({ fen: game.current.fen, history: game.current.history() });
  const play = (uci: string) => {
    const ok = !!game.current.move(uci);
    if (ok) sync();
    return ok;
  };

  const snapshot = useMemo(() => new Game(view.fen), [view.fen]);
  const outcome = useMemo(() => (view.history.length ? Game.fromUciMoves(view.history.map((m) => m.uci)).boardOutcome() : null), [view.history]);
  const interaction = useBoardInteraction(view.fen, () => !outcome, play);
  const { history } = view;
  const last = history[history.length - 1];

  const insight = useMemo(() => analyzePosition(view.fen, snapshot.turn), [view.fen, snapshot]);
  const threatened: Square[] = showThreats ? insight.hanging.map((h) => h.square) : [];
  const side = snapshot.turn === 'w' ? 'White' : 'Black';

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={{ width: size, gap: 12 }}>
          <Board
            fen={view.fen}
            orientation={flip ? 'b' : 'w'}
            size={size}
            selected={interaction.selected}
            targets={interaction.targets}
            lastMove={last ? { from: last.from, to: last.to } : null}
            checkSquare={checkSquareOf(view.fen)}
            threatened={threatened}
            onSquarePress={interaction.onSquarePress}
          />
          <View style={styles.row}>
            <Button
              variant="secondary"
              title="Undo"
              disabled={history.length === 0}
              onPress={() => {
                game.current.undo();
                interaction.clear();
                sync();
              }}
            />
            <Button variant="secondary" title="Flip" onPress={() => setFlip((f) => !f)} />
            <View style={styles.toggle}>
              <Label muted>Threats</Label>
              <Switch value={showThreats} onValueChange={setShowThreats} />
            </View>
          </View>

          <Card>
            {outcome ? (
              <Label size={18} bold>
                {outcome.result} · {outcome.reason.replace(/_/g, ' ')}
              </Label>
            ) : (
              <Label bold>
                {side} to move{snapshot.inCheck ? ' (in check)' : ''}
              </Label>
            )}
            {showThreats && !outcome && (
              <>
                {insight.hanging.slice(0, 3).map((h) => (
                  <Label key={h.square} muted>
                    ⚠ {side}&apos;s {pieceName(h.piece)} on {h.square} can be won
                  </Label>
                ))}
                {insight.threats.slice(0, 3).map((t) => (
                  <Label key={`t${t.uci}`} muted>
                    ⚔ Opponent threatens {t.description}
                  </Label>
                ))}
                {insight.opportunities
                  .filter((o) => o.kind !== 'check')
                  .slice(0, 3)
                  .map((o) => (
                    <Label key={`o${o.uci}`} muted>
                      ★ Chance: {o.description}
                    </Label>
                  ))}
                {insight.hanging.length + insight.threats.length + insight.opportunities.filter((o) => o.kind !== 'check').length === 0 && (
                  <Label muted>No immediate tactics.</Label>
                )}
              </>
            )}
            {history.length > 0 && <Label muted>{history.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m.san}` : m.san)).join(' ')}</Label>}
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 12, alignItems: 'center' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' },
});
