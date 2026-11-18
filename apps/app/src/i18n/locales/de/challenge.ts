import type { Messages } from '../../core';
import type { challenge as en } from '../en/challenge';

export const challenge: Messages<typeof en> = {
  yourColour: 'Deine Farbe',
  createLink: 'Einladungslink erstellen',
  orDirect: 'Oder fordere einen Spieler direkt über seine Spieler-ID heraus',
  playerId: 'Spieler-ID',
  send: 'Herausforderung senden',
  shareLink: 'Link teilen',
  copy: 'Kopieren',
  startsWhen: 'Die Partie beginnt, sobald dein Freund den Link öffnet und annimmt. Lass diesen Bildschirm offen.',
  cancel: 'Herausforderung zurückziehen',
  ended: {
    accepted: 'Herausforderung angenommen',
    declined: 'Deine Herausforderung wurde abgelehnt',
    cancelled: 'Diese Herausforderung wurde zurückgezogen',
    expired: 'Diese Herausforderung ist abgelaufen',
  },
  rated: 'gewertet',
  casual: 'ungewertet',
  youPlay: {
    w: 'du spielst Weiß',
    b: 'du spielst Schwarz',
    random: 'zufällige Farbe',
  },
  ratedNeedsAccount: 'Gewertete Partien brauchen ein Konto',
  ratedGame: 'Gewertete Partie',
  yourId: 'Deine Spieler-ID: {id}',
  waitingFor: 'Warte, bis {name} annimmt…',
  linkReady: 'Einladungslink bereit',
  shareMessage: 'Spiel Schach mit mir auf ChessMate:',
  copied: 'Link kopiert',
  copyAbove: 'Kopiere den Link oben, um ihn zu teilen',
  longPress: 'Halte den Link gedrückt, um ihn zu kopieren',
  challengesYou: '{name} ({rating}) fordert dich heraus',
  loading: 'Einladung wird geladen…',
  used: 'Mit dieser Einladung wurde schon eine Partie gestartet.',
};
