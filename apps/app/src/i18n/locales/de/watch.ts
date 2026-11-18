import type { Messages } from '../../core';
import type { watch as en } from '../en/watch';

export const watch: Messages<typeof en> = {
  byAbandonment: 'durch Verlassen',
  aborted: '(abgebrochen)',
  title: '{white} gegen {black}',
  watch: 'Zuschauen',
  ended: 'Diese Partie ist beendet oder existiert nicht.',
  couldNotOpen: 'Diese Partie konnte nicht geöffnet werden.',
  live: { one: 'Live · {count} schaut zu', other: 'Live · {count} schauen zu' },
};
