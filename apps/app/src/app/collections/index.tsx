import { COLLECTION_NAME_MAX, type CollectionSummary } from '@chessmate/core';
import { Stack as RouterStack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { GameIcon } from '@/components/game/ActionBar';
import { useAccountSession } from '@/features/account/session';
import { formatAgo, useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { collectionsApi } from '@/lib/collectionsApi';
import { useSocialIdentity } from '@/lib/social/session';
import { Button, GlassView, ListGroup, ListRow, Modal, Screen, Skeleton, Stack, Switch, Text, TextField, useAppTheme, useToast } from '@/ui';

/** Your game collections, or another player's shown ones (?user=<username>). */
export default function CollectionsScreen() {
  const tr = useT();
  const c = useAppTheme().colors;
  const toast = useToast();
  const params = useLocalSearchParams<{ user?: string }>();
  const me = useSocialIdentity();
  const { signedIn } = useAccountSession();
  const user = params.user ? String(params.user) : null;
  const own = !user || user === me?.userId || user === me?.name;
  const [list, setList] = useState<CollectionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (own && !signedIn) return;
    setError(null);
    (own ? collectionsApi.mine() : collectionsApi.of(user!)).then(setList, (e: Error) => setError(e.message));
  }, [own, signedIn, user]);
  // Back from a collection (renamed, emptied, deleted): load again.
  useFocusEffect(load);

  const create = async () => {
    setBusy(true);
    try {
      const made = await collectionsApi.create({ name, isPublic });
      setCreating(false);
      setName('');
      setIsPublic(false);
      router.push({ pathname: '/collections/[id]', params: { id: made.id } });
    } catch (e) {
      toast.show({ title: serverText((e as Error).message), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <RouterStack.Screen options={{ title: own ? tr('collections.mine') : tr('collections.of', { name: user ?? '' }) }} />
      {own && !signedIn ? (
        <GlassView padding="lg" radius="xl" style={{ gap: 12 }}>
          <Text tone="muted">{tr('collections.signIn')}</Text>
          <Button title={tr('auth.signIn')} onPress={() => router.push({ pathname: '/sign-in', params: { next: '/collections' } })} />
        </GlassView>
      ) : error ? (
        <GlassView padding="lg" radius="xl" style={{ gap: 12, alignItems: 'flex-start' }}>
          <Text tone="muted">{serverText(error)}</Text>
          <Button variant="secondary" title={tr('common.tryAgain')} onPress={load} />
        </GlassView>
      ) : !list ? (
        <Skeleton height={160} radius={24} />
      ) : (
        <Stack gap="md">
          {own && <Text tone="muted">{tr('collections.intro')}</Text>}
          {list.length === 0 ? (
            <GlassView padding="lg" radius="xl">
              <Text tone="muted">{own ? tr('collections.noneYet') : tr('collections.noneShown', { name: user ?? '' })}</Text>
            </GlassView>
          ) : (
            <ListGroup>
              {list.map((col) => (
                <ListRow
                  key={col.id}
                  left={<GameIcon name={col.isPublic ? 'folder-account-outline' : 'folder-lock-outline'} size={22} color={c.muted} />}
                  title={col.name}
                  subtitle={[tr('collections.gameCount', { count: col.games }), own ? tr(col.isPublic ? 'collections.onProfile' : 'collections.private') : null, formatAgo(col.updatedAt)]
                    .filter(Boolean)
                    .join(' · ')}
                  onPress={() => router.push({ pathname: '/collections/[id]', params: { id: col.id } })}
                  chevron
                />
              ))}
            </ListGroup>
          )}
          {own && <Button title={tr('collections.new')} leftIcon={<GameIcon name="folder-plus-outline" size={18} color={c.onAccent} />} onPress={() => setCreating(true)} />}
        </Stack>
      )}
      <Modal
        visible={creating}
        onClose={() => setCreating(false)}
        title={tr('collections.new')}
        actions={
          <>
            <Button variant="ghost" title={tr('common.cancel')} onPress={() => setCreating(false)} />
            <Button title={tr('collections.create')} onPress={() => void create()} disabled={!name.trim()} loading={busy} />
          </>
        }>
        <View style={{ gap: 12 }}>
          <TextField label={tr('collections.nameLabel')} placeholder={tr('collections.namePlaceholder')} value={name} onChangeText={setName} maxLength={COLLECTION_NAME_MAX} autoFocus />
          <ListGroup>
            <ListRow title={tr('collections.showOnProfile')} subtitle={tr('collections.showOnProfileBody')} right={<Switch value={isPublic} onValueChange={setIsPublic} />} />
          </ListGroup>
        </View>
      </Modal>
    </Screen>
  );
}
