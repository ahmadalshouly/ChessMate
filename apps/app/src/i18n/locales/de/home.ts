import type { Messages } from '../../core';
import type { home as en } from '../en/home';

export const home: Messages<typeof en> = {
  heroBody: 'Live-Partien gegen Spieler weltweit und kostenlose Lektionen, die dir zeigen, warum ein Zug funktioniert.',
  online: {
    title: 'Online spielen',
    cta: 'Lobby öffnen',
  },
  friend: {
    body: 'Schick einen Einladungslink oder fordere einen Spieler direkt heraus.',
    title: 'Freund herausfordern',
  },
  computer: {
    title: 'Gegen den Computer',
    body: 'Über zwanzig Gegner vom Anfänger bis zur Übermacht (etwa 3500). Zurücknehmen erlaubt, funktioniert offline.',
  },
  lessons: {
    title: 'Lektionen',
    body: 'Taktik, Mattbilder und Endspiele Schritt für Schritt, mit Puzzles zum Üben.',
  },
  analysis: {
    title: 'Analysebrett',
    body: 'Engine-Varianten, Bewertungsbalken und Pfeile für jede Stellung oder PGN.',
    cta: 'Analysebrett öffnen',
  },
  digDeep: {
    title: 'Dig Deep',
    body: 'Millionen Partien: Sieh, was aus jeder Stellung gespielt wird und wie es ausgeht.',
  },
  history: {
    title: 'Partienverlauf',
    body: 'Alte Partien Zug für Zug nachspielen. PGN teilen oder importieren.',
  },
  friends: {
    body: 'Sieh, wer online ist, und schau ihre Live-Partien.',
    title: 'Freunde',
  },
  practice: {
    title: 'Übungsbrett',
    body: 'Spiel beide Seiten mit Live-Drohungserkennung.',
  },
  leaderboards: {
    title: 'Bestenlisten',
    body: 'Die besten Spieler weltweit, in deinem Land und unter Freunden.',
  },
  heroTitle: 'Dein Zug.',
  onlineFriends: {
    title: 'Freunde online',
    count: { one: '{count} online', other: '{count} online' },
    none: 'Gerade ist kein Freund online',
    all: 'Alle Freunde',
  },
  dailyPuzzle: {
    whiteToMove: 'Weiß am Zug. Finde den besten Zug.',
    blackToMove: 'Schwarz am Zug. Finde den besten Zug.',
  },
  liveBoard: {
    title: 'Live-Partien',
    watch: 'Partie ansehen',
    finding: 'Suche eine laufende Partie…',
    empty: 'Gerade läuft keine Partie. Starte eine, dann steht vielleicht deine auf diesem Brett.',
    over: 'Partie beendet. Wechsle zur nächsten Live-Partie…',
    rated: 'Gewertet',
    casual: 'Ungewertet',
    a11y: 'Live-Partie: {white} gegen {black}',
    page: 'Live-Partie {n} von {total}',
  },
  stats: {
    online: 'Spieler online',
    games: 'Laufende Partien',
    seeking: 'Suchen eine Partie',
    offline: 'Server offline',
    live: 'Jetzt live',
  },
  otb: {
    title: 'Am Brett',
    body: 'Von Angesicht zu Angesicht auf einem Gerät, mit gemeinsamer Uhr.',
  },
  greeting: {
    night: 'Späte Stunde',
    morning: 'Guten Morgen',
    afternoon: 'Guten Tag',
    evening: 'Guten Abend',
  },
  quick: {
    title: 'Schnellpaarung',
    hint: 'Tippen, um die Suche zu starten',
    a11y: 'Schnellpaarung {tc} {category}',
  },
  improve: 'Verbessern',
  community: 'Community',
};
