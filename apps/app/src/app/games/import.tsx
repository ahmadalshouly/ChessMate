import { parsePgn, type ArchivedGame } from '@chessmate/core';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { GameRow } from '@/components/archive';
import { Button, Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH, useTheme } from '@/constants/theme';
import { saveGames } from '@/lib/archive';
import { pickPgnFile } from '@/lib/share';

export default function ImportPgn() {
  const t = useTheme();
  const [text, setText] = useState('');
  const [myName, setMyName] = useState('');
  const [result, setResult] = useState<{ games: ArchivedGame[]; added: number; errors: { index: number; message: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const names = myName
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);
      const parsed = parsePgn(text, { myNames: names });
      const added = parsed.games.length ? await saveGames(parsed.games) : 0;
      setResult({ games: parsed.games, added, errors: parsed.errors });
    } finally {
      setBusy(false);
    }
  };

  const input = [styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }];

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Import PGN' }} />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>
          <Card>
            <Label size={18} bold>
              Import games
            </Label>
            <Label muted>Paste one or more games in PGN format. Comments and variations are skipped. Games you already imported are updated, not duplicated.</Label>
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              placeholder={'[White "..."]\n[Black "..."]\n\n1. e4 e5 2. Nf3 ...'}
              placeholderTextColor={t.muted}
              autoCapitalize="none"
              autoCorrect={false}
              style={[input, styles.pgn]}
              textAlignVertical="top"
            />
            {Platform.OS === 'web' && (
              <Button
                variant="secondary"
                title="Choose a .pgn file"
                onPress={async () => {
                  const content = await pickPgnFile();
                  if (content) setText(content);
                }}
              />
            )}
            <Label muted>Your name in these games (optional, comma-separated). Used to mark wins and losses.</Label>
            <TextInput value={myName} onChangeText={setMyName} placeholder="e.g. ahmad, ahmad_chess" placeholderTextColor={t.muted} autoCapitalize="none" autoCorrect={false} style={input} />
            <Button title={busy ? 'Importing…' : 'Import'} disabled={busy || !text.trim()} onPress={run} />
          </Card>

          {result && (
            <Card>
              <Label bold>
                {result.games.length === 0
                  ? 'No games could be imported'
                  : `Imported ${result.games.length} game${result.games.length === 1 ? '' : 's'}${result.added < result.games.length ? ` (${result.games.length - result.added} already in your history)` : ''}`}
              </Label>
              {result.errors.slice(0, 5).map((e) => (
                <Label key={e.index} muted>
                  Game {e.index + 1}: {e.message}
                </Label>
              ))}
              {result.errors.length > 5 && <Label muted>…and {result.errors.length - 5} more with errors.</Label>}
              <View style={styles.list}>
                {result.games.slice(0, 5).map((g) => (
                  <GameRow key={g.id} game={g} onPress={() => router.push({ pathname: '/games/[id]', params: { id: g.id } })} />
                ))}
              </View>
              {result.games.length > 0 && <Button title="View game history" onPress={() => router.replace('/games')} />}
            </Card>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, alignItems: 'center', paddingBottom: 48 },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 16 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  pgn: { minHeight: 200, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 13 },
  list: { gap: 8 },
});
