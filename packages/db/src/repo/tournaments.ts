import { and, asc, desc, eq } from 'drizzle-orm';
import type { Database } from '../client';
import {
  payoutRequests,
  sponsorApplications,
  tournamentGames,
  tournamentMessages,
  tournamentPayments,
  tournamentPlayers,
  tournaments,
  type PayoutRequest,
  type TournamentGame,
  type TournamentMessage,
  type SponsorApplication,
  type Tournament,
  type TournamentPayment,
  type TournamentPlayer,
} from '../schema';

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
      set: {
        score: p.score,
        games: p.games,
        wins: p.wins,
        draws: p.draws,
        losses: p.losses,
        streak: p.streak,
        withdrawn: p.withdrawn,
        rating: p.rating,
        disqualified: p.disqualified,
        paid: p.paid,
        rulesAcceptedAt: p.rulesAcceptedAt,
        state: p.state,
      },
    });
}

// ---------------------------------------------------------------- games and results

export async function tournamentGamesOf(db: Database, tournamentId: string): Promise<TournamentGame[]> {
  return db.select().from(tournamentGames).where(eq(tournamentGames.tournamentId, tournamentId)).orderBy(asc(tournamentGames.startedAt));
}

/** Insert or replace one tournament game (started, then again with its result). */
export async function saveTournamentGame(db: Database, g: typeof tournamentGames.$inferInsert): Promise<void> {
  await db
    .insert(tournamentGames)
    .values(g)
    .onConflictDoUpdate({
      target: [tournamentGames.tournamentId, tournamentGames.gameId],
      set: { result: g.result, endReason: g.endReason, counted: g.counted, whitePoints: g.whitePoints, blackPoints: g.blackPoints, endedAt: g.endedAt },
    });
}

// ---------------------------------------------------------------- chat

/** The latest messages of a tournament, oldest first. */
export async function tournamentMessagesOf(db: Database, tournamentId: string, limit = 500): Promise<TournamentMessage[]> {
  const rows = await db.select().from(tournamentMessages).where(eq(tournamentMessages.tournamentId, tournamentId)).orderBy(desc(tournamentMessages.createdAt)).limit(limit);
  return rows.reverse();
}

export async function insertTournamentMessage(db: Database, m: typeof tournamentMessages.$inferInsert): Promise<TournamentMessage> {
  const [row] = await db.insert(tournamentMessages).values(m).returning();
  return row!;
}

export async function setTournamentMessageHidden(db: Database, id: string, hiddenAt: Date | null, hiddenBy: string | null): Promise<void> {
  await db.update(tournamentMessages).set({ hiddenAt, hiddenBy }).where(eq(tournamentMessages.id, id));
}

// ---------------------------------------------------------------- entry fees (Stripe)

export async function insertPayment(db: Database, p: typeof tournamentPayments.$inferInsert): Promise<TournamentPayment> {
  const [row] = await db.insert(tournamentPayments).values(p).returning();
  return row!;
}

export async function paymentBySession(db: Database, stripeSessionId: string): Promise<TournamentPayment | null> {
  const [row] = await db.select().from(tournamentPayments).where(eq(tournamentPayments.stripeSessionId, stripeSessionId)).limit(1);
  return row ?? null;
}

export async function setPaymentStatus(db: Database, stripeSessionId: string, status: string, paidAt: Date | null): Promise<void> {
  await db.update(tournamentPayments).set({ status, paidAt }).where(eq(tournamentPayments.stripeSessionId, stripeSessionId));
}

export async function paymentsOf(db: Database, tournamentId: string): Promise<TournamentPayment[]> {
  return db.select().from(tournamentPayments).where(eq(tournamentPayments.tournamentId, tournamentId)).orderBy(desc(tournamentPayments.createdAt));
}

// ---------------------------------------------------------------- sponsor applications

export async function insertSponsorApplication(db: Database, a: typeof sponsorApplications.$inferInsert): Promise<SponsorApplication> {
  const [row] = await db.insert(sponsorApplications).values(a).returning();
  return row!;
}

export async function listSponsorApplications(db: Database, limit = 200): Promise<SponsorApplication[]> {
  return db.select().from(sponsorApplications).orderBy(desc(sponsorApplications.createdAt)).limit(limit);
}

export async function updateSponsorApplication(db: Database, id: string, patch: Partial<typeof sponsorApplications.$inferInsert>): Promise<SponsorApplication | null> {
  const [row] = await db.update(sponsorApplications).set(patch).where(eq(sponsorApplications.id, id)).returning();
  return row ?? null;
}

// ---------------------------------------------------------------- payout requests

export async function insertPayoutRequest(db: Database, r: typeof payoutRequests.$inferInsert): Promise<PayoutRequest> {
  const [row] = await db.insert(payoutRequests).values(r).returning();
  return row!;
}

export async function payoutRequestOf(db: Database, tournamentId: string, userId: string): Promise<PayoutRequest | null> {
  const [row] = await db
    .select()
    .from(payoutRequests)
    .where(and(eq(payoutRequests.tournamentId, tournamentId), eq(payoutRequests.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function listPayoutRequests(db: Database, limit = 200): Promise<PayoutRequest[]> {
  return db.select().from(payoutRequests).orderBy(desc(payoutRequests.createdAt)).limit(limit);
}

export async function updatePayoutRequest(db: Database, id: string, patch: Partial<typeof payoutRequests.$inferInsert>): Promise<PayoutRequest | null> {
  const [row] = await db.update(payoutRequests).set(patch).where(eq(payoutRequests.id, id)).returning();
  return row ?? null;
}
