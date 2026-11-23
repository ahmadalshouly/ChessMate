/**
 * Gives an account a staff role from the command line:
 *
 *   pnpm admin:grant <username> [admin|moderator|user]
 *
 * Stop the game server first when using the embedded dev database (PGlite
 * allows one process at a time). With Postgres it can run any time; the
 * running server picks the role up on its next start. ADMIN_USERNAMES in .env
 * is the no-command alternative.
 */
import { findUserByUsername, insertAudit, openDb, setUserRole } from '@chessmate/db';

const [name, roleArg = 'admin'] = process.argv.slice(2);
if (!name || !['admin', 'moderator', 'user'].includes(roleArg)) {
  console.error('Usage: pnpm admin:grant <username> [admin|moderator|user]');
  process.exit(1);
}
const role = roleArg as 'admin' | 'moderator' | 'user';
const h = openDb();
try {
  await h.migrate();
  const u = await findUserByUsername(h.db, name);
  if (!u) {
    console.error(`No account named "${name}". Sign up in the app first.`);
    process.exitCode = 1;
  } else {
    await setUserRole(h.db, u.id, role);
    await insertAudit(h.db, { actorId: 'system', actorName: 'command line', action: 'role.change', targetType: 'user', targetId: u.id, targetName: u.username, reason: 'pnpm admin:grant', details: { from: u.role, to: role } });
    console.log(`${u.username} is now ${role} (${h.kind}: ${h.location}). Restart the server if it is running.`);
  }
} finally {
  await h.close();
}
