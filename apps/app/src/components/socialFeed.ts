import type { FeedItem, SocialUser } from '@chessmate/core';

import { reasonText } from '@/components/play/GameOverCard';
import { translate, translateOr, type TKey } from '@/i18n';

type Person = { id: string; displayName: string };

/**
 * "{a} beat {b}" with the viewer's own name swapped for "You"/"you". Languages conjugate
 * differently for "you", so each verb has `you…` (viewer is the subject) and `…You`
 * (viewer is the object) variants.
 */
function feedSentence(verb: 'beat' | 'drew' | 'friends' | 'followed', a: Person, b: Person, meId: string | null): string {
  const key = (suffix: string) => `friends.feed.${verb}${suffix}` as TKey;
  if (a.id === meId) return translate(key('Subject'), { b: b.displayName });
  if (b.id === meId) return translate(key('Object'), { a: a.displayName });
  return translate(key(''), { a: a.displayName, b: b.displayName });
}

/** One activity line: whose avatar to show and the sentence ("You beat Sam by checkmate · Blitz, rated"). */
export function feedText(item: FeedItem, meId: string | null): { who: SocialUser; text: string } {
  let text: string;
  let who = item.kind === 'game' ? item.white : item.kind === 'friendship' ? item.a : item.follower;
  switch (item.kind) {
    case 'game': {
      const verdict =
        item.result === '1/2-1/2'
          ? feedSentence('drew', item.white, item.black, meId)
          : item.result === '1-0'
            ? feedSentence('beat', item.white, item.black, meId)
            : feedSentence('beat', item.black, item.white, meId);
      if (item.result === '0-1') who = item.black;
      const category = translateOr(`common.category.${item.category}`, item.category);
      text = `${verdict} ${reasonText(item.reason)} · ${item.rated ? translate('friends.feed.categoryRated', { category }) : category}`;
      break;
    }
    case 'friendship':
      text = feedSentence('friends', item.a, item.b, meId);
      break;
    case 'follow':
      text = feedSentence('followed', item.follower, item.followee, meId);
      break;
  }
  return { who, text };
}
