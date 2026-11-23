import Ionicons from '@expo/vector-icons/Ionicons';
import type { AdminTitleApplication, TitleDocument, TitleDocumentLink } from '@chessmate/core';
import { Stack as RouterStack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';

import { ActionDialog, ReasonField } from '@/features/admin/ActionDialog';
import { useAdmin } from '@/features/admin/AdminContext';
import { AdminPage, EmptyState, ErrorLine, Field, Section, useLoad } from '@/features/admin/ui';
import { TITLE_STATUS_TONE, TitleBadge } from '@/features/titles/TitleBadge';
import { formatAgo, formatDateTime, useT } from '@/i18n';
import { Badge, Button, Row, Stack, Text, useAppTheme, useToast } from '@/ui';

type Dialog = 'approve' | 'reject' | null;

const size = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function AdminTitleApplicationPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tr = useT();
  const { api, can } = useAdmin();
  const { data: a, loading, error, reload } = useLoad(() => api.titleApplication(String(id)), [api, id]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [note, setNote] = useState('');
  if (!a) {
    return (
      <AdminPage>
        <RouterStack.Screen options={{ title: tr('admin.nav.titles'), headerShown: true }} />
        {loading ? <Text tone="muted">{tr('admin.common.loading')}</Text> : <EmptyState icon="ribbon-outline" title={tr('admin.titles.empty')} body={error ?? undefined} />}
      </AdminPage>
    );
  }
  const done = async (fn: () => Promise<unknown>) => {
    await fn();
    setNote('');
    reload();
  };
  const pending = a.status === 'pending';
  return (
    <AdminPage onRefresh={reload} refreshing={loading}>
      <RouterStack.Screen options={{ title: `${a.title} · ${a.username}`, headerShown: true }} />
      <Stack gap="sm">
        <Row gap="md" wrap>
          <TitleBadge title={a.title} size="md" />
          <Text variant="title">{a.username}</Text>
          <Badge label={tr(`admin.titles.tabs.${a.status}`)} tone={TITLE_STATUS_TONE[a.status]} />
        </Row>
        <Text variant="caption" tone="muted">
          {tr(`chessTitle.names.${a.title}`)} · {tr('admin.titles.applied', { when: formatAgo(a.createdAt) })}
        </Text>
        {a.playerClosed && <ErrorLine message={tr('admin.titles.closedWarn')} />}
        {a.fairPlay !== 'none' && a.fairPlay !== 'dismissed' && <ErrorLine message={tr('admin.titles.fairPlayWarn', { status: tr(`admin.fairplay.tabs.${a.fairPlay}`) })} />}
        {pending && a.currentTitle && <Text tone="warning">{tr('admin.titles.replaces', { title: a.currentTitle })}</Text>}
      </Stack>

      <Section title={tr('admin.fairplay.verdict')} index={1}>
        <Stack gap="sm">
          {a.reviewedAt && (
            <Stack gap="xxs">
              <Text>{tr('admin.titles.reviewedBy', { by: a.reviewedBy ?? '–', when: formatDateTime(a.reviewedAt) })}</Text>
              {a.reviewNote ? <Text tone="muted">{a.reviewNote}</Text> : null}
            </Stack>
          )}
          <Row gap="sm" wrap>
            {pending && can('titles.review') && <Button size="sm" title={tr('admin.titles.approve')} disabled={a.playerClosed} onPress={() => setDialog('approve')} />}
            {pending && can('titles.review') && <Button size="sm" variant="danger" title={tr('admin.titles.reject')} onPress={() => setDialog('reject')} />}
            <Button size="sm" variant="ghost" title={tr('admin.reports.openPlayer')} onPress={() => router.push(`/admin/players/${encodeURIComponent(a.userId)}`)} />
          </Row>
        </Stack>
      </Section>

      <Section title={tr('admin.titles.applicant')} index={2}>
        <Stack gap="md">
          <Row gap="lg" wrap align="flex-start">
            <Field label={tr('admin.titles.fullName')} value={a.fullName} />
            <Field label={tr('admin.titles.fideId')} value={a.fideId ?? '–'} mono />
            <Field label={tr('admin.titles.federation')} value={a.federation ?? '–'} />
            <Field label={tr('admin.titles.current')} value={a.currentTitle ?? tr('admin.titles.none')} />
          </Row>
          {a.note ? (
            <Stack gap="xxs">
              <Text variant="overline" tone="tertiary">
                {tr('admin.titles.note')}
              </Text>
              <Text>{a.note}</Text>
            </Stack>
          ) : null}
          {a.fideId ? (
            <Row>
              <Button size="sm" variant="secondary" title={tr('admin.titles.openFide')} onPress={() => void Linking.openURL(`https://ratings.fide.com/profile/${a.fideId}`)} />
            </Row>
          ) : null}
        </Stack>
      </Section>

      <Section title={tr('admin.titles.documents')} index={3} padding="none">
        <Documents app={a} />
      </Section>

      {a.history.length > 0 && (
        <Section title={tr('admin.titles.history')} index={4} padding="none">
          {a.history.map((h, i) => (
            <Pressable
              key={h.id}
              onPress={() => router.push(`/admin/titles/${encodeURIComponent(h.id)}`)}
              style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.histRow, i > 0 && styles.divider, hovered && { opacity: 0.8 }]}>
              <TitleBadge title={h.title} />
              <Text style={{ flex: 1 }} tone="muted">
                {[formatDateTime(h.createdAt), h.reviewNote].filter(Boolean).join(' · ')}
              </Text>
              <Badge label={tr(`admin.titles.tabs.${h.status}`)} tone={TITLE_STATUS_TONE[h.status]} />
            </Pressable>
          ))}
        </Section>
      )}

      {dialog === 'approve' && (
        <ActionDialog
          visible
          onClose={() => setDialog(null)}
          title={tr('admin.titles.approveTitle', { title: a.title, name: a.username })}
          description={tr('admin.titles.approveBody')}
          confirmLabel={tr('admin.titles.approve')}
          onConfirm={() => done(() => api.approveTitle(a.id, note))}>
          <ReasonField value={note} onChange={setNote} />
        </ActionDialog>
      )}
      {dialog === 'reject' && (
        <ActionDialog
          visible
          danger
          onClose={() => setDialog(null)}
          title={tr('admin.titles.rejectTitle')}
          description={tr('admin.titles.rejectBody')}
          confirmLabel={tr('admin.titles.reject')}
          disabled={!note.trim()}
          onConfirm={() => done(() => api.rejectTitle(a.id, note))}>
          <ReasonField required label={tr('admin.titles.rejectReason')} value={note} onChange={setNote} multiline />
        </ActionDialog>
      )}
    </AdminPage>
  );
}

/**
 * Proof files. Signed links are fetched up front so "Open" can open a tab
 * straight from the click (browsers block pop-ups opened after an await),
 * and images get an inline preview.
 */
function Documents({ app }: { app: AdminTitleApplication }) {
  const { api } = useAdmin();
  const [links, setLinks] = useState<Record<string, TitleDocumentLink>>({});
  const [error, setError] = useState<string | null>(null);
  const tr = useT();
  useEffect(() => {
    let live = true;
    Promise.all(app.documents.map(async (d) => [d.id, await api.documentLink(d.id)] as const))
      .then((pairs) => live && setLinks(Object.fromEntries(pairs)))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [api, app.documents]);
  if (app.documents.length === 0) return <EmptyState icon="document-outline" title={tr('admin.common.none')} />;
  return (
    <Stack gap="none">
      {error ? (
        <View style={{ padding: 16 }}>
          <ErrorLine message={error} />
        </View>
      ) : null}
      {app.documents.map((d, i) => (
        <DocumentRow key={d.id} d={d} link={links[d.id]} first={i === 0} />
      ))}
    </Stack>
  );
}

function DocumentRow({ d, link, first }: { d: TitleDocument; link: TitleDocumentLink | undefined; first: boolean }) {
  const { colors: c } = useAppTheme();
  const tr = useT();
  const toast = useToast();
  const { api } = useAdmin();
  const image = d.mime.startsWith('image/');
  const open = async () => {
    try {
      const l = link && link.expiresAt > Date.now() + 5_000 ? link : await api.documentLink(d.id);
      await Linking.openURL(l.url);
    } catch {
      toast.show({ title: tr('admin.titles.linkFailed'), tone: 'danger' });
    }
  };
  return (
    <Stack gap="sm" style={[styles.doc, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
      <Row gap="sm">
        <Ionicons name={image ? 'image-outline' : 'document-text-outline'} size={18} color={c.muted} />
        <Text style={{ flex: 1 }} numberOfLines={1}>
          {d.name}
        </Text>
        <Text variant="caption" tone="tertiary">
          {`${d.mime.split('/')[1]?.toUpperCase()} · ${size(d.size)}`}
        </Text>
        <Button size="sm" variant="secondary" title={tr('admin.titles.open')} onPress={() => void open()} />
      </Row>
      {image && link ? (
        <Pressable onPress={() => void open()} accessibilityRole="imagebutton" accessibilityLabel={d.name}>
          <Image source={{ uri: link.url }} resizeMode="contain" style={[styles.preview, { backgroundColor: c.surfaceSunken, borderColor: c.border }]} />
        </Pressable>
      ) : null}
    </Stack>
  );
}

const styles = StyleSheet.create({
  doc: { paddingHorizontal: 16, paddingVertical: 14 },
  preview: { width: '100%', height: 280, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(127,127,127,0.25)' },
});
