import { and, asc, desc, eq, inArray, lte, ne, or } from 'drizzle-orm';
import type { Database } from '../client';
import { awardStats, games, moves, userAwards, users, type UserAward } from '../schema';

/** A player's award counters, or undefined before they were first built. */
export async function getAwardStats(db: Database, userId: string): Promise<Record<string, unknown> | undefined> {
  const [row] = await db.select({ stats: awardStats.stats }).from(awardStats).where(eq(awardStats.userId, userId));
  return row?.stats;
}

export async function saveAwardStats(db: Database, userId: string, stats: object): Promise<void> {
  const value = stats as Record<string, unknown>;
  await db
    .insert(awardStats)
    .values({ userId, stats: value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: awardStats.userId, set: { stats: value, updatedAt: new Date() } });
}

/** Records earned levels; levels already recorded are kept with their first date. */
export async function addUserAwards(db: Database, userId: string, levels: { awardId: string; level: number; gameId?: string | null; earnedAt?: Date }[]): Promise<void> {
  if (!levels.length) return;
  await db
    .insert(userAwards)
    .values(levels.map((l) => ({ userId, awardId: l.awardId, level: l.level, gameId: l.gameId ?? null, earnedAt: l.earnedAt ?? new Date() })))
    .onConflictDoNothing();
}

export async function listUserAwards(db: Database, userId: string): Promise<UserAward[]> {
  return db.select().from(userAwards).where(eq(userAwards.userId, userId)).orderBy(desc(userAwards.earnedAt));
}

/** One finished game from a player's side, for rebuilding award counters. */
export interface AwardHistoryGame {
  id: string;
  color: 'w' | 'b';
  winner: 'w' | 'b' | null;
  endReason: string | null;
  initialMs: number;
  incrementMs: number;
  initialFen: string;
  plyCount: number;
  ratingAfter: number | null;
  openingName: string | null;
  opponentCountry: string | null;
  endedAt: Date | null;
  /** UCI moves of the opening (first 40 plies), when no opening name was stored. */
  openingMoves: string[];
  /** Mating move and the position before it, for checkmate wins. */
  mate: { fenBefore: string; uci: string } | null;
}

const OPENING_PLIES = 40;

/** A player's finished games, oldest first, with what awards need (except `exceptGameId`). */
export async function awardHistory(db: Database, userId: string, exceptGameId?: string): Promise<AwardHistoryGame[]> {
  const out: AwardHistoryGame[] = [];
  for (const color of ['w', 'b'] as const) {
    const mine = color === 'w' ? games.whiteUserId : games.blackUserId;
    const theirs = color === 'w' ? games.blackUserId : games.whiteUserId;
    const conds = [eq(mine, userId), eq(games.status, 'finished')];
    if (exceptGameId) conds.push(ne(games.id, exceptGameId));
    const rows = await db
      .select({
        id: games.id,
        winner: games.winner,
        endReason: games.endReason,
        initialMs: games.initialMs,
        incrementMs: games.incrementMs,
        initialFen: games.initialFen,
        plyCount: games.plyCount,
        ratingAfter: color === 'w' ? games.whiteRatingAfter : games.blackRatingAfter,
        openingName: games.openingName,
        opponentCountry: users.country,
        endedAt: games.endedAt,
      })
      .from(games)
      .leftJoin(users, eq(users.id, theirs))
      .where(and(...conds));
    for (const r of rows) out.push({ ...r, color, openingMoves: [], mate: null });
  }
  out.sort((a, b) => (a.endedAt?.getTime() ?? 0) - (b.endedAt?.getTime() ?? 0));

  const byId = new Map(out.map((g) => [g.id, g]));
  const needOpening = out.filter((g) => !g.openingName).map((g) => g.id);
  for (let i = 0; i < needOpening.length; i += 300) {
    const chunk = needOpening.slice(i, i + 300);
    const ms = await db
      .select({ gameId: moves.gameId, uci: moves.uci })
      .from(moves)
      .where(and(inArray(moves.gameId, chunk), lte(moves.ply, OPENING_PLIES)))
      .orderBy(asc(moves.gameId), asc(moves.ply));
    for (const m of ms) byId.get(m.gameId)?.openingMoves.push(m.uci);
  }
  const mates = out.filter((g) => g.endReason === 'checkmate' && g.winner === g.color && g.plyCount > 0);
  for (let i = 0; i < mates.length; i += 300) {
    const chunk = mates.slice(i, i + 300);
    const ms = await db
      .select({ gameId: moves.gameId, ply: moves.ply, uci: moves.uci, fenAfter: moves.fenAfter })
      .from(moves)
      .where(
        and(
          inArray(
            moves.gameId,
            chunk.map((g) => g.id),
          ),
          or(...chunk.map((g) => and(eq(moves.gameId, g.id), inArray(moves.ply, [g.plyCount, g.plyCount - 1])))),
        ),
      );
    const last = new Map<string, { ply: number; uci: string; fenAfter: string }[]>();
    for (const m of ms) last.set(m.gameId, [...(last.get(m.gameId) ?? []), m]);
    for (const g of chunk) {
      const rows = last.get(g.id) ?? [];
      const mating = rows.find((r) => r.ply === g.plyCount);
      const before = g.plyCount === 1 ? g.initialFen : rows.find((r) => r.ply === g.plyCount - 1)?.fenAfter;
      if (mating && before) g.mate = { fenBefore: before, uci: mating.uci };
    }
  }
  return out;
}

