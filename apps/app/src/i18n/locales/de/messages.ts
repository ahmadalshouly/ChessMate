import type { Messages } from '../../core';
import type { messages as en } from '../en/messages';

export const messages: Messages<typeof en> = {
  title: 'Nachrichten',
  subtitle: 'Unterhaltungen mit Spielern und Nachrichten vom ChessMate-Team.',
  new: 'Neue Nachricht',
  loadFailed: 'Nachrichten konnten nicht geladen werden',
  sendFailed: 'Nachricht konnte nicht gesendet werden',
  emptyTitle: 'Noch keine Nachrichten',
  emptyBody: 'Öffne das Profil eines Freundes und tippe auf Nachricht, um zu schreiben.',
  team: 'ChessMate-Team',
  you: 'Du',
  unread: {
    one: '{count} ungelesene Nachricht',
    other: '{count} ungelesene Nachrichten',
  },
  startConversation: 'Sag {name} hallo.',
  announcement: 'Ankündigung',
  teamReadOnly: 'So erreicht dich das ChessMate-Team. Antworten sind hier nicht möglich.',
  cannotSend: 'Du kannst diesem Spieler nicht schreiben.',
  placeholder: 'Nachricht schreiben',
  send: 'Senden',
};
