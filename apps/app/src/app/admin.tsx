import { REPORT_REASONS } from '@chessmate/core';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/ui/primitives';

import { Chip } from '@/components/ChatPanel';
import { Button, Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH, useTheme } from '@/constants/theme';
import { API_BASE, adminApi, type AdminChatBan, type AdminReport, type ModAction } from '@/lib/adminApi';

const reasonLabel = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.label ?? id;
const when = (ms: number) => new Date(ms).toLocaleString();

/**
 * Moderation queue. Signs in with the server's ADMIN_TOKEN (kept in memory
 * only). Once accounts have roles this screen should check the session instead.
 */
export default function Admin() {
  const t = useTheme();
  const [tokenInput, setTokenInput] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [bans, setBans] = useState<AdminChatBan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    try {
      const [r, b] = await Promise.all([adminApi.reports(token, filter), adminApi.bans(token)]);
      setReports(r);
      setBans(b);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the server');
      if (e instanceof Error && /token/i.test(e.message)) setToken(null);
    } finally {
      setBusy(false);
    }
  }, [token, filter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const act = async (r: AdminReport, action: ModAction, hours?: number) => {
    if (!token) return;
    try {
      await adminApi.resolve(token, r.id, action, hours);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Moderation' }} />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.column}>
          {!token ? (
            <Card>
              <Label size={22} bold>Moderation</Label>
              <Label muted>{`Enter the admin token configured on the game server (ADMIN_TOKEN). Server: ${API_BASE}`}</Label>
              <TextInput
                value={tokenInput}
                onChangeText={setTokenInput}
                placeholder="Admin token"
                placeholderTextColor={t.muted}
                secureTextEntry
                autoCapitalize="none"
                onSubmitEditing={() => tokenInput && setToken(tokenInput)}
                style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
              />
              <Button title="Open queue" disabled={!tokenInput} onPress={() => setToken(tokenInput)} />
              {error && <Label muted>{error}</Label>}
            </Card>
          ) : (
            <>
              <Card>
                <View style={styles.row}>
                  <Label size={22} bold>Reports</Label>
                  <View style={styles.row}>
                    <Chip label="Open" active={filter === 'open'} onPress={() => setFilter('open')} />
                    <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
                    <Chip label={busy ? 'Loading...' : 'Refresh'} onPress={() => void refresh()} />
                    <Chip label="Sign out" onPress={() => setToken(null)} />
                  </View>
                </View>
                {error && <Label muted>{error}</Label>}
                {reports.length === 0 && <Label muted>{filter === 'open' ? 'No open reports. All clear.' : 'No reports yet.'}</Label>}
              </Card>

              {reports.map((r) => (
                <Card key={r.id}>
                  <View style={styles.row}>
                    <Label bold>{`${r.targetName} · ${reasonLabel(r.reason)}`}</Label>
                    <Text style={[styles.badge, { color: t.text, borderColor: t.border }]}>{r.status}</Text>
                  </View>
                  <Label muted>
                    {`Reported by ${r.reporterName} · ${when(r.createdAt)}${r.gameId ? ` · game ${r.gameId}` : ''}${
                      r.targetReportCount && r.targetReportCount > 1 ? ` · ${r.targetReportCount} reports on this player` : ''
                    }`}
                  </Label>
                  {r.targetChatBan && <Label muted>{`Chat banned until ${when(r.targetChatBan.until)}`}</Label>}
                  {!!r.note && <Label>{`"${r.note}"`}</Label>}
                  {r.chat.length > 0 && (
                    <View style={[styles.log, { borderColor: t.border }]}>
                      {r.chat.slice(-30).map((l) => (
                        <Text key={l.id} style={{ color: l.playerId === r.targetId ? t.text : t.muted, fontSize: 13, fontWeight: l.playerId === r.targetId ? '600' : '400' }}>
                          {`${l.name}: ${l.text}${l.filtered ? '  [filtered]' : ''}`}
                        </Text>
                      ))}
                    </View>
                  )}
                  {r.moves.length > 0 && <Label muted>{`${r.moves.length} moves: ${r.moves.slice(0, 40).join(' ')}${r.moves.length > 40 ? ' ...' : ''}`}</Label>}
                  {r.resolution ? (
                    <Label muted>{`Resolved: ${r.resolution.action.replace('_', ' ')} · ${when(r.resolution.at)}`}</Label>
                  ) : (
                    <View style={styles.actions}>
                      <Button variant="secondary" title="Dismiss" onPress={() => act(r, 'dismiss')} />
                      <Button variant="secondary" title="Warn" onPress={() => act(r, 'warn')} />
                      <Button variant="danger" title="Mute chat 24h" onPress={() => act(r, 'chat_ban', 24)} />
                      <Button variant="danger" title="7 days" onPress={() => act(r, 'chat_ban', 24 * 7)} />
                    </View>
                  )}
                </Card>
              ))}

              <Card>
                <Label size={18} bold>Active chat bans</Label>
                {bans.length === 0 && <Label muted>None.</Label>}
                {bans.map((b) => (
                  <View key={b.playerId} style={styles.row}>
                    <Label>{`${b.name} · until ${when(b.until)}`}</Label>
                    <Chip
                      label="Lift"
                      onPress={() =>
                        token &&
                        adminApi
                          .unban(token, b.playerId)
                          .then(refresh)
                          .catch((e: Error) => setError(e.message))
                      }
                    />
                  </View>
                ))}
              </Card>
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, alignItems: 'center' },
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, fontSize: 12, textTransform: 'capitalize' },
  log: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 3 },
});
