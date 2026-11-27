import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';

import type { Database } from '../client';
import { donations, sponsorApplications, sponsorMessages, sponsorPayments, type Donation, type SponsorApplication, type SponsorMessage, type SponsorPayment } from '../schema';

// ---------------------------------------------------------------- applications

export async function sponsorApplicationById(db: Database, id: string): Promise<SponsorApplication | null> {
  const [row] = await db.select().from(sponsorApplications).where(eq(sponsorApplications.id, id)).limit(1);
  return row ?? null;
}

export async function sponsorApplicationByToken(db: Database, token: string): Promise<SponsorApplication | null> {
  const [row] = await db.select().from(sponsorApplications).where(eq(sponsorApplications.accessToken, token)).limit(1);
  return row ?? null;
}

export async function sponsorApplicationsOfUser(db: Database, userId: string, limit = 50): Promise<SponsorApplication[]> {
  return db.select().from(sponsorApplications).where(eq(sponsorApplications.userId, userId)).orderBy(desc(sponsorApplications.createdAt)).limit(limit);
}

// ---------------------------------------------------------------- messages

export async function insertSponsorMessage(db: Database, m: typeof sponsorMessages.$inferInsert): Promise<SponsorMessage> {
  const [row] = await db.insert(sponsorMessages).values(m).returning();
  return row!;
}

export async function sponsorMessagesOf(db: Database, applicationId: string, limit = 500): Promise<SponsorMessage[]> {
  return db.select().from(sponsorMessages).where(eq(sponsorMessages.applicationId, applicationId)).orderBy(asc(sponsorMessages.createdAt)).limit(limit);
}

/** Every message of these applications (for the console's unread counts). */
export async function sponsorMessagesFor(db: Database, applicationIds: string[]): Promise<Pick<SponsorMessage, 'applicationId' | 'sender' | 'createdAt'>[]> {
  if (!applicationIds.length) return [];
  return db
    .select({ applicationId: sponsorMessages.applicationId, sender: sponsorMessages.sender, createdAt: sponsorMessages.createdAt })
    .from(sponsorMessages)
    .where(inArray(sponsorMessages.applicationId, applicationIds));
}

// ---------------------------------------------------------------- payment links

export async function insertSponsorPayment(db: Database, p: typeof sponsorPayments.$inferInsert): Promise<SponsorPayment> {
  const [row] = await db.insert(sponsorPayments).values(p).returning();
  return row!;
}

export async function sponsorPaymentsOf(db: Database, applicationId: string): Promise<SponsorPayment[]> {
  return db.select().from(sponsorPayments).where(eq(sponsorPayments.applicationId, applicationId)).orderBy(desc(sponsorPayments.createdAt));
}

export async function sponsorPaymentsFor(db: Database, applicationIds: string[]): Promise<SponsorPayment[]> {
  if (!applicationIds.length) return [];
  return db.select().from(sponsorPayments).where(inArray(sponsorPayments.applicationId, applicationIds));
}

export async function sponsorPaymentById(db: Database, id: string): Promise<SponsorPayment | null> {
  const [row] = await db.select().from(sponsorPayments).where(eq(sponsorPayments.id, id)).limit(1);
  return row ?? null;
}

export async function sponsorPaymentByLink(db: Database, stripeLinkId: string): Promise<SponsorPayment | null> {
  const [row] = await db.select().from(sponsorPayments).where(eq(sponsorPayments.stripeLinkId, stripeLinkId)).limit(1);
  return row ?? null;
}

export async function updateSponsorPayment(db: Database, id: string, patch: Partial<typeof sponsorPayments.$inferInsert>): Promise<SponsorPayment | null> {
  const [row] = await db.update(sponsorPayments).set(patch).where(eq(sponsorPayments.id, id)).returning();
  return row ?? null;
}

/** The latest payment links of every application, newest first (the console's Payments page). */
export async function recentSponsorPayments(db: Database, limit = 200): Promise<SponsorPayment[]> {
  return db.select().from(sponsorPayments).orderBy(desc(sponsorPayments.createdAt)).limit(limit);
}

// ---------------------------------------------------------------- donations

export async function insertDonation(db: Database, d: typeof donations.$inferInsert): Promise<Donation> {
  const [row] = await db.insert(donations).values(d).returning();
  return row!;
}

export async function donationBySession(db: Database, stripeSessionId: string): Promise<Donation | null> {
  const [row] = await db.select().from(donations).where(eq(donations.stripeSessionId, stripeSessionId)).limit(1);
  return row ?? null;
}

export async function updateDonation(db: Database, stripeSessionId: string, patch: Partial<typeof donations.$inferInsert>): Promise<void> {
  await db.update(donations).set(patch).where(eq(donations.stripeSessionId, stripeSessionId));
}

/** Paid donations, newest first. */
export async function paidDonations(db: Database, opts: { since?: Date; limit?: number } = {}): Promise<Donation[]> {
  const where = opts.since ? and(eq(donations.status, 'paid'), gte(donations.createdAt, opts.since)) : eq(donations.status, 'paid');
  return db
    .select()
    .from(donations)
    .where(where)
    .orderBy(desc(donations.createdAt))
    .limit(opts.limit ?? 500);
}
