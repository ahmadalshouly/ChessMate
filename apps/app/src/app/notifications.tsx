import { router, Stack } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { NotificationRow } from '@/components/notifications/NotificationRow';
import { Button, Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH, useTheme } from '@/constants/theme';
import { useNotifications } from '@/lib/notifications';

export default function NotificationCenter() {
  const t = useTheme();
  const n = useNotifications();

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: 'Notifications',
          headerRight: () => (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push('/settings/notifications')} style={{ paddingHorizontal: 8 }}>
              <Text style={{ color: t.text, fontWeight: '600' }}>Settings</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={n.items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void n.refresh()} tintColor={t.muted} />}
        onEndReached={() => n.hasMore && void n.loadMore()}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Label size={24} bold>
                Inbox
              </Label>
              <Label muted size={14}>
                {n.unread > 0 ? `${n.unread} unread` : 'You are all caught up'}
              </Label>
            </View>
            {n.unread > 0 && <Button variant="secondary" title="Mark all read" onPress={() => void n.markRead('all')} />}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.inner}>
            <NotificationRow n={item} onPress={() => n.open(item)} onRemove={() => void n.remove(item.id)} />
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.inner}>
            {n.loading ? (
              <ActivityIndicator color={t.muted} style={{ marginTop: 40 }} />
            ) : (
              <Card>
                <Label bold>{n.offline ? 'Cannot reach ChessMate' : 'No notifications yet'}</Label>
                <Label muted>
                  {n.offline
                    ? 'Check that the game server is running and you are signed in, then pull to refresh.'
                    : 'Challenges, friend requests, your turn alerts and game reviews will show up here.'}
                </Label>
              </Card>
            )}
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 4 },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  header: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
});
