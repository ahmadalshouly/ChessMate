import Ionicons from '@expo/vector-icons/Ionicons';
import { CHESS_TITLES, MAX_TITLE_DOCS, validateTitleApplication, type ChessTitle, type MyTitleState, type TitleApplication } from '@chessmate/core';
import { Stack as RouterStack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatDate, useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useTitlesApi } from '@/lib/titlesApi';
import { Badge, Button, Card, Chip, Divider, Row, Screen, Stack, Text, TextField, useAppTheme, useToast } from '@/ui';

import { pickProof, type PickedProof } from './pickProof';
import { TITLE_STATUS_TONE, TitleBadge } from './TitleBadge';

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Settings → Verified title: see your title, apply with proof, follow the review. */
export function TitleScreen() {
  const tr = useT();
  const { status } = useAuth();
  const api = useTitlesApi();
  const [state, setState] = useState<MyTitleState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(() => {
    api
      .mine()
      .then((s) => (setState(s), setLoadError(null)))
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, [api]);
  useEffect(() => {
    if (status === 'signedIn') reload();
  }, [status, reload]);

  const pending = state?.applications.find((a) => a.status === 'pending') ?? null;
  const past = state?.applications.filter((a) => a.status !== 'pending') ?? [];

  return (
    <Screen scroll gap="lg">
      <RouterStack.Screen options={{ title: tr('chessTitle.screen') }} />
      {status !== 'signedIn' ? (
        <Card>
          <Text tone="muted">{tr('chessTitle.signIn')}</Text>
        </Card>
      ) : !state ? (
        <Card>
          <Text tone={loadError ? 'danger' : 'muted'}>{loadError ?? tr('common.loading')}</Text>
        </Card>
      ) : (
        <>
          <CurrentTitle state={state} />
          {pending ? <PendingCard app={pending} onChange={reload} /> : <ApplyForm current={state.title} onSent={reload} />}
          {past.length > 0 && (
            <Card title={tr('chessTitle.history')} gap="sm">
              {past.map((a, i) => (
                <View key={a.id}>
                  {i > 0 && <Divider />}
                  <HistoryRow app={a} />
                </View>
              ))}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

function CurrentTitle({ state }: { state: MyTitleState }) {
  const tr = useT();
  return (
    <Card gap="sm">
      <Text variant="overline" tone="tertiary">
        {tr('chessTitle.current')}
      </Text>
      {state.title ? (
        <Row gap="md">
          <TitleBadge title={state.title} size="md" />
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="bodyStrong">{tr(`chessTitle.names.${state.title}`)}</Text>
            {state.grantedAt && (
              <Text variant="caption" tone="muted">
                {tr('chessTitle.since', { date: formatDate(state.grantedAt, { day: 'numeric', month: 'long', year: 'numeric' }) })}
              </Text>
            )}
          </Stack>
        </Row>
      ) : (
        <Text tone="muted">{tr('chessTitle.none')}</Text>
      )}
      {!state.title && (
        <Text variant="caption" tone="muted">
          {tr('chessTitle.intro')}
        </Text>
      )}
    </Card>
  );
}

function PendingCard({ app, onChange }: { app: TitleApplication; onChange: () => void }) {
  const tr = useT();
  const toast = useToast();
  const api = useTitlesApi();
  const [busy, setBusy] = useState(false);
  return (
    <Card gap="sm">
      <Row gap="sm" justify="space-between">
        <Row gap="sm">
          <TitleBadge title={app.title} />
          <Text variant="bodyStrong">{tr(`chessTitle.names.${app.title}`)}</Text>
        </Row>
        <Badge label={tr('chessTitle.status.pending')} tone="warning" />
      </Row>
      <Text variant="caption" tone="muted">
        {`${tr('chessTitle.sentOn', { date: formatDate(app.createdAt, { day: 'numeric', month: 'short', year: 'numeric' }) })} · ${app.documents.map((d) => d.name).join(', ')}`}
      </Text>
      <Text tone="muted">{tr('chessTitle.waiting')}</Text>
      <Row>
        <Button
          size="sm"
          variant="secondary"
          title={tr('chessTitle.withdraw')}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await api.withdraw(app.id);
              toast.show({ title: tr('chessTitle.withdrawn') });
              onChange();
            } catch (e) {
              toast.show({ title: (e as Error).message, tone: 'danger' });
            } finally {
              setBusy(false);
            }
          }}
        />
      </Row>
    </Card>
  );
}

function ApplyForm({ current, onSent }: { current: ChessTitle | null; onSent: () => void }) {
  const tr = useT();
  const toast = useToast();
  const api = useTitlesApi();
  const { colors: c } = useAppTheme();
  const [title, setTitle] = useState<ChessTitle | null>(null);
  const [fullName, setFullName] = useState('');
  const [fideId, setFideId] = useState('');
  const [federation, setFederation] = useState('');
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<PickedProof[]>([]);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [sending, setSending] = useState(false);

  const addFiles = async () => {
    const { files: picked, problems } = await pickProof();
    const next = [...files, ...picked];
    const msgs = problems.map((p) => tr(p.kind === 'tooBig' ? 'chessTitle.tooBig' : 'chessTitle.wrongType', { name: p.name }));
    if (next.length > MAX_TITLE_DOCS) msgs.push(tr('chessTitle.tooMany'));
    setFiles(next.slice(0, MAX_TITLE_DOCS));
    setError(msgs.length ? { message: msgs.join(' · '), field: 'documents' } : null);
  };

  const submit = async () => {
    const input = { title, fullName, fideId, federation, note, documents: files.map(({ name, mime, data }) => ({ name, mime, data })) };
    const v = validateTitleApplication(input);
    if ('error' in v) return setError({ message: v.error, field: v.field });
    setSending(true);
    setError(null);
    try {
      await api.apply(v.value);
      toast.show({ title: tr('chessTitle.sent'), tone: 'success' });
      onSent();
    } catch (e) {
      setError({ message: (e as Error).message, field: (e as { field?: string }).field });
    } finally {
      setSending(false);
    }
  };
  const fieldError = (f: string) => (error?.field === f ? error.message : null);

  return (
    <Card title={tr(current ? 'chessTitle.applyOther' : 'chessTitle.apply')} gap="md">
      <Stack gap="xs">
        <Text variant="label" tone="muted">
          {tr('chessTitle.choose')}
        </Text>
        <Row gap="xs" wrap>
          {CHESS_TITLES.filter((t) => t !== current).map((t) => (
            <Chip key={t} label={t} selected={title === t} onPress={() => setTitle(t)} />
          ))}
        </Row>
        {title ? (
          <Text variant="caption" tone="muted">
            {tr(`chessTitle.names.${title}`)}
          </Text>
        ) : null}
        {fieldError('title') ? (
          <Text variant="caption" tone="danger">
            {fieldError('title')}
          </Text>
        ) : null}
      </Stack>
      <TextField label={tr('chessTitle.fullName')} helper={tr('chessTitle.fullNameHelp')} value={fullName} onChangeText={setFullName} error={fieldError('fullName')} autoComplete="name" />
      <Row gap="sm" align="flex-start" wrap>
        <TextField
          containerStyle={{ flexGrow: 1, flexBasis: 200 }}
          label={tr('chessTitle.fideId')}
          helper={tr('chessTitle.fideIdHelp')}
          value={fideId}
          onChangeText={(v) => setFideId(v.replace(/\D/g, ''))}
          keyboardType="number-pad"
          error={fieldError('fideId')}
        />
        <TextField
          containerStyle={{ flexGrow: 1, flexBasis: 160 }}
          label={tr('chessTitle.federation')}
          helper={tr('chessTitle.federationHelp')}
          value={federation}
          onChangeText={(v) => setFederation(v.replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase())}
          autoCapitalize="characters"
          error={fieldError('federation')}
        />
      </Row>
      <TextField label={tr('chessTitle.note')} value={note} onChangeText={setNote} multiline numberOfLines={3} maxLength={1000} />

      <Stack gap="xs">
        <Text variant="label" tone="muted">
          {tr('chessTitle.proof')}
        </Text>
        <Text variant="caption" tone="muted">
          {tr('chessTitle.proofHelp')}
        </Text>
        {files.map((f, i) => (
          <Row key={`${f.name}-${i}`} gap="sm" style={[styles.file, { borderColor: c.border, backgroundColor: c.surfaceSunken }]}>
            <Ionicons name={f.mime === 'application/pdf' ? 'document-text-outline' : 'image-outline'} size={18} color={c.muted} />
            <Text style={{ flex: 1 }} numberOfLines={1}>
              {f.name}
            </Text>
            <Text variant="caption" tone="tertiary">
              {kb(f.size)}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`${tr('chessTitle.remove')} ${f.name}`} hitSlop={8} onPress={() => setFiles(files.filter((_, j) => j !== i))}>
              <Ionicons name="close" size={18} color={c.muted} />
            </Pressable>
          </Row>
        ))}
        {files.length < MAX_TITLE_DOCS && (
          <Row>
            <Button size="sm" variant="secondary" title={tr('chessTitle.addFile')} onPress={() => void addFiles()} />
          </Row>
        )}
      </Stack>

      {error && !['fullName', 'fideId', 'federation', 'title'].includes(error.field ?? '') ? (
        <Text variant="caption" tone="danger">
          {error.message}
        </Text>
      ) : null}
      <Text variant="caption" tone="tertiary">
        {tr('chessTitle.privacy')}
      </Text>
      <Button title={tr('chessTitle.submit')} loading={sending} disabled={!title || files.length === 0} onPress={() => void submit()} />
    </Card>
  );
}

function HistoryRow({ app }: { app: TitleApplication }) {
  const tr = useT();
  return (
    <Stack gap="xxs" style={{ paddingVertical: 8 }}>
      <Row gap="sm" justify="space-between">
        <Row gap="sm">
          <Text variant="bodyStrong">{app.title}</Text>
          <Text variant="caption" tone="muted">
            {formatDate(app.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
        </Row>
        <Badge label={tr(`chessTitle.status.${app.status}`)} tone={TITLE_STATUS_TONE[app.status]} />
      </Row>
      {app.reviewNote && app.status === 'rejected' ? (
        <Text variant="caption" tone="muted">
          {tr('chessTitle.staffNote', { note: app.reviewNote })}
        </Text>
      ) : null}
    </Stack>
  );
}

const styles = StyleSheet.create({
  file: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
});
