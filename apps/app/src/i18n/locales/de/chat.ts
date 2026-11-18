import type { Messages } from '../../core';
import type { chat as en } from '../en/chat';

export const chat: Messages<typeof en> = {
  title: 'Chat',
  placeholder: 'Nachricht',
  a11y: 'Chatnachricht',
  send: 'Senden',
  unmute: 'Stummschaltung aufheben',
  mute: 'Stummschalten',
  reported: 'Gemeldet',
  report: 'Melden',
  off: 'Chat aus',
  on: 'Chat an',
  offHint: 'Der Chat ist aus. Schalte ihn ein, um Nachrichten zu sehen.',
  empty: 'Sag Hallo oder nutze eine Schnellnachricht.',
  hidden: {
    one: '{count} Nachricht von stummgeschalteten Spielern ausgeblendet',
    other: '{count} Nachrichten von stummgeschalteten Spielern ausgeblendet',
  },
  quick: {
    hello: 'Hallo!',
    good_luck: 'Viel Glück!',
    have_fun: 'Viel Spaß!',
    nice_move: 'Schöner Zug!',
    oops: 'Hoppla',
    thanks: 'Danke!',
    good_game: 'Gutes Spiel!',
    well_played: 'Gut gespielt',
    rematch: 'Revanche?',
  },
};
