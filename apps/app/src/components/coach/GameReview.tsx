import { Game, formatScore, type CoachMoveNote, type CoachReview, type Color, type GameAnalysis, type MoveClass, type Square } from '@chessmate/core';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { Board } from '@/components/Board';
import { CoachChat } from '@/components/coach/CoachChat';
import { BoardMoveBadge, MoveBadge } from '@/components/MoveBadge';
import { Button, Card, Label } from '@/components/ui';
import { MOVE_CLASS } from '@/constants/analysis';
import { useTheme, type Palette } from '@/constants/theme';
import { translate, useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { requestReview } from '@/lib/coachApi';
import { useBoardSize } from '@/lib/useBoardSize';

/**
 * Post-game coach review: summary, accuracy, key moments on the board with
 * plain-language explanations, habits to fix, and a chat about any moment.
 */
export function GameReview({ analysis, perspective, token }: { analysis: GameAnalysis; perspective: Color; token: string }) {
  const t = useTheme();
  const tr = useT();
  const size = useBoardSize(360);
  const [review, setReview] = useState<CoachReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [index, setIndex] = useState(0);
  const [showBest, setShowBest] = useState(false);

  useEffect(() => {
    let live = true;
    setError(null);
    setReview(null);
    requestReview(analysis, perspective, token)
      .then((r) => live && setReview(r))
      .catch((e) => live && setError(e instanceof Error ? serverText(e.message) : translate('coach.reviewFailed')));
    return () => {
      live = false;
    };
  }, [analysis, perspective, token, attempt]);

  const moment = review?.keyMoments[index];
  const move = moment ? analysis.moves.find((m) => m.ply === moment.ply) : undefined;
  const shown = useMemo(() => {
    if (!moment || !move) return null;
    const uci = showBest ? move.best.uci : move.uci;
    const g = new Game(moment.fenBefore);
    g.move(uci);
    return { fen: g.fen, from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square };
  }, [moment, move, showBest]);

  if (error) {
    return (
      <Card>
        <Label bold>{tr('coach.loadFailed')}</Label>
        <Label muted>{error}</Label>
        <Button title={tr('common.tryAgain')} onPress={() => setAttempt((a) => a + 1)} />
      </Card>
    );
  }
  if (!review) {
    return (
      <Card>
        <View style={styles.loading}>
          <ActivityIndicator color={t.text} />
          <Label muted>{tr('coach.reviewing')}</Label>
        </View>
      </Card>
    );
  }

  const me = perspective;
  const them: Color = me === 'w' ? 'b' : 'w';
  const playerRating = (me === 'w' ? analysis.white : analysis.black).rating;

  return (
    <View style={styles.stack}>
      <Card>
        <View style={styles.between}>
          <Label size={20} bold>
            {tr('coach.title')}
          </Label>
          <Badge t={t} text={review.source === 'ai' ? tr('coach.ai') : tr('coach.quick')} />
        </View>
        <Label>{review.summary}</Label>
        <View style={styles.statsRow}>
          <Stat t={t} label={tr('coach.yourAccuracy')} value={`${Math.round(review.accuracy[me])}%`} />
          <Stat t={t} label={tr('coach.opponent')} value={`${Math.round(review.accuracy[them])}%`} />
          <Stat t={t} label={tr('coach.blunders')} value={String(review.counts[me].blunder ?? 0)} />
          <Stat t={t} label={tr('coach.mistakes')} value={String(review.counts[me].mistake ?? 0)} />
        </View>
        {review.source === 'offline' && <Label muted size={13}>{tr('coach.offline')}</Label>}
      </Card>

      {moment && shown && move ? (
        <Card>
          <View style={styles.between}>
            <Label size={18} bold>
              {tr('coach.keyMoment', { n: index + 1, total: review.keyMoments.length })}
            </Label>
            <ClassChip t={t} cls={moment.classification} />
          </View>
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: Math.min(size, 520), height: Math.min(size, 520) }}>
              <Board fen={shown.fen} orientation={me} size={Math.min(size, 760)} lastMove={{ from: shown.from, to: shown.to }} />
              {!showBest && <BoardMoveBadge square={shown.to} cls={moment.classification} size={Math.min(size, 760)} orientation={me} />}
            </View>
          </View>
          <View style={styles.toggle}>
            <Segment t={t} active={!showBest} label={tr('coach.played', { move: `${moment.moveLabel} ${moment.san}` })} onPress={() => setShowBest(false)} />
            {moment.betterMove && <Segment t={t} active={showBest} label={tr('coach.best', { move: moment.betterMove })} onPress={() => setShowBest(true)} />}
          </View>
          <MomentText t={t} note={moment} isMine={moment.mover === me} evalText={`${formatScore(move.best.score)} → ${formatScore(move.scoreAfter)}`} />
          <View style={styles.nav}>
            <View style={{ flex: 1 }}>
              <Button variant="secondary" title={tr('common.previous')} disabled={index === 0} onPress={() => (setIndex(index - 1), setShowBest(false))} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                variant="secondary"
                title={tr('common.next')}
                disabled={index >= review.keyMoments.length - 1}
                onPress={() => (setIndex(index + 1), setShowBest(false))}
              />
            </View>
          </View>
        </Card>
      ) : (
        <Card>
          <Label bold>{tr('coach.noMistakes')}</Label>
          <Label muted>{tr('coach.noMistakesBody')}</Label>
        </Card>
      )}

      {review.mistakePatterns.length > 0 && (
        <Card>
          <Label size={18} bold>
            {tr('coach.habits')}
          </Label>
          {review.mistakePatterns.map((p, i) => (
            <Label key={i}>• {p}</Label>
          ))}
        </Card>
      )}

      {review.studyThemes.length > 0 && (
        <Card>
          <Label size={18} bold>
            {tr('coach.studyNext')}
          </Label>
          {review.studyThemes.map((s, i) => (
            <View key={i} style={{ gap: 2 }}>
              <Label bold>{s.theme}</Label>
              <Label muted>{s.why}</Label>
            </View>
          ))}
        </Card>
      )}

      {moment && (
        <CoachChat
          token={token}
          context={{
            fen: moment.fenBefore,
            perspective: me,
            playerRating,
            engine: move ? { bestMove: move.best.san, line: move.best.line, score: move.best.score } : undefined,
            lastMove: { san: moment.san, classification: moment.classification },
          }}
        />
      )}
    </View>
  );
}

function MomentText({ t, note, isMine, evalText }: { t: Palette; note: CoachMoveNote; isMine: boolean; evalText: string }) {
  const tr = useT();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.muted, fontSize: 13 }}>
        {isMine ? tr('coach.yourMove') : tr('coach.opponentMove')}
        {note.theme ? ` · ${note.theme}` : ''} · {tr('coach.eval', { value: evalText })}
      </Text>
      <Label>{note.explanation}</Label>
    </View>
  );
}

function ClassChip({ t, cls }: { t: Palette; cls: MoveClass }) {
  const severe = cls === 'blunder' || cls === 'mistake' || cls === 'miss';
  return (
    <View style={[styles.chip, styles.classChip, { borderColor: severe ? t.danger : t.border }]}>
      <MoveBadge cls={cls} size={18} />
      <Text style={{ color: severe ? t.danger : t.muted, fontSize: 13, fontWeight: '600' }}>{MOVE_CLASS[cls].label}</Text>
    </View>
  );
}

function Badge({ t, text }: { t: Palette; text: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: t.accent, borderColor: t.accent }]}>
      <Text style={{ color: t.onAccent, fontSize: 12, fontWeight: '700', letterSpacing: 0.3 }}>{text}</Text>
    </View>
  );
}

function Stat({ t, label, value }: { t: Palette; label: string; value: string }) {
  return (
    <View style={[styles.stat, { borderColor: t.border }]}>
      <Text style={{ color: t.text, fontSize: 20, fontWeight: '700' }}>{value}</Text>
      <Text style={{ color: t.muted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

function Segment({ t, active, label, onPress }: { t: Palette; active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.segment, { backgroundColor: active ? t.accent : 'transparent', borderColor: active ? t.accent : t.border }]}>
      <Text style={{ color: active ? t.onAccent : t.text, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flexGrow: 1, flexBasis: '22%', minWidth: 72, borderWidth: 1, borderRadius: 12, padding: 10 },
  chip: { borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  classChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4 },
  toggle: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  segment: { borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  nav: { flexDirection: 'row', gap: 8 },
});
