import type { AdminGameDetail, AdminGameSide } from '@chessmate/core';
import { Stack as RouterStack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { ActionDialog, ReasonField } from '@/features/admin/ActionDialog';
import { useAdmin } from '@/features/admin/AdminContext';
import { AdminPage, EmptyState, Field, Section, tcLabel, useLoad } from '@/features/admin/ui';
import { formatDateTime, translateOr, useT } from '@/i18n';
import { copyText } from '@/lib/share';
import { Badge, Button, Row, Stack, Text, useAppTheme, useToast } from '@/ui';

export default function AdminGame() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tr = useT();
  const toast = useToast();
  const { api, can } = useAdmin();
  const { data: g, loading, error, reload } = useLoad(() => api.game(String(id)), [api, id]);
  const [abort, setAbort] = useState(false);
  const [reason, setReason] = useState('');
  if (!g) {
    return (
      <AdminPage>
        <RouterStack.Screen options={{ title: tr('admin.nav.games'), headerShown: true }} />
        {loading ? <Text tone="muted">{tr('admin.common.loading')}</Text> : <EmptyState icon="grid-outline" title={tr('admin.games.notFound')} body={error ?? undefined} />}
      </AdminPage>
    );
  }
  const copyPgn = async () => {
    if (!g.pgn) return;
    if (await copyText(g.pgn)) toast.show({ title: tr('admin.common.copied'), tone: 'success' });
    else await Share.share({ message: g.pgn }).catch(() => undefined);
  };
  return (
    <AdminPage onRefresh={reload} refreshing={loading}>
      <RouterStack.Screen options={{ title: `${g.white.name} – ${g.black.name}`, headerShown: true }} />
      <Stack gap="md">
        <Row gap="sm" wrap>
          {g.live ? <Badge label={tr('admin.status.live')} tone="live" /> : <Badge label={g.result.replace('1/2', '½')} tone="solid" />}
          <Badge label={tcLabel(g)} tone="outline" />
          <Badge label={tr(g.rated ? 'admin.games.rated' : 'admin.games.casual')} />
          {g.endReason && <Badge label={translateOr(`admin.games.reasons.${g.endReason}`, g.endReason)} />}
          {g.live && <Badge label={tr('admin.games.spectators', { count: g.spectators })} />}
        </Row>
        <Row gap="md" wrap align="stretch">
          <SideCard side={g.white} color="w" />
          <SideCard side={g.black} color="b" />
        </Row>
        <Row gap="lg" wrap>
          <Field label="ID" value={g.id} mono />
          <Field label={tr('admin.games.played')} value={`${formatDateTime(g.startedAt)}${g.endedAt ? ` → ${formatDateTime(g.endedAt)}` : ''}`} />
          <Field label={tr('admin.games.moves')} value={tr('admin.games.ply', { count: g.plyCount })} />
        </Row>
        {g.live && can('games.abort') && (
          <Row>
            <Button variant="danger" size="sm" title={tr('admin.games.abort')} onPress={() => setAbort(true)} />
          </Row>
        )}
      </Stack>

      <Row gap="xl" wrap align="flex-start">
        <Stack gap="xl" style={{ flexGrow: 1, flexBasis: 380 }}>
          <Section title={tr('admin.games.moves')} index={1}>
            {g.moves.length === 0 ? <Text tone="muted">{tr('admin.games.noMoves')}</Text> : <MoveGrid moves={g.moves} />}
          </Section>
          {g.pgn && (
            <Section title={tr('admin.games.pgn')} index={2} action={<Button size="sm" variant="ghost" title={tr('admin.common.copy')} onPress={() => void copyPgn()} />}>
              <Text variant="mono" selectable tone="muted" style={{ fontSize: 12, lineHeight: 18 }}>
                {g.pgn}
              </Text>
            </Section>
          )}
        </Stack>
        <Stack gap="xl" style={{ flexGrow: 1, flexBasis: 300 }}>
          <Section title={tr('admin.games.chat')} index={g.pgn ? 3 : 2}>
            {g.chat.length === 0 ? (
              <Text tone="muted">{tr('admin.games.noChat')}</Text>
            ) : (
              <Stack gap="xxs">
                {g.chat.map((l) => (
                  <Text key={l.id} variant="caption">
                    <Text variant="caption" style={{ fontWeight: '600' }}>{`${l.name}: `}</Text>
                    {l.text}
                  </Text>
                ))}
              </Stack>
            )}
          </Section>
        </Stack>
      </Row>

      {abort && (
        <ActionDialog
          visible
          danger
          onClose={() => setAbort(false)}
          title={tr('admin.dialogs.abortTitle')}
          description={tr('admin.dialogs.abortBody')}
          confirmLabel={tr('admin.games.abort')}
          disabled={!reason.trim()}
          onConfirm={async () => {
            await api.abortGame(g.id, reason);
            reload();
          }}>
          <ReasonField required value={reason} onChange={setReason} />
        </ActionDialog>
      )}
    </AdminPage>
  );
}

function SideCard({ side, color }: { side: AdminGameSide; color: 'w' | 'b' }) {
  const { colors: c } = useAppTheme();
  const delta = side.ratingBefore !== null && side.ratingAfter !== null ? Math.round(side.ratingAfter - side.ratingBefore) : null;
  return (
    <Pressable
      disabled={!side.id}
      onPress={() => side.id && router.push(`/admin/players/${encodeURIComponent(side.id)}`)}
      style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.side, { borderColor: c.border, backgroundColor: hovered ? c.surfaceSunken : c.surface }]}>
      <View style={[styles.swatch, { backgroundColor: color === 'w' ? '#F4F4F4' : '#111', borderColor: c.borderStrong }]} />
      <Stack gap="xxs" style={{ flex: 1 }}>
        <Text variant="bodyStrong">{side.name}</Text>
        <Text variant="numeric" tone="muted">
          {[side.ratingBefore !== null ? Math.round(side.ratingBefore) : null, delta !== null ? `${delta >= 0 ? '+' : ''}${delta}` : null, side.accuracy !== null ? `${side.accuracy.toFixed(1)}%` : null].filter((x) => x !== null).join(' · ') || '–'}
        </Text>
      </Stack>
    </Pressable>
  );
}

function MoveGrid({ moves }: { moves: AdminGameDetail['moves'] }) {
  const rows: [number, string, string | undefined][] = [];
  for (let i = 0; i < moves.length; i += 2) rows.push([i / 2 + 1, moves[i]!, moves[i + 1]]);
  return (
    <View style={[styles.moves, { direction: 'ltr' } as never]}>
      {rows.map(([n, w, b]) => (
        <View key={n} style={styles.moveRow}>
          <Text variant="mono" tone="tertiary" style={{ width: 34 }}>{`${n}.`}</Text>
          <Text variant="mono" style={{ width: 64 }}>
            {w}
          </Text>
          <Text variant="mono" style={{ width: 64 }}>
            {b ?? ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  side: { flexGrow: 1, flexBasis: 220, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 14 },
  swatch: { width: 18, height: 18, borderRadius: 5, borderWidth: StyleSheet.hairlineWidth },
  moves: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18 },
  moveRow: { flexDirection: 'row', width: 170, paddingVertical: 2 },
});
