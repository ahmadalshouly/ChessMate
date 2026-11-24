import type { HttpRoute } from '../auth/http';
import { applyCors, bearerUser, publicBaseUrl, readJson, sendJson } from '../auth/http';
import { AuthError, type AuthService } from '../auth/service';
import { AdminError, type Actor, type AdminService } from './service';

const STATUS: Record<AdminError['code'], number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid_input: 400,
  conflict: 409,
  unavailable: 503,
};

/**
 * Staff API under /api/admin, for accounts with the moderator or admin role.
 * Sign in as usual and send the access token; every route checks the role's
 * permissions (see ROLE_PERMISSIONS in @chessmate/core) and every change is
 * written to the audit log.
 *
 *   GET  /me                          role and permissions
 *   GET  /dashboard                   live numbers, queues, 14-day activity
 *   GET  /players?q=&status=&role=&offset=
 *   GET  /players/:id                 full record
 *   POST /players/:id/warn            { category, message }
 *   POST /players/:id/mute            { hours, reason }
 *   POST /players/:id/unmute          { reason? }
 *   POST /players/:id/note            { note }
 *   POST /players/:id/rename          { username, reason }
 *   POST /players/:id/signout         { reason? }
 *   POST /players/:id/role            { role, reason? }
 *   POST /players/:id/rating          { category, delta, reason }
 *   POST /players/:id/close           { reason, note? }
 *   POST /players/:id/reopen          { note? }
 *   GET  /reports?status=open|dismissed|actioned|all
 *   POST /reports/:id                 { action: dismiss|warn|chat_ban|unban, note?, hours?, message? }
 *   GET  /fairplay?status=open|dismissed|banned
 *   GET  /fairplay/:playerId
 *   POST /fairplay/:playerId/open     { note? }
 *   POST /fairplay/:playerId/dismiss  { note? }
 *   POST /fairplay/:playerId/ban      { note? }   closes the account for fair play, refunds opponents
 *   GET  /games?player=&before=
 *   GET  /games/:id
 *   POST /games/:id/abort             { reason }
 *   GET  /audit?target=&actor=&action=&before=
 *   GET  /titles?status=pending|approved|rejected|withdrawn|all
 *   GET  /titles/:id                  application with the player's standing
 *   POST /titles/:id/approve          { note? }
 *   POST /titles/:id/reject           { note }   shown to the player
 *   GET  /documents/:id               { url, expiresAt }: a 10-minute link that opens a proof file
 *   POST /players/:id/title           { title, note } grants; { title: null, reason, note? } takes it away
 *   POST /players/:id/tag             { tag, note? } sets an official role tag; { tag: null } removes it (admins only)
 *   POST /players/:id/message         { body } message from the ChessMate team
 *   POST /broadcast                   { body } announcement to every player (admins only)
 *   GET  /tournaments                 all tournaments, newest first
 *   POST /tournaments                 { name, description?, timeControl, rated, startsAt, durationMinutes, maxPlayers?, prizePool?, prizes? }
 *   POST /tournaments/:id             same fields, while it has not started
 *   POST /tournaments/:id/cancel      { reason? }
 *   POST /tournaments/:id/start       start a scheduled tournament now
 *   GET  /tournaments/:id             live monitor (players, every game and result, the whole chat, payments)
 *   POST /tournaments/:id/remove      { userId, reason? } remove a player
 *   POST /tournaments/:id/chat        { text } post in the tournament chat as staff
 *   POST /tournaments/:id/hidechat    { messageId, hidden } hide or show a chat message
 *   GET  /sponsors                    sponsor applications;  POST /sponsors/:id { status, note? }
 *   GET  /payouts                     prize payout requests; POST /payouts/:id  { status, note? }
 *   GET  /lessons                     every chapter and lesson, drafts included
 *   POST /lessons                     { lesson } creates a lesson; POST /lessons/:id { lesson } saves it
 *   POST /lessons/:id/delete          deletes a lesson; POST /lessons/:id/move { delta: -1 | 1 }
 *   POST /lesson-chapters             { id, title, blurb } creates or saves a chapter
 *   POST /lesson-chapters/:id/delete  (only when empty); POST /lesson-chapters/:id/move { delta }
 *   GET  /lesson-puzzles?theme=&rating=   a few puzzles to pick from; ?id= one puzzle by id
 *   GET  /campaigns                   push campaigns and push health
 *   POST /campaigns                   { name, kind, message, audience, scheduleAt?, trigger?, go? } (go: send/schedule/switch on now)
 *   GET  /campaigns/:id;  POST /campaigns/:id  same fields, saves (go: launch after saving)
 *   POST /campaigns/:id/action        { action: launch | pause | resume | cancel | delete }
 *   POST /campaign-preview            { audience } how many players it reaches now
 *   POST /campaign-test               { message } sends it to your own devices
 */
export function adminRoutes(admin: AdminService, auth: AuthService, opts: { corsOrigins?: string[] } = {}): HttpRoute {
  const corsOrigins = opts.corsOrigins ?? (process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()) : undefined);
  return async (req, res, url) => {
    if (!url.pathname.startsWith('/api/admin/') && url.pathname !== '/api/admin') return false;
    if (applyCors(req, res, corsOrigins)) return true;
    const parts = url.pathname.split('/').filter(Boolean).slice(2).map(decodeURIComponent); // drop "api", "admin"
    const [section = '', id, action] = parts;
    const q = url.searchParams;
    const num = (k: string) => (q.get(k) ? Number(q.get(k)) : undefined);
    try {
      const actor: Actor = admin.actorFor(bearerUser(req, auth));
      // Tournament forms can carry a sponsor logo (a data URL of up to ~400 KB); everything else stays small.
      const maxBody = section === 'tournaments' ? 1024 * 1024 : section === 'lessons' ? 256 * 1024 : undefined;
      const body = async (): Promise<Record<string, unknown>> => (req.method === 'POST' ? readJson(req, maxBody) : {});
      const route = `${req.method} ${section}${id ? '/:id' : ''}${action ? `/${action}` : ''}`;
      const ok = (v: unknown) => (sendJson(res, 200, v), true);
      switch (route) {
        case 'GET me':
          return ok(admin.me(actor));
        case 'GET dashboard':
          return ok(await admin.dashboard(actor));
        case 'GET players':
          return ok(await admin.searchPlayers(actor, { q: q.get('q') ?? undefined, status: q.get('status') ?? undefined, role: q.get('role') ?? undefined, offset: num('offset'), limit: num('limit') }));
        case 'GET players/:id':
          return ok({ player: await admin.player(actor, id!) });
        case 'POST players/:id/warn':
          return ok(await admin.warn(actor, id!, await body()));
        case 'POST players/:id/mute':
          return ok(await admin.mute(actor, id!, await body()));
        case 'POST players/:id/unmute':
          return ok(await admin.unmute(actor, id!, await body()));
        case 'POST players/:id/note':
          return ok({ note: await admin.note(actor, id!, await body()) });
        case 'POST players/:id/rename':
          return ok(await admin.rename(actor, id!, await body()));
        case 'POST players/:id/signout':
          return ok(await admin.signOutEverywhere(actor, id!, await body()));
        case 'POST players/:id/role':
          return ok(await admin.setRole(actor, id!, await body()));
        case 'POST players/:id/rating':
          return ok(await admin.adjustRating(actor, id!, await body()));
        case 'POST players/:id/close':
          return ok(await admin.closeAccount(actor, id!, await body()));
        case 'POST players/:id/reopen':
          return ok(await admin.reopenAccount(actor, id!, await body()));
        case 'GET reports':
          return ok({ reports: admin.reports(actor, q.get('status') ?? 'open') });
        case 'POST reports/:id':
          return ok(await admin.resolveReport(actor, id!, await body()));
        case 'GET fairplay':
          return ok({ cases: await admin.fairPlayQueue(actor, q.get('status') ?? 'open') });
        case 'GET fairplay/:id':
          return ok(await admin.fairPlayFile(actor, id!));
        case 'POST fairplay/:id/open':
          return ok(await admin.openFairPlayCase(actor, id!, await body()));
        case 'POST fairplay/:id/dismiss':
          return ok(await admin.dismissFairPlay(actor, id!, await body()));
        case 'POST fairplay/:id/ban': {
          const b = await body();
          return ok(await admin.closeAccount(actor, id!, { reason: 'fair_play', note: b.note }));
        }
        case 'GET games':
          return ok({ games: await admin.games(actor, { player: q.get('player') ?? undefined, before: num('before'), limit: num('limit') }) });
        case 'GET games/:id':
          return ok({ game: await admin.game(actor, id!) });
        case 'POST games/:id/abort':
          return ok(await admin.abortGame(actor, id!, await body()));
        case 'GET titles':
          return ok({ applications: await admin.titleQueue(actor, q.get('status') ?? 'pending') });
        case 'GET titles/:id':
          return ok({ application: await admin.titleApplication(actor, id!) });
        case 'POST titles/:id/approve':
          return ok(await admin.approveTitle(actor, id!, await body()));
        case 'POST titles/:id/reject':
          return ok(await admin.rejectTitle(actor, id!, await body()));
        case 'GET documents/:id':
          return ok(await admin.titleDocumentLink(actor, id!, publicBaseUrl(req)));
        case 'POST players/:id/title':
          return ok(await admin.setPlayerTitle(actor, id!, await body()));
        case 'POST players/:id/tag':
          return ok(await admin.setPlayerRoleTag(actor, id!, await body()));
        case 'POST players/:id/message':
          return ok(await admin.messagePlayer(actor, id!, await body()));
        case 'POST broadcast':
          return ok(await admin.broadcast(actor, await body()));
        case 'GET tournaments':
          return ok({ tournaments: admin.tournamentList(actor) });
        case 'POST tournaments':
          return ok({ tournament: await admin.createTournament(actor, await body()) });
        case 'POST tournaments/:id':
          return ok({ tournament: await admin.updateTournament(actor, id!, await body()) });
        case 'POST tournaments/:id/cancel':
          return ok({ tournament: await admin.cancelTournament(actor, id!, await body()) });
        case 'POST tournaments/:id/start':
          return ok({ tournament: await admin.startTournamentNow(actor, id!) });
        case 'GET tournaments/:id':
          return ok({ tournament: await admin.tournamentMonitor(actor, id!) });
        case 'POST tournaments/:id/remove':
          return ok({ player: await admin.removeTournamentPlayer(actor, id!, await body()) });
        case 'POST tournaments/:id/chat':
          return ok({ message: await admin.postTournamentChat(actor, id!, await body()) });
        case 'POST tournaments/:id/hidechat':
          return ok({ message: await admin.hideTournamentChat(actor, id!, await body()) });
        case 'GET sponsors':
          return ok({ applications: await admin.sponsorApplications(actor) });
        case 'POST sponsors/:id':
          return ok({ application: await admin.reviewSponsor(actor, id!, await body()) });
        case 'GET payouts':
          return ok({ requests: admin.payoutRequests(actor) });
        case 'POST payouts/:id':
          return ok({ request: await admin.reviewPayout(actor, id!, await body()) });
        case 'GET lessons':
          return ok({ chapters: admin.lessonContent(actor) });
        case 'POST lessons':
          return ok({ lesson: await admin.saveLesson(actor, await body(), true) });
        case 'POST lessons/:id': {
          const b = await body();
          if (b.id !== id) throw new AdminError('invalid_input', 'Lesson ids cannot be changed');
          return ok({ lesson: await admin.saveLesson(actor, b, false) });
        }
        case 'POST lessons/:id/delete':
          return ok(await admin.deleteLesson(actor, id!));
        case 'POST lessons/:id/move':
          return ok(await admin.moveLesson(actor, id!, await body()));
        case 'POST lesson-chapters':
          return ok({ chapter: await admin.saveLessonChapter(actor, await body()) });
        case 'POST lesson-chapters/:id/delete':
          return ok(await admin.deleteLessonChapter(actor, id!));
        case 'POST lesson-chapters/:id/move':
          return ok(await admin.moveLessonChapter(actor, id!, await body()));
        case 'GET lesson-puzzles':
          return ok({ puzzles: admin.lessonPuzzles(actor, { theme: q.get('theme') ?? undefined, rating: num('rating'), id: q.get('id') ?? undefined }) });
        case 'GET campaigns':
          return ok(await admin.campaignList(actor));
        case 'POST campaigns':
          return ok({ campaign: await admin.createCampaign(actor, await body()) });
        case 'GET campaigns/:id':
          return ok({ campaign: await admin.campaign(actor, id!) });
        case 'POST campaigns/:id':
          return ok({ campaign: await admin.updateCampaign(actor, id!, await body()) });
        case 'POST campaigns/:id/action': {
          const b = await body();
          return ok({ result: await admin.campaignAction(actor, id!, b.action) });
        }
        case 'POST campaign-preview':
          return ok(await admin.campaignPreview(actor, await body()));
        case 'POST campaign-test':
          return ok(await admin.campaignTest(actor, await body()));
        case 'GET audit':
          return ok({
            entries: await admin.auditLog(actor, { target: q.get('target') ?? undefined, actor: q.get('actor') ?? undefined, action: q.get('action') ?? undefined, before: num('before'), limit: num('limit') }),
          });
        default:
          sendJson(res, 404, { error: { code: 'not_found', message: 'No such endpoint' } });
          return true;
      }
    } catch (e) {
      if (e instanceof AdminError) sendJson(res, STATUS[e.code], { error: { code: e.code, message: e.message } });
      else if (e instanceof AuthError) sendJson(res, 400, { error: { code: e.code, message: e.message } });
      else {
        console.error('[admin]', e);
        sendJson(res, 500, { error: { code: 'server_error', message: 'Something went wrong' } });
      }
      return true;
    }
  };
}
