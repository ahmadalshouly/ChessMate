import { router, Stack } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { NotificationRow } from '@/components/notifications/NotificationRow';
import { Button, Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH, useTheme } from '@/constants/theme';
import { useT } from '@/i18n';
import { useNotifications } from '@/lib/notifications';

export default function NotificationCenter() {
  const t = useTheme();
  const tr = useT();
  const n = useNotifications();

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: tr('settings.notifications.title'),
          headerRight: () => (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push('/settings/notifications')} style={{ paddingHorizontal: 8 }}>
              <Text style={{ color: t.text, fontWeight: '600' }}>{tr('settings.title')}</Text>
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
                {tr('notifications.inbox')}
              </Label>
              <Label muted size={14}>
                {n.unread > 0 ? tr('notifications.unreadCount', { count: n.unread }) : tr('notifications.caughtUp')}
              </Label>
            </View>
            {n.unread > 0 && <Button variant="secondary" title={tr('notifications.markAllRead')} onPress={() => void n.markRead('all')} />}
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
                <Label bold>{n.offline ? tr('notifications.offline') : tr('notifications.empty')}</Label>
                <Label muted>
                  {n.offline
                    ? tr('notifications.offlineBody')
                    : tr('notifications.emptyBody')}
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
