import { COLLECTION_NAME_MAX, type CollectionSummary } from '@chessmate/core';
import { router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { GameIcon } from '@/components/game/ActionBar';
import { useAccountSession } from '@/features/account/session';
import { useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { collectionsApi, type CollectableGame } from '@/lib/collectionsApi';
import { Button, ListGroup, ListRow, Switch, Text, TextField, useAppTheme, useToast } from '@/ui';

/**
 * "Add to collection", inside the Share sheet: your collections with a tick on
 * the ones that hold this game (tap to add or take it out), and a new
 * collection made with the game already in it.
 */
export function CollectionPicker({ game, onDone }: { game: CollectableGame; onDone: () => void }) {
  const tr = useT();
  const c = useAppTheme().colors;
  const toast = useToast();
  const here = usePathname();
  const { signedIn } = useAccountSession();
  const [list, setList] = useState<CollectionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const linkKey = JSON.stringify(game.link);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    collectionsApi.mine(game.link).then(
      (l) => {
        if (!live) return;
        setList(l);
        // Nothing yet: straight to naming the first one.
        if (l.length === 0) setCreating(true);
      },
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
    // The link is compared by value: a new object with the same game must not reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, linkKey]);

  if (!signedIn) {
    return (
      <View style={{ gap: 12 }}>
        <Text tone="muted">{tr('collections.signIn')}</Text>
        <Button
          title={tr('auth.signIn')}
          onPress={() => {
            onDone();
            router.push({ pathname: '/sign-in', params: { next: here } });
          }}
        />
      </View>
    );
  }
  if (error) return <Text tone="muted">{serverText(error)}</Text>;
  if (!list) return <ActivityIndicator style={{ marginVertical: 24 }} />;

  const toggle = async (col: CollectionSummary) => {
    setBusy(col.id);
    try {
      if (col.has) await collectionsApi.removeLink(col.id, game.link);
      else await collectionsApi.add(col.id, game);
      setList((l) => l?.map((x) => (x.id === col.id ? { ...x, has: !col.has, games: x.games + (col.has ? -1 : 1) } : x)) ?? l);
      toast.show({ title: tr(col.has ? 'collections.removedFrom' : 'collections.addedTo', { name: col.name }), tone: 'success', duration: 1800 });
    } catch (e) {
      toast.show({ title: serverText((e as Error).message), tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    setBusy('new');
    try {
      const made = await collectionsApi.create({ name, isPublic, item: game });
      setList((l) => [{ ...made, has: true }, ...(l ?? [])]);
      setCreating(false);
      setName('');
      setIsPublic(false);
      toast.show({ title: tr('collections.addedTo', { name: made.name }), tone: 'success', duration: 1800 });
    } catch (e) {
      toast.show({ title: serverText((e as Error).message), tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      {list.length > 0 && (
        <ListGroup>
          {list.map((col) => (
            <ListRow
              key={col.id}
              left={<GameIcon name={col.isPublic ? 'folder-account-outline' : 'folder-lock-outline'} size={20} color={c.muted} />}
              title={col.name}
              subtitle={`${tr('collections.gameCount', { count: col.games })} · ${tr(col.isPublic ? 'collections.onProfile' : 'collections.private')}`}
              right={
                busy === col.id ? (
                  <ActivityIndicator />
                ) : (
                  <GameIcon name={col.has ? 'check-circle' : 'plus-circle-outline'} size={24} color={col.has ? c.accent : c.textTertiary} />
                )
              }
              onPress={() => void toggle(col)}
              disabled={busy !== null}
            />
          ))}
        </ListGroup>
      )}
      {creating ? (
        <View style={{ gap: 12 }}>
          <TextField
            label={tr('collections.nameLabel')}
            placeholder={tr('collections.namePlaceholder')}
            value={name}
            onChangeText={setName}
            maxLength={COLLECTION_NAME_MAX}
            autoFocus={list.length > 0}
            returnKeyType="done"
            onSubmitEditing={() => name.trim() && void create()}
          />
          <ListGroup>
            <ListRow title={tr('collections.showOnProfile')} subtitle={tr('collections.showOnProfileBody')} right={<Switch value={isPublic} onValueChange={setIsPublic} />} />
          </ListGroup>
          <Button title={tr('collections.createAndAdd')} onPress={() => void create()} disabled={!name.trim() || busy !== null} loading={busy === 'new'} />
        </View>
      ) : (
        <ListGroup>
          <ListRow left={<GameIcon name="folder-plus-outline" size={20} color={c.text} />} title={tr('collections.new')} onPress={() => setCreating(true)} />
        </ListGroup>
      )}
      <Button
        variant="ghost"
        title={tr('collections.seeMine')}
        onPress={() => {
          onDone();
          router.push('/collections');
        }}
      />
    </View>
  );
}
