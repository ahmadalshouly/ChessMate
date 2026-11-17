import { Game, analyzePosition, type PlayedMove, type Square } from '@chessmate/core';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Board } from '@/components/Board';
import { Button, Card, Label, Screen } from '@/components/ui';
import { checkSquareOf, useBoardInteraction } from '@/lib/useBoardInteraction';
import { saveGame } from '@/lib/archive';
import { practiceGame } from '@/lib/recordGame';
import { useBoardSize } from '@/lib/useBoardSize';
import { reasonText } from '@/components/play/GameOverCard';
import { useT } from '@/i18n';
import { colorLabel, pieceLabel, threatText } from '@/i18n/chess';

/**
 * Pass-and-play practice board with ChessMate's threat detection. Runs fully
 * on device (no engine) so it works offline; engine review lives server-side.
 */
export default function LocalPlay() {
  const tr = useT();
  const game = useRef(new Game());
  const [view, setView] = useState<{ fen: string; history: PlayedMove[] }>(() => ({ fen: new Game().fen, history: [] }));
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

  // Practice games are saved to the archive when they end, or on request.
  const session = useRef({ id: `pr_${Date.now().toString(36)}`, startedAt: Date.now() });
  const [savedId, setSavedId] = useState<string | null>(null);
  const save = () => {
    void saveGame(practiceGame(session.current.id, history, outcome, session.current.startedAt));
    setSavedId(session.current.id);
  };
  useEffect(() => {
    if (outcome) save();
  }, [outcome]); // eslint-disable-line react-hooks/exhaustive-deps

  const insight = useMemo(() => analyzePosition(view.fen, snapshot.turn), [view.fen, snapshot]);
  const threatened: Square[] = showThreats ? insight.hanging.map((h) => h.square) : [];
  const side = colorLabel(snapshot.turn);

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
              title={tr('practice.undo')}
              disabled={history.length === 0}
              onPress={() => {
                game.current.undo();
                interaction.clear();
                sync();
              }}
            />
            <Button variant="secondary" title={tr('computer.flip')} onPress={() => setFlip((f) => !f)} />
            <View style={styles.toggle}>
              <Label muted>{tr('practice.threats')}</Label>
              <Switch value={showThreats} onValueChange={setShowThreats} />
            </View>
          </View>

          <Card>
            {outcome ? (
              <Label size={18} bold>
                {outcome.result} · {reasonText(outcome.reason)}
              </Label>
            ) : (
              <Label bold>
                {snapshot.inCheck ? tr('practice.toMoveInCheck', { color: side }) : tr('play.toMove', { color: side })}
              </Label>
            )}
            {showThreats && !outcome && (
              <>
                {insight.hanging.slice(0, 3).map((h) => (
                  <Label key={h.square} muted>
                    {`⚠ ${tr('practice.hanging', { color: side, piece: pieceLabel(h.piece), square: h.square })}`}
                  </Label>
                ))}
                {insight.threats.slice(0, 3).map((t) => (
                  <Label key={`t${t.uci}`} muted>
                    {`⚔ ${tr('practice.threatens', { threat: threatText(t, view.fen) })}`}
                  </Label>
                ))}
                {insight.opportunities
                  .filter((o) => o.kind !== 'check')
                  .slice(0, 3)
                  .map((o) => (
                    <Label key={`o${o.uci}`} muted>
                      {`★ ${tr('computer.chance', { threat: threatText(o, view.fen) })}`}
                    </Label>
                  ))}
                {insight.hanging.length + insight.threats.length + insight.opportunities.filter((o) => o.kind !== 'check').length === 0 && (
                  <Label muted>{tr('computer.noTactics')}</Label>
                )}
              </>
            )}
            {history.length > 0 && (
              <View style={styles.row}>
                {!outcome && <Button variant="secondary" title={savedId ? tr('practice.updateSaved') : tr('practice.save')} onPress={save} />}
                {savedId && <Button variant="secondary" title={tr('practice.review')} onPress={() => router.push({ pathname: '/games/[id]', params: { id: savedId } })} />}
              </View>
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
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginStart: 'auto' },
});
