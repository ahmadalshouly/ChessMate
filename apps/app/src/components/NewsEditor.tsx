import { COMMUNITY_LIMITS, type NewsPostView } from '@chessmate/core';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { useT } from '@/i18n';
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTitle(post?.title ?? '');
    setBody(post?.body ?? '');
    setPinned(post?.pinned ?? false);
    setError(null);
  }, [visible, post]);

  const save = async () => {
    setBusy(true);
    try {
      const r = post ? await newsApi.edit(post.id, { title, body, pinned }) : await newsApi.write({ title, body, pinned });
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
