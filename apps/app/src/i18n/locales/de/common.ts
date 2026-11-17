import type { Messages } from '../../core';
import type { common as en } from '../en/common';

export const common: Messages<typeof en> = {
  back: 'Zurück',
  backTo: 'Zurück zu {title}',
  comingSoon: 'DEMNÄCHST',
  time: {
    justNow: 'gerade eben',
    minutesAgo: { one: 'vor {count} Min.', other: 'vor {count} Min.' },
    hoursAgo: { one: 'vor {count} Std.', other: 'vor {count} Std.' },
    daysAgo: { one: 'vor {count} Tag', other: 'vor {count} Tagen' },
  },
  category: {
    bullet: 'Bullet',
    blitz: 'Blitz',
    rapid: 'Schnellschach',
    classical: 'Klassisch',
    correspondence: 'Fernschach',
  },
  or: 'oder',
  saving: 'Speichern…',
  continue: 'Weiter',
  less: 'Weniger {label}',
  more: 'Mehr {label}',
  flipBoard: 'Brett drehen',
  decline: 'Ablehnen',
  cancel: 'Abbrechen',
  accept: 'Annehmen',
  guest: 'Gast',
  close: 'Schließen',
  errors: {
    unreachable: 'ChessMate-Server unter {url} nicht erreichbar',
  },
  tryAgain: 'Erneut versuchen',
  previous: 'Zurück',
  next: 'Weiter',
  send: 'Senden',
  nav: {
    first: 'Erster Zug',
    previous: 'Vorheriger Zug',
    pause: 'Pause',
    playThrough: 'Abspielen',
    next: 'Nächster Zug',
    last: 'Letzter Zug',
  },
  loading: 'Wird geladen…',
  dismiss: 'Schließen',
};
