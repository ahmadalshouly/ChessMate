import { eq, and } from 'drizzle-orm';
import type { Database } from '../client';
import { tournamentGames, tournamentPlayers, tournaments, type TournamentGameRow, type TournamentPlayerRow, type TournamentRow } from '../schema';

export type TournamentWithEntries = { tournament: TournamentRow; players: TournamentPlayerRow[]; games: TournamentGameRow[] };

/** Every tournament with its entries and pairings, for the in-memory service at boot. */
export async function loadTournaments(db: Database): Promise<TournamentWithEntries[]> {
  const [ts, ps, gs] = await Promise.all([db.select().from(tournaments), db.select().from(tournamentPlayers), db.select().from(tournamentGames)]);
  const byId = new Map<string, TournamentWithEntries>(ts.map((t) => [t.id, { tournament: t, players: [], games: [] }]));
  for (const p of ps) byId.get(p.tournamentId)?.players.push(p);
  for (const g of gs) byId.get(g.tournamentId)?.games.push(g);
  return [...byId.values()];
}

export async function saveTournament(db: Database, row: TournamentRow): Promise<void> {
  const { id: _id, createdAt: _c, ...rest } = row;
  await db
    .insert(tournaments)
    .values(row)
    .onConflictDoUpdate({ target: tournaments.id, set: { ...rest, updatedAt: new Date() } });
}

export async function saveTournamentPlayer(db: Database, row: TournamentPlayerRow): Promise<void> {
  const { tournamentId: _t, userId: _u, joinedAt: _j, ...rest } = row;
  await db
    .insert(tournamentPlayers)
    .values(row)
    .onConflictDoUpdate({ target: [tournamentPlayers.tournamentId, tournamentPlayers.userId], set: rest });
}

export async function deleteTournamentPlayer(db: Database, tournamentId: string, userId: string): Promise<void> {
  await db.delete(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, tournamentId), eq(tournamentPlayers.userId, userId)));
}

export async function saveTournamentGame(db: Database, row: TournamentGameRow): Promise<void> {
  const { tournamentId: _t, gameId: _g, ...rest } = row;
  await db
    .insert(tournamentGames)
    .values(row)
    .onConflictDoUpdate({ target: [tournamentGames.tournamentId, tournamentGames.gameId], set: rest });
}
