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
  hub: {
    title: 'Community',
    body: 'Deine Freunde, ihre laufenden Partien und was sie zuletzt gespielt haben.',
    online: { one: '{count} Freund online', other: '{count} Freunde online' },
    signInTitle: 'Melde dich an, um Spieler zu treffen',
    signInBody: 'Füge Freunde hinzu, schau ihre Partien, fordere sie heraus und verfolge, was sie spielen.',
    requests: 'Freundschaftsanfragen',
    liveNow: 'Freunde spielen gerade',
    challenge: 'Herausfordern',
    loading: 'Freunde werden geladen…',
    seeAll: 'Alle anzeigen',
    more: 'Mehr',
    findBody: 'Suche nach Benutzernamen und sende eine Freundschaftsanfrage.',
    sentRequests: 'Gesendete Anfragen',
    waitingCount: { one: '{count} wartet auf Antwort', other: '{count} warten auf Antwort' },
  },
  presence: {
    playing: 'Spielt gerade',
  },
};
