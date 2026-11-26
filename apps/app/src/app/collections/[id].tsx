import { COLLECTION_DESCRIPTION_MAX, COLLECTION_NAME_MAX, collectionPgn, pathWithQuery, type CollectionItem, type GameCollection } from '@chessmate/core';
import { Stack as RouterStack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { GameIcon } from '@/components/game/ActionBar';
import { formatAgo, useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { collectionsApi } from '@/lib/collectionsApi';
import { appLink, shareLink } from '@/lib/links';
import { copyText } from '@/lib/share';
import { Button, GlassView, ListGroup, ListRow, Modal, Row, Screen, Skeleton, Stack, Switch, Text, TextField, useAppTheme, useToast } from '@/ui';

const open = (item: CollectionItem) => router.push(pathWithQuery(item.link) as never);

/** One collection: its games (tap to open), and for the owner, edit, show on profile, remove games, delete. */
export default function CollectionScreen() {
  const tr = useT();
  const t = useAppTheme();
  const c = t.colors;
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [col, setCol] = useState<GameCollection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', description: '' });

  const load = useCallback(() => {
    collectionsApi.get(String(id)).then(
      (got) => {
        setError(null);
        setCol(got);
      },
      (e: Error) => setError(e.message),
    );
  }, [id]);
  useEffect(load, [load]);

  const fail = (e: unknown) => toast.show({ title: serverText((e as Error).message), tone: 'danger' });

  const setPublic = async (isPublic: boolean) => {
    if (!col) return;
    setCol({ ...col, isPublic });
    try {
      setCol(await collectionsApi.update(col.id, { isPublic }));
    } catch (e) {
      setCol({ ...col });
      fail(e);
    }
  };

  const save = async () => {
    if (!col) return;
    setBusy('save');
    try {
      setCol(await collectionsApi.update(col.id, { name: draft.name, description: draft.description }));
      setEditing(false);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const removeItem = async (item: CollectionItem) => {
    if (!col) return;
    setBusy(item.id);
    try {
      await collectionsApi.removeItem(col.id, item.id);
      setCol({ ...col, items: col.items.filter((i) => i.id !== item.id), games: col.games - 1 });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const destroy = async () => {
    if (!col) return;
    setBusy('delete');
    try {
      await collectionsApi.remove(col.id);
      setConfirmDelete(false);
      toast.show({ title: tr('collections.deleted', { name: col.name }), tone: 'success', duration: 1800 });
      if (router.canGoBack()) router.back();
      else router.replace('/collections');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const copyAll = async () => {
    if (!col) return;
    if (await copyText(collectionPgn(col.items))) toast.show({ title: tr('collections.pgnCopied'), tone: 'success', duration: 2000 });
    else fail(new Error(tr('share.failed')));
  };

  const share = async () => {
    if (!col) return;
    const r = await shareLink(appLink({ path: `/collections/${encodeURIComponent(col.id)}` }), tr('collections.shareMessage', { name: col.name }));
    if (r === 'copied') toast.show({ title: tr('share.linkCopied'), tone: 'success', duration: 2000 });
    else if (r === 'failed') fail(new Error(tr('share.failed')));
  };

  if (error) {
    return (
      <Screen scroll>
        <RouterStack.Screen options={{ title: tr('collections.title') }} />
        <GlassView padding="lg" radius="xl" style={{ gap: 12, alignItems: 'flex-start' }}>
          <Text tone="muted">{serverText(error)}</Text>
          <Button variant="secondary" title={tr('common.tryAgain')} onPress={load} />
        </GlassView>
      </Screen>
    );
  }
  if (!col) {
    return (
      <Screen scroll>
        <RouterStack.Screen options={{ title: tr('collections.title') }} />
        <Skeleton height={200} radius={24} />
      </Screen>
    );
  }

  const withPgn = col.items.filter((i) => i.pgn).length;

  return (
    <Screen scroll>
      <RouterStack.Screen options={{ title: col.name }} />
      <GlassView padding="lg" radius="xl" style={{ gap: 12 }}>
        <Text variant="title">{col.name}</Text>
        {col.owner && !col.isMine ? (
          <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/profile/[username]', params: { username: col.owner!.username } })}>
            <Text tone="muted">{tr('collections.by', { name: col.owner.displayName })}</Text>
          </Pressable>
        ) : null}
        {col.description ? <Text>{col.description}</Text> : null}
        <Text variant="caption" tone="muted">
          {tr('collections.gameCount', { count: col.games })} · {formatAgo(col.updatedAt)}
        </Text>
        <Row gap="sm" wrap>
          {col.isPublic && <Button size="sm" variant="secondary" title={tr('share.shareLink')} onPress={() => void share()} />}
          {withPgn > 0 && <Button size="sm" variant="secondary" title={tr('collections.copyAllPgn')} onPress={() => void copyAll()} />}
          {col.isMine && (
            <Button
              size="sm"
              variant="ghost"
              title={tr('collections.edit')}
              onPress={() => {
                setDraft({ name: col.name, description: col.description ?? '' });
                setEditing(true);
              }}
            />
          )}
        </Row>
      </GlassView>

      {col.isMine && (
        <ListGroup>
          <ListRow title={tr('collections.showOnProfile')} subtitle={tr('collections.showOnProfileBody')} right={<Switch value={col.isPublic} onValueChange={(v) => void setPublic(v)} />} />
        </ListGroup>
      )}

      <Stack gap="sm">
        {col.items.length === 0 ? (
          <GlassView padding="lg" radius="xl">
            <Text tone="muted">{col.isMine ? tr('collections.emptyMine') : tr('collections.empty')}</Text>
          </GlassView>
        ) : (
          <ListGroup>
            {col.items.map((item) => (
              // The remove button sits beside the row, not inside it: a button inside a button is invalid on the web.
              <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <ListRow
                    left={<GameIcon name={item.link.path.startsWith('/analysis') ? 'magnify' : 'chess-knight'} size={20} color={c.muted} />}
                    title={item.title}
                    subtitle={tr('collections.added', { ago: formatAgo(item.addedAt) })}
                    onPress={() => open(item)}
                    chevron={!col.isMine}
                  />
                </View>
                {col.isMine &&
                  (busy === item.id ? (
                    <ActivityIndicator style={{ marginEnd: 16 }} />
                  ) : (
                    <Pressable accessibilityRole="button" accessibilityLabel={tr('collections.removeGame')} hitSlop={10} onPress={() => void removeItem(item)} style={{ paddingHorizontal: 14 }}>
                      <GameIcon name="close-circle-outline" size={22} color={c.textTertiary} />
                    </Pressable>
                  ))}
              </View>
            ))}
          </ListGroup>
        )}
        {col.isMine && (
          <Text variant="caption" tone="tertiary" style={{ paddingHorizontal: 4 }}>
            {tr('collections.addHint')}
          </Text>
        )}
      </Stack>

      {col.isMine && (
        <View style={{ alignItems: 'flex-start' }}>
          <Button variant="danger" size="sm" title={tr('collections.delete')} onPress={() => setConfirmDelete(true)} />
        </View>
      )}

      <Modal
        visible={editing}
        onClose={() => setEditing(false)}
        title={tr('collections.edit')}
        actions={
          <>
            <Button variant="ghost" title={tr('common.cancel')} onPress={() => setEditing(false)} />
            <Button title={tr('collections.save')} onPress={() => void save()} disabled={!draft.name.trim()} loading={busy === 'save'} />
          </>
        }>
        <View style={{ gap: 12 }}>
          <TextField label={tr('collections.nameLabel')} value={draft.name} onChangeText={(name) => setDraft((d) => ({ ...d, name }))} maxLength={COLLECTION_NAME_MAX} />
          <TextField
            label={tr('collections.descriptionLabel')}
            placeholder={tr('collections.descriptionPlaceholder')}
            value={draft.description}
            onChangeText={(description) => setDraft((d) => ({ ...d, description }))}
            maxLength={COLLECTION_DESCRIPTION_MAX}
            multiline
          />
        </View>
      </Modal>

      <Modal
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={tr('collections.deleteTitle', { name: col.name })}
        description={tr('collections.deleteBody')}
        actions={
          <>
            <Button variant="ghost" title={tr('common.cancel')} onPress={() => setConfirmDelete(false)} />
            <Button variant="danger" title={tr('collections.delete')} onPress={() => void destroy()} loading={busy === 'delete'} />
          </>
        }
      />
    </Screen>
  );
}
