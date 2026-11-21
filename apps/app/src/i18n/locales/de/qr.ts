import type { Messages } from '../../core';
import type { qr as en } from '../en/qr';

export const qr: Messages<typeof en> = {
  addTitle: 'Per QR-Code hinzufügen',
  addBody: 'Zeig deinen Code oder öffne den eines Freundes.',
  scanHint: 'Mit der Handykamera scannen, um dieses Profil zu öffnen und als Freund hinzuzufügen.',
  share: 'Teilen',
  shareMessage: 'Füge {name} auf ChessMate hinzu',
  copied: 'Link kopiert',
  shareFailed: 'Link konnte nicht geteilt werden',
  shareProfile: 'Teilen',
  yourCode: 'Dein Code',
  signInForCode: 'Melde dich an, um deinen eigenen QR-Code zu bekommen.',
  theirCode: 'Code eines Freundes',
  theirCodeBody: 'Scanne den Code deines Freundes mit der Handykamera: Sein Profil öffnet sich mit „Freund hinzufügen“. Oder füge hier den Link aus seinem Code ein.',
  linkLabel: 'Profillink oder Benutzername',
  open: 'Profil öffnen',
  invalidLink: 'Das ist kein ChessMate-Profillink und kein Benutzername.',
};
