import type { Messages } from '../../core';
import type { cookies as en } from '../en/cookies';

export const cookies: Messages<typeof en> = {
  banner: {
    title: 'Cookies bei ChessMate',
    body: 'Wir speichern nur, was ChessMate braucht, damit du angemeldet bleibst und deine Einstellungen erhalten bleiben. Mit deiner Einwilligung kann „Zuschauen“ außerdem Livestream-Player von Twitch, YouTube und Kick laden, die eigene Cookies setzen. Du kannst das jederzeit unter Einstellungen → Privatsphäre ändern.',
    necessary: 'Nur notwendige',
    acceptAll: 'Alle akzeptieren',
    settings: 'Einstellungen und Cookie-Richtlinie',
  },
  prefs: {
    title: 'Cookies',
    necessary: 'Notwendig',
    necessaryDetail: 'Anmeldung, Sprache, Einstellungen und auf diesem Gerät gespeicherte Partien. Immer aktiv, weil die App ohne sie nicht funktioniert.',
    externalMedia: 'Externe Medien',
    externalMediaDetail: 'Livestream-Player von Twitch, YouTube und Kick unter „Zuschauen“. Sie setzen eigene Cookies.',
    externalMediaDetailApp: 'Gilt auf der ChessMate-Website. In der App öffnen sich Streams auf ihrer Plattform.',
    noTracking: 'ChessMate verwendet keine Analyse- oder Werbe-Cookies.',
    savedAt: 'Auswahl auf diesem Gerät gespeichert: {date}',
  },
  embed: {
    notice: 'Dieser Stream läuft im Player von {platform}. Er setzt Cookies und übermittelt deine IP-Adresse an {platform}. Erlaube externe Medien, um ihn hier zu sehen, oder tippe auf das Bild, um ihn auf {platform} zu öffnen.',
    load: 'Externe Medien erlauben',
    policy: 'Cookie-Richtlinie',
  },
};
