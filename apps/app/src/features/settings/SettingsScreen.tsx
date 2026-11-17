import { BOARD_THEMES, PIECE_SETS, type MyProfile, type SettingsPatch, type Visibility } from '@chessmate/core';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Board } from '@/components/Board';
import { Button, Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH, useTheme } from '@/constants/theme';
import { ApiError } from '@/features/account/api';
import { BOARD_THEME_COLORS, PIECE_SET_LABELS } from '@/features/account/boardThemes';
import { useAccountSession } from '@/features/account/session';
import { useSettingsSync } from '@/features/account/settingsStore';
import { Divider, Field, Row, Segmented, SectionTitle, ToggleRow } from '@/features/profile/controls';

const PREVIEW_FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
const VOLUME = [
  { value: '0.3', label: 'Low' },
  { value: '0.7', label: 'Medium' },
  { value: '1', label: 'High' },
];
const AUDIENCE: { value: Visibility; label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'friends', label: 'Friends' },
  { value: 'nobody', label: 'Nobody' },
];

export function SettingsScreen() {
  const t = useTheme();
  const session = useAccountSession();
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
    update(patch).catch((e: Error) => setSaveError(`Couldn't save: ${e.message}`));
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
              <Label muted>You're not signed in. Settings are saved on this device only.</Label>
            </Card>
          )}

          <Section title="Board">
            <View style={styles.preview}>
              <Board fen={PREVIEW_FEN} orientation="w" size={200} lastMove={{ from: 'g1', to: 'f3' }} />
              <View style={{ flex: 1, minWidth: 160, gap: 8 }}>
                {BOARD_THEMES.map((theme) => {
                  const c = BOARD_THEME_COLORS[theme];
                  const on = s.board.theme === theme;
                  return (
                    <Pressable
                      key={theme}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      onPress={() => set({ board: { theme } })}
                      style={[styles.themeRow, { borderColor: on ? t.text : t.border }]}>
                      <View style={styles.swatch}>
                        <View style={{ flex: 1, backgroundColor: c.light }} />
                        <View style={{ flex: 1, backgroundColor: c.dark }} />
                      </View>
                      <Text style={{ color: t.text, fontWeight: on ? '700' : '400' }}>{c.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <Text style={[styles.label, { color: t.muted }]}>Pieces</Text>
            <Segmented value={s.board.pieces} options={PIECE_SETS.map((p) => ({ value: p, label: PIECE_SET_LABELS[p] }))} onChange={(pieces) => set({ board: { pieces } })} />
            <ToggleRow title="Coordinates" value={s.board.coordinates} onChange={(v) => set({ board: { coordinates: v } })} />
            <ToggleRow title="Highlight last move" value={s.board.highlightLastMove} onChange={(v) => set({ board: { highlightLastMove: v } })} />
            <ToggleRow title="Show legal moves" value={s.board.showLegalMoves} onChange={(v) => set({ board: { showLegalMoves: v } })} />
          </Section>

          <Section title="Sound">
            <ToggleRow title="Sounds" value={s.sound.enabled} onChange={(v) => set({ sound: { enabled: v } })} />
            {s.sound.enabled && (
              <>
                <Segmented value={volume} options={VOLUME} onChange={(v) => set({ sound: { volume: Number(v) } })} accessibilityLabel="Volume" />
                <ToggleRow title="Move and capture sounds" value={s.sound.moves} onChange={(v) => set({ sound: { moves: v } })} />
                <ToggleRow title="Low time warning" value={s.sound.lowTime} onChange={(v) => set({ sound: { lowTime: v } })} />
              </>
            )}
          </Section>

          <Section title="Gameplay">
            <Text style={[styles.label, { color: t.muted }]}>Confirm moves before sending</Text>
            <Segmented
              value={s.gameplay.confirmMoves}
              options={[
                { value: 'never', label: 'Never' },
                { value: 'correspondence', label: 'Daily only' },
                { value: 'always', label: 'Always' },
              ]}
              onChange={(confirmMoves) => set({ gameplay: { confirmMoves } })}
            />
            <ToggleRow title="Confirm before resigning" value={s.gameplay.confirmResign} onChange={(v) => set({ gameplay: { confirmResign: v } })} />
          </Section>

          <Section title="Notifications">
            <ToggleRow title="Game found" detail="When matchmaking pairs you" value={s.notifications.gameStart} onChange={(v) => set({ notifications: { gameStart: v } })} />
            <ToggleRow title="Your turn" detail="In daily games" value={s.notifications.yourTurn} onChange={(v) => set({ notifications: { yourTurn: v } })} />
            <ToggleRow title="Challenges" value={s.notifications.challenges} onChange={(v) => set({ notifications: { challenges: v } })} />
            <ToggleRow title="Friend requests" value={s.notifications.friendRequests} onChange={(v) => set({ notifications: { friendRequests: v } })} />
            <ToggleRow title="Email updates" detail="Occasional product news" value={s.notifications.email} onChange={(v) => set({ notifications: { email: v } })} />
          </Section>

          <Section title="Privacy">
            <ToggleRow title="Show when I'm online" value={s.privacy.showOnline} onChange={(v) => set({ privacy: { showOnline: v } })} />
            <ToggleRow title="Show my rating graph" value={s.privacy.showRatingHistory} onChange={(v) => set({ privacy: { showRatingHistory: v } })} />
            <ToggleRow title="Show my recent games" value={s.privacy.showGames} onChange={(v) => set({ privacy: { showGames: v } })} />
            <Text style={[styles.label, { color: t.muted }]}>Who can challenge me</Text>
            <Segmented value={s.privacy.challenges} options={AUDIENCE} onChange={(challenges) => set({ privacy: { challenges } })} />
            <Text style={[styles.label, { color: t.muted }]}>Who can message me</Text>
            <Segmented value={s.privacy.messages} options={AUDIENCE} onChange={(messages) => set({ privacy: { messages } })} />
          </Section>

          {session.signedIn && (
            <>
              <Section title="Account">
                <Row title="Email" detail={email ?? '...'} />
                <Divider />
                <ChangePassword />
                {session.signOut && (
                  <>
                    <Divider />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Button variant="secondary" title="Sign out" onPress={() => void session.signOut?.()} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Button variant="secondary" title="Sign out everywhere" onPress={() => void session.signOut?.({ everywhere: true })} />
                      </View>
                    </View>
                  </>
                )}
              </Section>
              <Section title="Danger zone">
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

function ChangePassword() {
  const session = useAccountSession();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ field?: string; text: string; ok?: boolean } | null>(null);

  if (!open) return <Button variant="secondary" title="Change password" onPress={() => setOpen(true)} />;
  const submit = async () => {
    if (next.length < 8) return setMsg({ field: 'newPassword', text: 'Use at least 8 characters' });
    setBusy(true);
    setMsg(null);
    try {
      await session.apiFetch('/api/me/password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      setMsg({ text: 'Password changed.', ok: true });
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
      <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" error={msg?.field === 'currentPassword' ? msg.text : null} />
      <Field label="New password" value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" error={msg?.field === 'newPassword' ? msg.text : null} />
      {msg && !msg.field && <Label muted={!msg.ok}>{msg.text}</Label>}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button variant="secondary" title="Cancel" onPress={() => setOpen(false)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title={busy ? 'Saving...' : 'Update password'} onPress={submit} disabled={busy || !current || !next} />
        </View>
      </View>
    </View>
  );
}

function DeleteAccount() {
  const session = useAccountSession();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <>
        <Label muted>Deleting your account removes your profile, ratings and settings. This can't be undone.</Label>
        <Button variant="danger" title="Delete account" onPress={() => setOpen(true)} />
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
      <Label>Enter your password and type DELETE to confirm.</Label>
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" error={error} />
      <Field label="Type DELETE" value={confirm} onChangeText={setConfirm} autoCapitalize="characters" autoCorrect={false} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button variant="secondary" title="Keep my account" onPress={() => setOpen(false)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button variant="danger" title={busy ? 'Deleting...' : 'Delete forever'} onPress={submit} disabled={busy || !password || confirm !== 'DELETE'} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 16 },
  preview: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'center' },
  themeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 8 },
  swatch: { width: 28, height: 28, borderRadius: 6, overflow: 'hidden', flexDirection: 'row' },
  label: { fontSize: 13, fontWeight: '600', marginTop: 4 },
});
