import { translate, type TKey } from './index';

/**
 * The game server sends English text with its errors. This catalog maps the known
 * messages to translation keys so players see them in their language. Unknown text
 * passes through unchanged, so a new server message is never lost, only untranslated.
 * When you add a server message players can see, add it here and under `server.*`.
 */
const EXACT: Record<string, TKey> = {
  'Action not allowed now': 'server.actionNotAllowed',
  'Already in a game': 'server.alreadyInGame',
  'Game still in progress': 'server.gameInProgress',
  'Invalid challenge id': 'server.invalidChallenge',
  'Invalid time control': 'server.invalidTimeControl',
  'You created this game': 'server.youCreatedThis',
  'Your opponent has left': 'server.opponentLeft',
  'Your rating is outside the range for this game': 'server.outOfRange',
  'Finish your current game first': 'server.finishCurrent',
  'Engine analysis is disabled during live games': 'server.engineLocked',
  'Engine analysis is not running on this server': 'server.engineOff',
  'You cannot watch this game': 'server.cannotWatch',
  'Challenger not found': 'server.challengerNotFound',
  'No such game': 'server.noSuchGame',
  'No such player': 'server.noSuchPlayer',
  'Player not found': 'server.noSuchPlayer',
  'That game is no longer open': 'server.gameNotOpen',
  'This invite has expired or was cancelled': 'server.inviteExpired',
  'This invite is for another player': 'server.inviteOther',
  'Slow down': 'server.slowDown',
  'Slow down: too many messages': 'server.slowDownChat',
  'Sign in to play rated games': 'server.signInRated',
  'You cannot report yourself': 'server.reportSelf',
  'Too many reports. Try again later': 'server.tooManyReports',
  'Too many coach requests, try again later': 'server.coachRateLimited',
  'Coach failed': 'server.coachFailed',
  'Something went wrong': 'errors.generic',
  'No such account': 'server.noSuchAccount',
  'This account has been closed for a fair play violation.': 'server.closedFairPlay',
  'Online play is turned off for this account because it was closed for a fair play violation': 'server.restriction.playDisabled',
};

const PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^(.+) is not online right now$/, (m) => translate('server.notOnline', { name: m[1]! })],
  [/^(.+) is in another game$/, (m) => translate('server.inAnotherGame', { name: m[1]! })],
  [/^Chat is disabled for your account for (\d+) more minutes?$/, (m) => translate('server.chatRestricted', { count: Number(m[1]) })],
];

/** Translate a message that came from the server, when it is one we know. */
export function serverText(message: string | null | undefined): string {
  if (!message) return '';
  const key = EXACT[message.replace(/\.$/, '')] ?? EXACT[message];
  if (key) return translate(key);
  for (const [re, fn] of PATTERNS) {
    const m = message.match(re);
    if (m) return fn(m);
  }
  return message;
}
