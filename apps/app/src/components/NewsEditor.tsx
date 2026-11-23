import { COMMUNITY_LIMITS, type NewsPostView } from '@chessmate/core';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { useT } from '@/i18n';
import { ImageField, LinksEditor, filledLinks } from '@/features/media/MediaFields';
import { serverText } from '@/i18n/serverMessages';
import { newsApi } from '@/lib/communityApi';
import { Button, Modal, Switch, Text, TextField, useAppTheme } from '@/ui';

/** Staff: write a news post, or edit one when `post` is given. */
export function NewsEditor({ visible, onClose, post, onSaved }: { visible: boolean; onClose: () => void; post?: NewsPostView | null; onSaved: (p: NewsPostView) => void }) {
  const tr = useT();
  const c = useAppTheme().colors;
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  // undefined keeps the saved picture, null removes it.
  const [image, setImage] = useState<string | null | undefined>(undefined);
  const [links, setLinks] = useState<{ label: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTitle(post?.title ?? '');
    setBody(post?.body ?? '');
    setPinned(post?.pinned ?? false);
    setImage(undefined);
    setLinks(post?.links ?? []);
    setError(null);
  }, [visible, post]);

  const save = async () => {
    setBusy(true);
    try {
      const extra = { links: filledLinks(links), ...(image !== undefined ? { image } : {}) };
      const r = post ? await newsApi.edit(post.id, { title, body, pinned, ...extra }) : await newsApi.write({ title, body, pinned, ...extra });
      onSaved(r.post);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      presentation="sheet"
      title={post ? tr('news.editTitle') : tr('news.writeTitle')}
      actions={
        <>
          <Button variant="ghost" title={tr('common.cancel')} onPress={onClose} />
          <Button title={post ? tr('news.save') : tr('news.publish')} onPress={save} loading={busy} disabled={!title.trim() || !body.trim()} />
        </>
      }>
      <View style={{ gap: 14 }}>
        <TextField label={tr('news.titleLabel')} value={title} onChangeText={setTitle} maxLength={COMMUNITY_LIMITS.titleMax} />
        <View style={{ gap: 6 }}>
          <Text variant="label" tone="muted">
            {tr('news.bodyLabel')}
          </Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={COMMUNITY_LIMITS.postBodyMax}
            style={[styles.body, { color: c.text, borderColor: c.border, backgroundColor: c.surfaceSunken }]}
            accessibilityLabel={tr('news.bodyLabel')}
          />
        </View>
        <ImageField label={tr('media.image')} current={post?.imagePath ?? null} value={image} onChange={setImage} onError={setError} />
        <LinksEditor value={links} onChange={setLinks} />
        <View style={styles.row}>
          <Text style={{ flex: 1 }}>{tr('news.pin')}</Text>
          <Switch value={pinned} onValueChange={setPinned} accessibilityLabel={tr('news.pin')} />
        </View>
        {error && (
          <Text variant="caption" tone="danger">
            {serverText(error)}
          </Text>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { minHeight: 200, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 12, fontSize: 15, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
