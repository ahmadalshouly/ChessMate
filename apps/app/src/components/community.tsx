import type { CommunityAuthor } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { formatAgo, useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Text, useAppTheme } from '@/ui';

/** Moderators and admins see the team tools (write news, pin, lock, remove). */
export function useStaff(): boolean {
  const { user } = useAuth();
  return user?.role === 'moderator' || user?.role === 'admin';
}

export function useSignedIn(): boolean {
  return useAuth().status === 'signedIn';
}

/** "Name · Team · 3h ago", the name opening their profile. */
export function AuthorLine({ author, at, extra }: { author: CommunityAuthor; at: number; extra?: ReactNode }) {
  const tr = useT();
  return (
    <View style={styles.authorLine}>
      <Pressable accessibilityRole="link" onPress={() => router.push(`/profile/${encodeURIComponent(author.username)}`)} hitSlop={6}>
        <Text variant="label">{author.displayName}</Text>
      </Pressable>
      {author.staff && <Badge tone="solid" label={tr('community.team')} />}
      <Text variant="caption" tone="tertiary">
        · {formatAgo(at)}
      </Text>
      {extra}
    </View>
  );
}

/**
 * Text box with a Send button for comments and replies. Signed out, it asks
 * to sign in instead. Clears itself after a successful send.
 */
export function Composer({
  placeholder,
  onSend,
  maxLength,
  disabledReason,
}: {
  placeholder: string;
  onSend: (text: string) => Promise<unknown>;
  maxLength: number;
  /** Shown instead of the box (locked topic, …). */
  disabledReason?: string | null;
}) {
  const c = useAppTheme().colors;
  const tr = useT();
  const signedIn = useSignedIn();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (disabledReason) {
    return (
      <Text tone="muted" style={{ paddingVertical: 8 }}>
        {disabledReason}
      </Text>
    );
  }
  if (!signedIn) {
    return (
      <View style={[styles.signIn, { borderColor: c.border }]}>
        <Text tone="muted" style={{ flex: 1 }}>
          {tr('community.signInToPost')}
        </Text>
        <Button size="sm" title={tr('auth.signIn')} onPress={() => router.push('/sign-in')} />
      </View>
    );
  }
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await onSend(text.trim());
      setText('');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 6 }}>
      <View style={[styles.composer, { borderColor: c.border, backgroundColor: c.surfaceSunken }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={c.textTertiary}
          multiline
          maxLength={maxLength}
          style={[styles.input, { color: c.text }]}
          accessibilityLabel={placeholder}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('community.send')}
          disabled={!text.trim() || busy}
          onPress={send}
          style={({ pressed }) => [styles.send, { backgroundColor: c.accent, opacity: !text.trim() || busy ? 0.4 : pressed ? 0.8 : 1 }]}>
          <Ionicons name="arrow-up" size={18} color={c.onAccent} />
        </Pressable>
      </View>
      {error && (
        <Text variant="caption" tone="danger">
          {serverText(error)}
        </Text>
      )}
    </View>
  );
}

/** One comment or reply, with a delete button for its author and staff. */
export function CommentItem({ author, body, at, canDelete, onDelete }: { author: CommunityAuthor; body: string; at: number; canDelete: boolean; onDelete: () => void }) {
  const c = useAppTheme().colors;
  const tr = useT();
  const [confirm, setConfirm] = useState(false);
  return (
    <View style={[styles.comment, { borderTopColor: c.border }]}>
      <AuthorLine
        author={author}
        at={at}
        extra={
          canDelete ? (
            <Pressable accessibilityRole="button" accessibilityLabel={tr('community.delete')} onPress={() => (confirm ? onDelete() : setConfirm(true))} hitSlop={8} style={{ marginStart: 'auto' }}>
              <Text variant="caption" tone={confirm ? 'danger' : 'tertiary'}>
                {confirm ? tr('community.confirmDelete') : tr('community.delete')}
              </Text>
            </Pressable>
          ) : undefined
        }
      />
      <Text selectable>{body}</Text>
    </View>
  );
}

/** A small icon + text action (Like, Pin, Lock…). */
export function Action({ icon, label, onPress, active, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; active?: boolean; danger?: boolean }) {
  const c = useAppTheme().colors;
  const fg = danger ? c.danger : active ? c.onAccent : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={({ pressed }) => [styles.action, { borderColor: danger ? c.danger : c.border, backgroundColor: active ? c.accent : pressed ? c.surfacePressed : 'transparent' }]}>
      <Ionicons name={icon} size={15} color={fg} />
      <Text variant="label" color={fg}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  authorLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  signIn: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 12 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, paddingStart: 14, paddingEnd: 6, paddingVertical: 6 },
  input: { flex: 1, minHeight: 36, maxHeight: 160, fontSize: 15, paddingVertical: 8 },
  send: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  comment: { gap: 6, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
});
