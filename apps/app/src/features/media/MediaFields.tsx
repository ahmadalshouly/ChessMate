import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { MEDIA_LIMITS, linkText, type PostLink } from '@chessmate/core';
import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';

import { useT } from '@/i18n';
import { PICTURE_MAX_CHARS, pickPicture } from '@/lib/pickLogo';
import { API_URL } from '@/lib/social/api';
import { Button, Row, Stack, Text, TextField, useAppTheme } from '@/ui';

/** A picture path from the server (relative) or a data URL being edited. */
export const pictureUri = (path: string | null | undefined) => (!path ? null : /^(https?:|data:)/.test(path) ? path : `${API_URL}${path}`);

/**
 * Choose, replace or remove a picture. `value`: a new data URL, null to
 * remove, undefined to keep `current` (the saved picture's path).
 */
export function ImageField({ label, current, value, onChange, onError }: { label: string; current: string | null; value: string | null | undefined; onChange: (v: string | null | undefined) => void; onError: (message: string) => void }) {
  const tr = useT();
  const shown = value === undefined ? pictureUri(current) : value;
  return (
    <Stack gap="sm">
      <Text variant="label" tone="muted">
        {label}
      </Text>
      {shown ? <PostImage uri={shown} /> : null}
      <Row gap="sm" wrap>
        <Button
          title={shown ? tr('media.replaceImage') : tr('media.addImage')}
          variant="secondary"
          size="sm"
          onPress={async () => {
            try {
              const url = await pickPicture();
              if (!url) return;
              if (url.length > PICTURE_MAX_CHARS) return onError(tr('media.imageTooBig'));
              onChange(url);
            } catch (e) {
              onError(e instanceof Error ? e.message : String(e));
            }
          }}
        />
        {shown ? <Button title={tr('media.removeImage')} variant="ghost" size="sm" onPress={() => onChange(null)} /> : null}
      </Row>
      <Text variant="caption" tone="muted">
        {tr('media.imageHint')}
      </Text>
    </Stack>
  );
}

/** Edit up to six links (text and address). */
export function LinksEditor({ value, onChange }: { value: PostLink[]; onChange: (v: PostLink[]) => void }) {
  const tr = useT();
  const t = useAppTheme();
  const set = (i: number, patch: Partial<PostLink>) => onChange(value.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <Stack gap="sm">
      <Text variant="label" tone="muted">
        {tr('media.links')}
      </Text>
      {value.map((l, i) => (
        <Row key={i} gap="sm">
          <TextField containerStyle={{ flex: 2 }} value={l.label} onChangeText={(label) => set(i, { label })} placeholder={tr('media.linkLabel')} maxLength={MEDIA_LIMITS.linkLabel} accessibilityLabel={tr('media.linkLabel')} />
          <TextField containerStyle={{ flex: 3 }} value={l.url} onChangeText={(url) => set(i, { url })} placeholder="https://" autoCapitalize="none" autoCorrect={false} keyboardType="url" accessibilityLabel={tr('media.linkUrl')} />
          <Pressable accessibilityRole="button" accessibilityLabel={tr('media.removeLink')} hitSlop={8} onPress={() => onChange(value.filter((_, j) => j !== i))}>
            <MaterialCommunityIcons name="close" size={20} color={t.colors.muted} />
          </Pressable>
        </Row>
      ))}
      {value.length < MEDIA_LIMITS.links && <Button title={tr('media.addLink')} variant="ghost" size="sm" onPress={() => onChange([...value, { label: '', url: '' }])} />}
    </Stack>
  );
}

/** Links that are filled in, for saving. */
export const filledLinks = (links: PostLink[]) => links.filter((l) => l.url.trim()).map((l) => ({ label: l.label.trim(), url: l.url.trim() }));

/** A picture at its own shape (wide pictures stay wide), up to a maximum height. */
export function PostImage({ uri, maxHeight = 420 }: { uri: string; maxHeight?: number }) {
  const t = useAppTheme();
  const [ratio, setRatio] = useState(16 / 9);
  useEffect(() => {
    let alive = true;
    Image.getSize(
      uri,
      (w, h) => alive && w > 0 && h > 0 && setRatio(Math.max(0.6, Math.min(3, w / h))),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [uri]);
  return (
    <View style={[styles.frame, { backgroundColor: t.colors.surfaceSunken, maxHeight, aspectRatio: ratio }]}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
    </View>
  );
}

/** Links as tappable chips that open in the browser. */
export function LinkList({ links }: { links: PostLink[] | undefined }) {
  const t = useAppTheme();
  if (!links?.length) return null;
  return (
    <Row gap="sm" wrap>
      {links.map((l) => (
        <Pressable
          key={l.url}
          accessibilityRole="link"
          accessibilityHint={l.url}
          onPress={() => void Linking.openURL(l.url).catch(() => {})}
          style={({ pressed }) => [styles.link, { borderColor: t.colors.border, opacity: pressed ? 0.7 : 1 }]}>
          <MaterialCommunityIcons name="open-in-new" size={14} color={t.colors.text} />
          <Text variant="label" numberOfLines={1}>
            {linkText(l)}
          </Text>
        </Pressable>
      ))}
    </Row>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', borderRadius: 16, overflow: 'hidden' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, maxWidth: 260 },
});
