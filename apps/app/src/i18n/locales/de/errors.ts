import type { Messages } from '../../core';
import type { errors as en } from '../en/errors';

export const errors: Messages<typeof en> = {
  network: 'ChessMate ist gerade nicht erreichbar. Prüfe deine Verbindung und versuch es erneut.',
  generic: 'Etwas ist schiefgelaufen.',
  server: 'Bei uns ist etwas schiefgelaufen. Bitte versuch es erneut.',
  tryAgain: 'Etwas ist schiefgelaufen. Bitte versuch es erneut.',
};
