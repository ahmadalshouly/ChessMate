import { asc, desc, eq } from 'drizzle-orm';
import type { Database } from '../client';
import { tournamentPlayers, tournaments, type Tournament, type TournamentPlayer } from '../schema';

export type NewTournamentRow = typeof tournaments.$inferInsert;

export async function insertTournament(db: Database, t: NewTournamentRow): Promise<Tournament> {
  const [row] = await db.insert(tournaments).values(t).returning();
  return row!;
}

export async function updateTournament(db: Database, id: string, patch: Partial<NewTournamentRow>): Promise<void> {
  await db.update(tournaments).set(patch).where(eq(tournaments.id, id));
}

export async function deleteTournament(db: Database, id: string): Promise<void> {
  await db.delete(tournaments).where(eq(tournaments.id, id));
}

/** Most recent first; enough for the list and the server's memory. */
export async function listTournaments(db: Database, limit = 200): Promise<Tournament[]> {
  return db.select().from(tournaments).orderBy(desc(tournaments.startsAt)).limit(limit);
}

export async function tournamentPlayersOf(db: Database, tournamentId: string): Promise<TournamentPlayer[]> {
  return db.select().from(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, tournamentId)).orderBy(asc(tournamentPlayers.joinedAt));
}

/** Insert or replace one player's standing. */
export async function saveTournamentPlayer(db: Database, p: typeof tournamentPlayers.$inferInsert): Promise<void> {
  await db
    .insert(tournamentPlayers)
    .values(p)
    .onConflictDoUpdate({
      target: [tournamentPlayers.tournamentId, tournamentPlayers.userId],
      set: { score: p.score, games: p.games, wins: p.wins, draws: p.draws, losses: p.losses, streak: p.streak, withdrawn: p.withdrawn, rating: p.rating },
    });
}
