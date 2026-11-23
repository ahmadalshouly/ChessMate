import type { TournamentGameView } from '@chessmate/core';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { reasonText } from '@/components/play/ResultBadges';
import { useT } from '@/i18n';
import { Badge, ListGroup, ListRow, Text } from '@/ui';

import { formatScore } from './format';

/** "1-0" → "1–0", "1/2-1/2" → "½–½". */
const score = (r: TournamentGameView['result']) => (r === '*' ? '–' : r.replace(/1\/2/g, '½').replace('-', '–'));

/**
 * Game results of a tournament, newest first: who played whom, the score,
 * how it ended and the tournament points each side got. Tapping a game
 * opens it. `staff` also marks games that did not count and games still
 * being played.
 */
export function TournamentResults({ games, meId, staff, limit }: { games: TournamentGameView[]; meId?: string | null; staff?: boolean; limit?: number }) {
  const tr = useT();
  const shown = limit ? games.slice(0, limit) : games;
  const name = (p: TournamentGameView['white']) => (p.userId === meId ? `${p.username} (${tr('messages.you')})` : p.username);
  const pts = (n: number) => (n > 0 ? `+${formatScore(n)}` : formatScore(n));
  return (
    <ListGroup>
      {shown.map((g) => {
        const live = g.result === '*' && g.endedAt === null;
        const subtitle = [
          g.round ? tr('tournaments.results.round', { n: g.round }) : null,
          live ? tr('tournaments.playingNow') : g.endReason === 'tournament_over' ? tr('tournaments.results.tournamentOver') : g.endReason ? reasonText(g.endReason) : null,
          g.counted ? tr('tournaments.results.points', { white: pts(g.white.points), black: pts(g.black.points) }) : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <ListRow
            key={g.gameId}
            title={`${name(g.white)} – ${name(g.black)}`}
            subtitle={subtitle}
            chevron
            onPress={() => (live ? router.push(`/watch/${g.gameId}`) : router.push({ pathname: '/game/[id]', params: { id: g.gameId } }))}
            right={
              <View style={styles.right}>
                {staff && live && <Badge size="sm" tone="live" label={tr('tournaments.playingNow')} />}
                {staff && !live && !g.counted && <Badge size="sm" tone="outline" label={tr('tournaments.results.notCounted')} />}
                <Text variant="numeric">{score(g.result)}</Text>
              </View>
            }
          />
        );
      })}
    </ListGroup>
  );
}

const styles = StyleSheet.create({
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
