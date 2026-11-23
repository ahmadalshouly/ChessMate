import { type MyProfile, type SettingsPatch, type Visibility } from '@chessmate/core';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/ui/primitives';
import { rimShadow } from '@/ui';

import { Button, Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH, useTheme } from '@/constants/theme';
import { ApiError } from '@/features/account/api';
import { useAccountSession } from '@/features/account/session';
import { useAuth } from '@/lib/auth';
import { useSettingsSync } from '@/features/account/settingsStore';
import { BoardCustomizer } from '@/features/board/BoardCustomizer';
import { Divider, Field, Row, Segmented, SectionTitle, ToggleRow } from '@/features/profile/controls';
import { LANGS, LANGUAGE_NAMES, deviceLanguage, needsRestartFor, setLanguagePreference, useI18n, type LanguagePreference, type TKey } from '@/i18n';

const VOLUME: { value: string; label: TKey }[] = [
  { value: '0.3', label: 'settings.sound.low' },
  { value: '0.7', label: 'settings.sound.medium' },
  { value: '1', label: 'settings.sound.high' },
];
const AUDIENCE: { value: Visibility; label: TKey }[] = [
  { value: 'everyone', label: 'settings.privacy.everyone' },
  { value: 'friends', label: 'settings.privacy.friends' },
  { value: 'nobody', label: 'settings.privacy.nobody' },
];

export function SettingsScreen() {
  const t = useTheme();
  const { tr } = useI18n();
  const session = useAccountSession();
  const { user: account } = useAuth();
  const staffRole = account?.role === 'moderator' || account?.role === 'admin' ? account.role : null;
  const { settings: s, update } = useSettingsSync(session);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!session.signedIn) return;
    session
      .apiFetch<MyProfile>('/api/me/profile')
      .then((p) => setEmail(p.email))
      .catch(() => undefined);
  }, [session]);

  const set = (patch: SettingsPatch) => {
    setSaveError(null);
    update(patch).catch((e: Error) => setSaveError(tr('settings.saveFailed', { error: e.message })));
  };
  const volume = String(VOLUME.reduce((best, v) => (Math.abs(Number(v.value) - s.sound.volume) < Math.abs(Number(best.value) - s.sound.volume) ? v : best)).value);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>
          {saveError && (
            <Card>
              <Label>{saveError}</Label>
            </Card>
          )}
          {!session.signedIn && (
            <Card>
              <Label muted>{tr('settings.notSignedIn')}</Label>
            </Card>
          )}

          <LanguageSection />

          <Section title={tr('settings.board.title')}>
            <BoardCustomizer onChange={(board) => set({ board })} />
            <ToggleRow title={tr('settings.board.coordinates')} value={s.board.coordinates} onChange={(v) => set({ board: { coordinates: v } })} />
            <ToggleRow title={tr('settings.board.highlight')} value={s.board.highlightLastMove} onChange={(v) => set({ board: { highlightLastMove: v } })} />
            <ToggleRow title={tr('settings.board.legal')} value={s.board.showLegalMoves} onChange={(v) => set({ board: { showLegalMoves: v } })} />
          </Section>

          <Section title={Platform.OS === 'web' ? tr('settings.sound.title') : tr('settings.sound.titleNative')}>
            <ToggleRow title={tr('settings.sound.sounds')} value={s.sound.enabled} onChange={(v) => set({ sound: { enabled: v } })} />
            {s.sound.enabled && (
              <>
                <Segmented value={volume} options={VOLUME.map((v) => ({ ...v, label: tr(v.label) }))} onChange={(v) => set({ sound: { volume: Number(v) } })} accessibilityLabel={tr('settings.sound.volume')} />
                <ToggleRow title={tr('settings.sound.moves')} value={s.sound.moves} onChange={(v) => set({ sound: { moves: v } })} />
                <ToggleRow title={tr('settings.sound.lowTime')} value={s.sound.lowTime} onChange={(v) => set({ sound: { lowTime: v } })} />
              </>
            )}
            {Platform.OS !== 'web' && (
              <ToggleRow
                title={tr('settings.sound.vibration')}
                detail={tr('settings.sound.vibrationDetail')}
                value={s.sound.haptics}
                onChange={(v) => set({ sound: { haptics: v } })}
              />
            )}
          </Section>

          <Section title={tr('settings.gameplay.title')}>
            <Text style={[styles.label, { color: t.muted }]}>{tr('settings.gameplay.confirmMoves')}</Text>
            <Segmented
              value={s.gameplay.confirmMoves}
              options={[
                { value: 'never', label: tr('settings.gameplay.never') },
                { value: 'correspondence', label: tr('settings.gameplay.daily') },
                { value: 'always', label: tr('settings.gameplay.always') },
              ]}
              onChange={(confirmMoves) => set({ gameplay: { confirmMoves } })}
            />
            <ToggleRow
              title={tr('settings.gameplay.autoQueen')}
              detail={tr('settings.gameplay.autoQueenDetail')}
              value={s.gameplay.autoQueen}
              onChange={(v) => set({ gameplay: { autoQueen: v } })}
            />
            <ToggleRow
              title={tr('settings.gameplay.premoves')}
              detail={tr('settings.gameplay.premovesDetail')}
              value={s.gameplay.premoves}
              onChange={(v) => set({ gameplay: { premoves: v } })}
            />
            <ToggleRow title={tr('settings.gameplay.confirmResign')} value={s.gameplay.confirmResign} onChange={(v) => set({ gameplay: { confirmResign: v } })} />
          </Section>

          <Section title={tr('settings.notifications.title')}>
            <ToggleRow title={tr('settings.notifications.gameFound')} detail={tr('settings.notifications.gameFoundDetail')} value={s.notifications.gameStart} onChange={(v) => set({ notifications: { gameStart: v } })} />
            <ToggleRow title={tr('settings.notifications.yourTurn')} detail={tr('settings.notifications.yourTurnDetail')} value={s.notifications.yourTurn} onChange={(v) => set({ notifications: { yourTurn: v } })} />
            <ToggleRow title={tr('settings.notifications.challenges')} value={s.notifications.challenges} onChange={(v) => set({ notifications: { challenges: v } })} />
            <ToggleRow title={tr('settings.notifications.friendRequests')} value={s.notifications.friendRequests} onChange={(v) => set({ notifications: { friendRequests: v } })} />
            <ToggleRow title={tr('settings.notifications.email')} detail={tr('settings.notifications.emailDetail')} value={s.notifications.email} onChange={(v) => set({ notifications: { email: v } })} />
          </Section>

          <Section title={tr('settings.privacy.title')}>
            <ToggleRow title={tr('settings.privacy.online')} value={s.privacy.showOnline} onChange={(v) => set({ privacy: { showOnline: v } })} />
            <ToggleRow title={tr('settings.privacy.graph')} value={s.privacy.showRatingHistory} onChange={(v) => set({ privacy: { showRatingHistory: v } })} />
            <ToggleRow title={tr('settings.privacy.games')} value={s.privacy.showGames} onChange={(v) => set({ privacy: { showGames: v } })} />
            <Text style={[styles.label, { color: t.muted }]}>{tr('settings.privacy.challengeWho')}</Text>
            <Segmented value={s.privacy.challenges} options={AUDIENCE.map((a) => ({ ...a, label: tr(a.label) }))} onChange={(challenges) => set({ privacy: { challenges } })} />
            <Text style={[styles.label, { color: t.muted }]}>{tr('settings.privacy.messageWho')}</Text>
            <Segmented value={s.privacy.messages} options={AUDIENCE.map((a) => ({ ...a, label: tr(a.label) }))} onChange={(messages) => set({ privacy: { messages } })} />
          </Section>

          {session.signedIn && (
            <Section title={tr('chessTitle.screen')}>
              <Row title={tr('chessTitle.apply')} detail={tr('chessTitle.settingsDetail')}>
                <Button variant="secondary" title={tr('chessTitle.open')} onPress={() => router.push('/settings/title')} />
              </Row>
            </Section>
          )}

          {session.signedIn && (
            <Section title={tr('watch.streamer.title')}>
              <Row title={tr('watch.streamer.settingsRow')} detail={tr('watch.streamer.settingsDetail')}>
                <Button variant="secondary" title={tr('chessTitle.open')} onPress={() => router.push('/settings/streamer')} />
              </Row>
            </Section>
          )}

          {staffRole && (
            <Section title={tr('admin.staffSection')}>
              <Text style={[styles.label, { color: t.muted }]}>{tr('admin.staffDetail', { role: tr(`admin.roles.${staffRole}`) })}</Text>
              <Button variant="secondary" title={tr('admin.open')} onPress={() => router.push('/admin')} />
            </Section>
          )}

          {session.signedIn && (
            <>
              <Section title={tr('settings.account.title')}>
                <Row title={tr('auth.email')} detail={email ?? '...'} />
                <Divider />
                <ChangePassword />
                {session.signOut && (
                  <>
                    <Divider />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Button variant="secondary" title={tr('settings.account.signOut')} onPress={() => void session.signOut?.()} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Button variant="secondary" title={tr('settings.account.signOutAll')} onPress={() => void session.signOut?.({ everywhere: true })} />
                      </View>
                    </View>
                  </>
                )}
              </Section>
              <Section title={tr('settings.danger.title')}>
                <DeleteAccount />
              </Section>
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </Card>
  );
}

/** Language picker: follow the device, or pick one. Arabic switches the layout to right-to-left. */
function LanguageSection() {
  const t = useTheme();
  const { tr, preference } = useI18n();
  const [busy, setBusy] = useState(false);
  const choices: LanguagePreference[] = ['system', ...LANGS];
  const pick = (p: LanguagePreference) => {
    if (p === preference || busy) return;
    setBusy(true);
    setLanguagePreference(p).finally(() => setBusy(false));
  };
  return (
    <Section title={tr('settings.language.title')}>
      <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
        {choices.map((p) => {
          const on = p === preference;
          const name = p === 'system' ? tr('settings.language.system', { language: LANGUAGE_NAMES[deviceLanguage()] }) : LANGUAGE_NAMES[p];
          const restart = !on && needsRestartFor(p);
          return (
            <Pressable
              key={p}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled: busy }}
              // Each language name is announced in its own language.
              accessibilityLanguage={p === 'system' ? undefined : p}
              disabled={busy}
              onPress={() => pick(p)}
              style={[styles.themeRow, { backgroundColor: on ? t.glassSelected : 'transparent' }, on && rimShadow(t, 'bright')]}>
              <View style={[styles.radio, { borderColor: on ? t.text : t.border }]}>{on && <View style={[styles.radioDot, { backgroundColor: t.text }]} />}</View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: on ? '700' : '400', fontSize: 15 }}>{name}</Text>
                {restart && <Text style={{ color: t.muted, fontSize: 12 }}>{tr('settings.language.restart')}</Text>}
              </View>
            </Pressable>
          );
        })}
      </View>
    </Section>
  );
}

function ChangePassword() {
  const session = useAccountSession();
  const { tr } = useI18n();
  // Google/Apple accounts start without a password and can set one here.
  const hasPassword = useAuth().user?.hasPassword !== false;
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ field?: string; text: string; ok?: boolean } | null>(null);

  if (!open) return <Button variant="secondary" title={hasPassword ? tr('settings.account.changePassword') : tr('settings.account.setPassword')} onPress={() => setOpen(true)} />;
  const submit = async () => {
    if (next.length < 8) return setMsg({ field: 'newPassword', text: tr('auth.validate.passwordShort', { min: 8 }) });
    setBusy(true);
    setMsg(null);
    try {
      await session.apiFetch('/api/me/password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      setMsg({ text: hasPassword ? tr('settings.account.passwordChanged') : tr('settings.account.passwordSet'), ok: true });
      setCurrent('');
      setNext('');
    } catch (e) {
      setMsg(e instanceof ApiError ? { field: e.field, text: e.message } : { text: String(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 10 }}>
      {hasPassword ? (
        <Field label={tr('settings.account.current')} value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" error={msg?.field === 'currentPassword' ? msg.text : null} />
      ) : null}
      <Field label={tr('auth.newPassword')} value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" error={msg?.field === 'newPassword' ? msg.text : null} />
      {msg && !msg.field && <Label muted={!msg.ok}>{msg.text}</Label>}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button variant="secondary" title={tr('common.cancel')} onPress={() => setOpen(false)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title={busy ? tr('common.saving') : tr('auth.reset.submit')} onPress={submit} disabled={busy || (hasPassword && !current) || !next} />
        </View>
      </View>
    </View>
  );
}

function DeleteAccount() {
  const session = useAccountSession();
  const { tr } = useI18n();
  const hasPassword = useAuth().user?.hasPassword !== false;
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <>
        <Label muted>{tr('settings.danger.body')}</Label>
        <Button variant="danger" title={tr('settings.danger.delete')} onPress={() => setOpen(true)} />
      </>
    );
  }
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await session.apiFetch('/api/me/delete', { method: 'POST', body: { password } });
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 10 }}>
      <Label>{hasPassword ? tr('settings.danger.confirm') : tr('settings.danger.confirmNoPassword')}</Label>
      {hasPassword ? (
        <Field label={tr('auth.password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" error={error} />
      ) : error ? (
        <Label muted>{error}</Label>
      ) : null}
      <Field label={tr('settings.danger.typeDelete')} value={confirm} onChangeText={setConfirm} autoCapitalize="characters" autoCorrect={false} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button variant="secondary" title={tr('settings.danger.keep')} onPress={() => setOpen(false)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button variant="danger" title={busy ? tr('settings.danger.deleting') : tr('settings.danger.forever')} onPress={submit} disabled={busy || (hasPassword && !password) || confirm !== 'DELETE'} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 16 },
  themeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 10 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 4 },
});
