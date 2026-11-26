import type { CollectionSummary } from '@chessmate/core';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { GameIcon } from '@/components/game/ActionBar';
import { useT } from '@/i18n';
import { collectionsApi } from '@/lib/collectionsApi';
import { Button, GlassView, ListGroup, ListRow, SectionHeader, Stack, Text, useAppTheme } from '@/ui';

const SHOWN = 5;

/**
 * Profile card: the collections a player shows on their profile. On your own
 * profile it lists all of yours (private ones marked) with a way to manage them.
 */
export function ProfileCollections({ userId, username, name, isMe }: { userId: string; username: string; name: string; isMe: boolean }) {
  const tr = useT();
  const c = useAppTheme().colors;
  const [list, setList] = useState<CollectionSummary[] | null>(null);

  useEffect(() => {
    let live = true;
    (isMe ? collectionsApi.mine() : collectionsApi.of(userId)).then(
      (l) => live && setList(l),
      // An older server without collections: no card.
      () => live && setList([]),
    );
    return () => {
      live = false;
    };
  }, [userId, isMe]);

  if (!list || (!isMe && list.length === 0)) return null;
  const seeAll = () => router.push({ pathname: '/collections', params: isMe ? {} : { user: username } });

  return (
    <Stack gap="sm">
      <SectionHeader
        title={tr('collections.title')}
        action={isMe || list.length > SHOWN ? <Button title={isMe ? tr('collections.manage') : tr('collections.seeAll')} variant="ghost" size="sm" onPress={seeAll} /> : undefined}
      />
      {list.length === 0 ? (
        <GlassView radius="lg" padding="lg">
          <Text tone="muted">{tr('collections.profileEmpty')}</Text>
        </GlassView>
      ) : (
        <ListGroup>
          {list.slice(0, SHOWN).map((col) => (
            <ListRow
              key={col.id}
              left={<GameIcon name={col.isPublic ? 'folder-account-outline' : 'folder-lock-outline'} size={22} color={c.muted} />}
              title={col.name}
              subtitle={[tr('collections.gameCount', { count: col.games }), isMe && !col.isPublic ? tr('collections.private') : null, col.description].filter(Boolean).join(' · ')}
              onPress={() => router.push({ pathname: '/collections/[id]', params: { id: col.id } })}
              chevron
            />
          ))}
        </ListGroup>
      )}
      {!isMe && <Text variant="caption" tone="tertiary" style={{ paddingHorizontal: 4 }}>{tr('collections.ofHint', { name })}</Text>}
    </Stack>
  );
}
