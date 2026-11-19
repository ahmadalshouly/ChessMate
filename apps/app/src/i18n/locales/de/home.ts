import type { Messages } from '../../core';
import type { home as en } from '../en/home';

export const home: Messages<typeof en> = {
  heroBody: 'Live-Partien gegen Spieler weltweit und ein Coach, der dir zeigt, warum ein Zug funktioniert.',
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
    body: 'Acht Gegner vom Anfänger bis zum Experten. Tipps und Zurücknehmen, funktioniert offline.',
  },
  coach: {
    title: 'KI-Coach-Analyse',
    body: 'Die Schlüsselmomente einer Partie, erklärt. Dann frag zu jeder Stellung.',
  },
  analysis: {
    title: 'Analysebrett',
    body: 'Engine-Varianten, Bewertungsbalken und Pfeile für jede Stellung oder PGN.',
    cta: 'Analysebrett öffnen',
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
