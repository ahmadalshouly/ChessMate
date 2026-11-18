import type { Messages } from '../../core';
import type { report as en } from '../en/report';

export const report: Messages<typeof en> = {
  sent: 'Meldung gesendet',
  what: 'Was ist passiert? Meldungen enthalten den Chat und die Züge dieser Partie.',
  details: 'Details (optional)',
  failed: 'Die Meldung konnte nicht gesendet werden. Versuch es gleich noch einmal.',
  thanks: 'Danke. Ein Moderator prüft {name}. Du kannst die Person auch im Chat stummschalten.',
  title: '{name} melden',
  sending: 'Wird gesendet…',
  send: 'Meldung senden',
  reasons: {
    abusive_chat: 'Beleidigender oder anstößiger Chat',
    cheating: 'Betrug oder Engine-Nutzung',
    spam: 'Spam oder Werbung',
    offensive_name: 'Anstößiger Benutzername',
    unsporting: 'Unsportliches Verhalten (Hinhalten, Verlassen)',
    other: 'Etwas anderes',
  },
};
