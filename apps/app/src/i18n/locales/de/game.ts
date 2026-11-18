import type { Messages } from '../../core';
import type { game as en } from '../en/game';

export const game: Messages<typeof en> = {
  action: {
    chat: 'Chat',
    more: 'Mehr',
    draw: 'Remis',
    abort: 'Abbrechen',
    resign: 'Aufgeben',
    back: 'Zurück',
    forward: 'Vor',
    review: 'Analyse',
    rematch: 'Revanche',
    takeback: 'Zurücknehmen',
    flip: 'Drehen',
    newGame: 'Neu',
  },
  moves: 'Züge',
  noMoves: 'Noch keine Züge.',
  backToLive: 'Zurück zur aktuellen Stellung',
  viewingMove: 'Stellung nach {move}',
  live: 'Live',
  close: 'Schließen',
  more: {
    title: 'Partieoptionen',
    flip: 'Brett drehen',
    cancelPremove: 'Vorauszug löschen',
    newGame: 'Neue {tc}-Partie',
    lobby: 'Zur Lobby',
    reviewHistory: 'Im Partieverlauf öffnen',
    changeOpponent: 'Anderen Gegner wählen',
    save: 'Im Partieverlauf speichern',
    saved: 'Im Partieverlauf gespeichert',
  },
  resign: {
    title: 'Partie aufgeben?',
    body: 'Dein Gegner gewinnt die Partie.',
    confirm: 'Aufgeben',
  },
  draw: {
    offered: 'Remis angeboten',
    offeredBody: 'Warte auf deinen Gegner.',
  },
  player: {
    guest: 'Gastspieler',
    viewProfile: 'Ganzes Profil ansehen',
    rating: 'Wertung',
    games: 'Partien',
    record: '{w} S · {d} R · {l} N',
    noProfile: 'Dieser Spieler hat kein öffentliches Profil.',
    you: 'Du',
    toMove: 'Am Zug',
  },
  over: {
    close: 'Ergebnis ausblenden',
    showResult: 'Ergebnis',
  },
};
