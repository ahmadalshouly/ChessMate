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
  'Something went wrong': 'errors.generic',
  'No such account': 'server.noSuchAccount',
  'This account has been closed for a fair play violation.': 'server.closedFairPlay',
  'Your account is closed for a fair play violation, so online play is turned off': 'server.restrictedFairPlay',
  'Accept the tournament rules to join': 'server.acceptRules',
  'This tournament has an entry fee: register and pay on the web': 'server.feeOnWeb',
  'Payments are not set up yet': 'server.paymentsOff',
  'Late joining is closed for this tournament': 'server.lateJoinClosed',
  'You were removed from this tournament': 'server.removedTournament',
  'Payouts open when the tournament has finished': 'server.payoutsLater',
  'Only prize winners can request a payout': 'server.payoutWinnersOnly',
  'You have already requested this payout': 'server.payoutDone',
  'You have already paid for this tournament': 'server.alreadyPaid',
  'Only friends can message this player': 'server.onlyFriendsMessage',
  'This player does not accept messages': 'server.noMessages',
  'This player does not accept friend requests': 'server.noFriendRequests',
  'Only friends of friends can send this player a request': 'server.friendsOfFriendsOnly',
  'This player does not accept followers': 'server.noFollowers',
  'This player does not accept challenges': 'server.noChallenges',
  'Only friends can challenge this player': 'server.onlyFriendsChallenge',
  'You cannot challenge this player': 'server.cannotChallenge',
  'You cannot message this player': 'server.cannotMessage',
  'You cannot message yourself': 'server.messageSelf',
  'Sign in to use messages': 'server.signInMessages',
  'This tournament is full': 'server.tournamentFull',
  'This tournament is over': 'server.tournamentOver',
  'This tournament is invite-only': 'server.tournamentPrivate',
  'Only invited players can chat in this tournament': 'server.tournamentPrivateChat',
  'Sign in to join tournaments': 'server.signInTournament',
  'That move is illegal: the secret queen was revealed': 'server.secretRevealed',
  'Pick one of your pawns before your first move': 'server.secretPick',
  'Replies to the ChessMate team are not possible here': 'messages.teamReadOnly',
  'Collection not found': 'collections.errors.notFound',
  'Give the collection a name': 'collections.errors.needName',
  'Sign in to keep game collections': 'collections.errors.signIn',
  'This game cannot be added to a collection': 'collections.errors.cannotAdd',
  'The game needs a title': 'collections.errors.cannotAdd',
  'That game is not in this collection': 'collections.errors.notInCollection',
  'This game is too long to keep in a collection': 'collections.errors.tooLong',
};

const PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^(.+) is not online right now$/, (m) => translate('server.notOnline', { name: m[1]! })],
  [/^(.+) is in another game$/, (m) => translate('server.inAnotherGame', { name: m[1]! })],
  [/^You can have up to (\d+) collections$/, (m) => translate('collections.errors.tooMany', { count: Number(m[1]) })],
  [/^A collection can hold up to (\d+) games$/, (m) => translate('collections.errors.full', { count: Number(m[1]) })],
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
