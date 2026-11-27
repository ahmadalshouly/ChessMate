import Ionicons from '@expo/vector-icons/Ionicons';
import { AD_SPOT_KEY, SPONSOR_CURRENCIES, SPONSOR_MESSAGE_MAX, type SponsorCurrency } from '@chessmate/core';
import { Stack as RouterStack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Segmented } from '@/components/play/Controls';
import { useAdmin } from '@/features/admin/AdminContext';
import { AdminPage, ErrorLine, PageHeader, Section, useLoad } from '@/features/admin/ui';
import { SponsorConversation, money, paymentTone } from '@/features/sponsors/Conversation';
import { formatDateTime, useT } from '@/i18n';
import type { SponsorThread } from '@/lib/adminApi';
import { copyText } from '@/lib/share';
import { Badge, Button, GlassView, Row, Stack, Text, TextField, useAppTheme, useToast } from '@/ui';

/**
 * One sponsor application: the conversation with the company (they answer on
 * their own page, opened from our emails) and the Stripe payment links sent to
 * them, with their status from the webhook.
 */
export default function AdminSponsor() {
  const tr = useT();
  const { api, can } = useAdmin();
  const { id } = useLocalSearchParams<{ id: string }>();
  const apps = useLoad(() => api.sponsors(), [api]);
  const loaded = useLoad(() => api.sponsorThread(String(id)), [api, id]);
  const [thread, setThread] = useState<SponsorThread | null>(null);
  const t = thread ?? loaded.data;
  const a = apps.data?.find((x) => x.id === id);
  const name = a ? (a.company ?? a.name) : '';
  const reload = () => {
    setThread(null);
    loaded.reload();
    apps.reload();
  };

  return (
    <AdminPage onRefresh={reload} refreshing={loaded.loading && !!t}>
      <RouterStack.Screen options={{ title: name || tr('admin.nav.sponsors') }} />
      <PageHeader
        title={name || tr('admin.nav.sponsors')}
        subtitle={a ? `${a.name} · ${a.email}${a.spot ? ` · ${tr(`ads.spot.${AD_SPOT_KEY[a.spot]}`)}` : ''}` : undefined}
        right={a ? <Badge label={tr(`admin.sponsors.status.${a.status}`)} tone={a.status === 'new' ? 'solid' : a.status === 'declined' ? 'danger' : 'outline'} /> : undefined}
      />
      <ErrorLine message={loaded.error ?? apps.error} />
      {a ? (
        <GlassView radius="lg" padding="lg" flat>
          <Stack gap="xs">
            <Text variant="caption" tone="tertiary">
              {formatDateTime(a.createdAt)}
              {a.website ? ` · ${a.website}` : ''}
              {a.budget ? ` · ${a.budget}` : ''}
            </Text>
            <Text selectable>{a.message}</Text>
          </Stack>
        </GlassView>
      ) : null}
      {t ? (
        <Stack gap="lg">
          <Conversation id={String(id)} name={name} thread={t} onThread={setThread} />
          {can('payments.manage') ? <Payments id={String(id)} thread={t} onThread={setThread} closed={a?.status === 'declined'} /> : null}
        </Stack>
      ) : null}
    </AdminPage>
  );
}

function Conversation({ id, name, thread, onThread }: { id: string; name: string; thread: SponsorThread; onThread: (t: SponsorThread) => void }) {
  const tr = useT();
  const { api } = useAdmin();
  const toast = useToast();
  const c = useAppTheme().colors;
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      onThread(await api.sponsorMessage(id, draft.trim()));
      setDraft('');
      toast.show({ title: tr('admin.sponsors.sent'), tone: 'success' });
    } catch (e) {
      toast.show({ title: e instanceof Error ? e.message : tr('admin.common.failed'), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section
      title={tr('admin.sponsors.conversation')}
      action={
        thread.portalUrl ? (
          <Button
            size="sm"
            variant="ghost"
            title={tr('admin.sponsors.copyPortal')}
            onPress={() => void copyText(thread.portalUrl!).then(() => toast.show({ title: tr('admin.sponsors.copied'), tone: 'success' }))}
          />
        ) : undefined
      }>
      <Stack gap="md">
        {thread.messages.length ? (
          <SponsorConversation messages={thread.messages} side="staff" names={{ mine: tr('admin.sponsors.team'), theirs: name }} />
        ) : (
          <Text tone="muted">{tr('admin.sponsors.noMessages')}</Text>
        )}
        <TextField label={tr('admin.sponsors.write', { name })} value={draft} onChangeText={setDraft} multiline maxLength={SPONSOR_MESSAGE_MAX} />
        <Row>
          <Button size="sm" title={tr('admin.sponsors.send')} loading={busy} disabled={!draft.trim()} onPress={() => void send()} leftIcon={<Ionicons name="send" size={14} color={c.onAccent} />} />
        </Row>
      </Stack>
    </Section>
  );
}

function Payments({ id, thread, onThread, closed }: { id: string; thread: SponsorThread; onThread: (t: SponsorThread) => void; closed: boolean }) {
  const tr = useT();
  const { api } = useAdmin();
  const toast = useToast();
  const c = useAppTheme().colors;
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<SponsorCurrency>('eur');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const cents = Math.round(Number(amount.replace(',', '.')) * 100);

  const run = async (key: string, fn: () => Promise<SponsorThread>, done: string) => {
    setBusy(key);
    try {
      onThread(await fn());
      toast.show({ title: done, tone: 'success' });
      return true;
    } catch (e) {
      toast.show({ title: e instanceof Error ? e.message : tr('admin.common.failed'), tone: 'danger' });
      return false;
    } finally {
      setBusy(null);
    }
  };
  const sendLink = async () => {
    if (await run('new', () => api.sponsorPaymentLink(id, { amountCents: cents, currency, description: description.trim() }), tr('admin.sponsors.linkSent'))) {
      setAmount('');
      setDescription('');
    }
  };

  return (
    <Section title={tr('admin.sponsors.payments')}>
      <Stack gap="md">
        {thread.payments.length ? (
          thread.payments.map((p) => (
            <View key={p.id} style={{ gap: 6, paddingBottom: 12, borderBottomWidth: 1, borderColor: c.border }}>
              <Row justify="space-between" wrap gap="sm">
                <Text variant="subheading" style={{ flexShrink: 1 }}>
                  {p.description}
                </Text>
                <Row gap="sm">
                  <Text variant="figure">{money(p.amountCents, p.currency)}</Text>
                  <Badge label={tr(`admin.sponsors.paymentStatus.${p.status}`)} tone={paymentTone(p.status)} />
                </Row>
              </Row>
              <Text variant="caption" tone="tertiary">
                {tr('admin.sponsors.by', { name: p.createdBy ?? '?', date: formatDateTime(p.createdAt) })}
                {p.paidAt ? ` · ${tr('admin.sponsors.paymentStatus.paid')} ${formatDateTime(p.paidAt)}` : ''}
              </Text>
              {p.url ? (
                <Row gap="sm" wrap>
                  <Button size="sm" variant="secondary" title={tr('admin.sponsors.copyLink')} onPress={() => void copyText(p.url!).then(() => toast.show({ title: tr('admin.sponsors.copied'), tone: 'success' }))} />
                  <Button size="sm" variant="ghost" title={tr('admin.sponsors.withdraw')} loading={busy === p.id} onPress={() => void run(p.id, () => api.cancelSponsorPayment(id, p.id), tr('admin.sponsors.withdrawn'))} />
                </Row>
              ) : null}
            </View>
          ))
        ) : (
          <Text tone="muted">{tr('admin.sponsors.noPayments')}</Text>
        )}
        {!thread.paymentsEnabled ? (
          <Text tone="warning">{tr('admin.sponsors.paymentsOff')}</Text>
        ) : closed ? null : (
          <Stack gap="sm">
            <Text variant="overline" tone="muted">
              {tr('admin.sponsors.newPayment')}
            </Text>
            <TextField label={tr('admin.sponsors.description')} placeholder={tr('admin.sponsors.descriptionHint')} value={description} onChangeText={setDescription} maxLength={120} />
            <TextField label={tr('admin.sponsors.amount')} value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d.,]/g, '').slice(0, 9))} keyboardType="decimal-pad" placeholder="300" />
            <Segmented<SponsorCurrency> size="sm" value={currency} onChange={setCurrency} options={SPONSOR_CURRENCIES.map((x) => ({ value: x, label: x.toUpperCase() }))} />
            <Row>
              <Button
                size="sm"
                title={cents > 0 ? `${tr('admin.sponsors.sendLink')} · ${money(cents, currency)}` : tr('admin.sponsors.sendLink')}
                loading={busy === 'new'}
                disabled={!(cents >= 100) || description.trim().length < 3}
                onPress={() => void sendLink()}
                leftIcon={<Ionicons name="card-outline" size={14} color={c.onAccent} />}
              />
            </Row>
          </Stack>
        )}
      </Stack>
    </Section>
  );
}
