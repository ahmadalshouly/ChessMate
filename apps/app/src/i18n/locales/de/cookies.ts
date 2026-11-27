import type { Messages } from '../../core';
import type { cookies as en } from '../en/cookies';

export const cookies: Messages<typeof en> = {
  banner: {
    title: 'Cookies bei ChessMate',
    body: 'ChessMate speichert, was nötig ist, damit du angemeldet bleibst und deine Einstellungen erhalten bleiben. Mit deiner Einwilligung messen wir außerdem, wie ChessMate genutzt wird (Google Analytics und eigene Statistiken), um es zu verbessern, und Watch kann Livestream-Player von Twitch, YouTube und Kick laden, die eigene Cookies setzen. Du kannst das jederzeit unter Einstellungen → Datenschutz ändern.',
    bodyApp: 'ChessMate speichert, was nötig ist, damit du angemeldet bleibst und deine Einstellungen erhalten bleiben. Mit deiner Einwilligung messen wir außerdem, wie die App genutzt wird (Google Analytics und eigene Statistiken), um sie zu verbessern. Keine Werbung, kein App-übergreifendes Tracking. Du kannst das jederzeit unter Einstellungen → Datenschutz ändern.',
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
    analytics: 'Analyse',
    analyticsDetail: 'Welche Bildschirme und Funktionen genutzt werden, mit Google Analytics und eigenen Statistiken von ChessMate. Nie deine Nachrichten oder Züge, nie für Werbung.',
    noTracking: 'ChessMate verwendet keine Werbe-Cookies und kein Fingerprinting.',
    savedAt: 'Auswahl auf diesem Gerät gespeichert: {date}',
  },
  embed: {
    notice: 'Dieser Stream läuft im Player von {platform}. Er setzt Cookies und übermittelt deine IP-Adresse an {platform}. Erlaube externe Medien, um ihn hier zu sehen, oder tippe auf das Bild, um ihn auf {platform} zu öffnen.',
    load: 'Externe Medien erlauben',
    policy: 'Cookie-Richtlinie',
  },
};
