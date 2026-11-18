import { parsePgn, type ArchivedGame } from '@chessmate/core';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { TextInput } from '@/ui/primitives';

import { GameRow } from '@/components/archive';
import { Button, Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH, useTheme } from '@/constants/theme';
import { useT } from '@/i18n';
import { saveGames } from '@/lib/archive';
import { pickPgnFile } from '@/lib/share';

export default function ImportPgn() {
  const t = useTheme();
  const tr = useT();
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
      <Stack.Screen options={{ title: tr('games.importPgn') }} />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>
          <Card>
            <Label size={18} bold>
              {tr('games.import.title')}
            </Label>
            <Label muted>{tr('games.import.intro')}</Label>
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
                title={tr('games.import.choose')}
                onPress={async () => {
                  const content = await pickPgnFile();
                  if (content) setText(content);
                }}
              />
            )}
            <Label muted>{tr('games.import.nameHelp')}</Label>
            <TextInput value={myName} onChangeText={setMyName} placeholder={tr('games.import.namePlaceholder')} placeholderTextColor={t.muted} autoCapitalize="none" autoCorrect={false} style={input} />
            <Button title={busy ? tr('games.import.busy') : tr('games.import.cta')} disabled={busy || !text.trim()} onPress={run} />
          </Card>

          {result && (
            <Card>
              <Label bold>
                {result.games.length === 0
                  ? tr('games.import.none')
                  : tr('games.import.done', { count: result.games.length }) +
                    (result.added < result.games.length ? ' ' + tr('games.import.existing', { count: result.games.length - result.added }) : '')}
              </Label>
              {result.errors.slice(0, 5).map((e) => (
                <Label key={e.index} muted>
                  {tr('games.import.error', { n: e.index + 1, message: e.message })}
                </Label>
              ))}
              {result.errors.length > 5 && <Label muted>{tr('games.import.moreErrors', { count: result.errors.length - 5 })}</Label>}
              <View style={styles.list}>
                {result.games.slice(0, 5).map((g) => (
                  <GameRow key={g.id} game={g} onPress={() => router.push({ pathname: '/games/[id]', params: { id: g.id } })} />
                ))}
              </View>
              {result.games.length > 0 && <Button title={tr('games.import.viewHistory')} onPress={() => router.replace('/games')} />}
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
  pgn: { minHeight: 200, writingDirection: 'ltr', textAlign: 'left', fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 13 },
  list: { gap: 8 },
});
