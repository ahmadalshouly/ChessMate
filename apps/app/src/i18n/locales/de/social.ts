import type { Messages } from '../../core';
import type { social as en } from '../en/social';

export const social: Messages<typeof en> = {
  soon: {
    title: 'Community',
    blurb: 'Spiel gegen Freunde, tritt Clubs bei und sieh, wo du stehst.',
    friends: 'Freunde',
    friendsText: 'Füge Freunde hinzu und fordere sie heraus.',
    chat: 'Chat',
    chatText: 'Schreib Freunden und chatte in ungewerteten Partien.',
    leaderboards: 'Bestenlisten',
    leaderboardsText: 'Die Besten je Bedenkzeit, weltweit und unter Freunden.',
    watch: 'Zuschauen',
    watchText: 'Verfolge Live-Partien von Freunden und Topspielern.',
  },
  devSignIn: {
    title: 'Anmelden, um Freunde hinzuzufügen',
    dev: 'Entwicklungsversion: Wähle einen Test-Benutzernamen. Nutze auf jedem Gerät einen anderen Namen, um Freunde zwischen ihnen zu testen.',
    placeholder: 'Benutzername (3 bis 20 Zeichen)',
    prod: 'Freunde, Folgen und Aktivität gibt es nach der Anmeldung.',
  },
  presence: {
    playing: 'Spielt gerade',
  },
};
