import type { Messages } from '../../core';
import type { leaderboard as en } from '../en/leaderboard';

export const leaderboard: Messages<typeof en> = {
  standing: 'Deine Platzierung',
  global: 'Weltweit',
  codeYours: 'Ländercode (deiner: {code})',
  codeExample: 'Ländercode, z. B. DE',
  ranked: { one: '{n} Spieler in der Rangliste', other: '{n} Spieler in der Rangliste' },
  rankedIn: { one: '{n} Spieler in der Rangliste in {country}', other: '{n} Spieler in der Rangliste in {country}' },
  empty: 'Noch keine Spieler in der Rangliste',
  emptyFriends: 'Füge Freunde hinzu und spiel gewertete Partien, um dich zu vergleichen.',
  emptyBody: 'Spieler erscheinen hier, sobald sich ihre Wertung nach ein paar gewerteten Partien eingependelt hat.',
  signInFriends: 'Anmelden, um Freunde zu sehen',
  chooseCountry: 'Land wählen',
  unavailable: 'Bestenliste nicht verfügbar',
  rowA11y: 'Platz {rank}, {name}, Wertung {rating}',
  games: { one: '{count} Partie', other: '{count} Partien' },
  peak: 'Höchstwert {n}',
  countryRank: 'Nr. {n} in {country}',
  openProfile: 'Öffnet das Profil',
};
