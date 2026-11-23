import { AVATARS, AVATAR_TONES, BIO_MAX, DISPLAY_NAME_MAX, PLAYER_TAGS, type Avatar as AvatarValue, type MyProfile, type PlayerTag } from '@chessmate/core';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { Button, Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH, useTheme } from '@/constants/theme';
import { ApiError } from '@/features/account/api';
import { useAccountSession } from '@/features/account/session';
import { useT } from '@/i18n';

import { PlayerTagBadge } from '@/features/titles/PlayerTagBadge';

import { Avatar, TONES } from './Avatar';
import { CountryPicker } from './CountryPicker';
import { Field, SectionTitle } from './controls';

export function EditProfile() {
  const t = useTheme();
  const tr = useT();
  const session = useAccountSession();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [country, setCountry] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<AvatarValue>({ id: 'initials', tone: 'ink' });
  const [playerTag, setPlayerTag] = useState<PlayerTag | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);

  useEffect(() => {
    session
      .apiFetch<MyProfile>('/api/me/profile')
      .then((p) => {
        setProfile(p);
        setDisplayName(p.displayName);
        setBio(p.bio ?? '');
        setCountry(p.country);
        setAvatar(p.avatar);
        setPlayerTag(p.playerTag ?? null);
      })
      .catch((e: Error) => setError({ message: e.message }));
  }, [session]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await session.apiFetch('/api/me/profile', { method: 'PATCH', body: { displayName, bio: bio || null, country, avatar, playerTag } });
      if (router.canGoBack()) router.back();
      else router.replace('/profile');
    } catch (e) {
      setError(e instanceof ApiError ? { field: e.field, message: e.message } : { message: String(e) });
    } finally {
      setSaving(false);
    }
  };

  if (!profile) {
    return (
      <Screen>
        <View style={styles.page}>{error ? <Label muted>{error.message}</Label> : <ActivityIndicator style={{ marginTop: 48 }} />}</View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>
          <Card>
            <SectionTitle>{tr('profile.editScreen.avatar')}</SectionTitle>
            <View style={styles.avatarRow}>
              <Avatar avatar={avatar} name={displayName || profile.username} size={84} />
              <View style={{ flex: 1, gap: 10 }}>
                <View style={styles.choices}>
                  {AVATARS.map((id) => (
                    <Pressable
                      key={id}
                      accessibilityRole="radio"
                      accessibilityLabel={id === 'initials' ? tr('profile.editScreen.initials') : id}
                      accessibilityState={{ selected: avatar.id === id }}
                      onPress={() => setAvatar((a) => ({ ...a, id }))}
                      style={[styles.choice, { borderColor: avatar.id === id ? t.text : 'transparent' }]}>
                      <Avatar avatar={{ id, tone: avatar.tone }} name={displayName || profile.username} size={40} />
                    </Pressable>
                  ))}
                </View>
                <View style={styles.choices}>
                  {AVATAR_TONES.map((tone) => (
                    <Pressable
                      key={tone}
                      accessibilityRole="radio"
                      accessibilityLabel={tr('profile.editScreen.tone', { tone })}
                      accessibilityState={{ selected: avatar.tone === tone }}
                      onPress={() => setAvatar((a) => ({ ...a, tone }))}
                      style={[styles.tone, { backgroundColor: TONES[tone].bg, borderColor: avatar.tone === tone ? t.text : t.border }]}
                    />
                  ))}
                </View>
              </View>
            </View>
          </Card>

          <Card>
            <SectionTitle>{tr('profile.editScreen.about')}</SectionTitle>
            <Field
              label={tr('profile.editScreen.displayName')}
              value={displayName}
              onChangeText={setDisplayName}
              maxLength={DISPLAY_NAME_MAX}
              error={error?.field === 'displayName' ? error.message : null}
            />
            <Text style={{ color: t.muted, fontSize: 13 }}>{tr('profile.editScreen.usernameStays', { username: profile.username })}</Text>
            <Field
              label={tr('profile.editScreen.bio', { n: bio.length, max: BIO_MAX })}
              value={bio}
              onChangeText={setBio}
              maxLength={BIO_MAX}
              multiline
              placeholder={tr('profile.editScreen.bioPlaceholder')}
              error={error?.field === 'bio' ? error.message : null}
            />
            <CountryPicker value={country} onChange={setCountry} />
            {error?.field === 'country' && <Text style={{ color: t.danger }}>{error.message}</Text>}
          </Card>

          <Card>
            <SectionTitle>{tr('profile.editScreen.tag')}</SectionTitle>
            <Text style={{ color: t.muted, fontSize: 13 }}>{tr('profile.editScreen.tagHint')}</Text>
            <View style={styles.tagGrid}>
              {PLAYER_TAGS.map((tag) => {
                const on = playerTag === tag;
                return (
                  <Pressable
                    key={tag}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => setPlayerTag(on ? null : tag)}
                    style={[styles.tagChoice, { borderColor: on ? t.text : 'transparent', opacity: !playerTag || on ? 1 : 0.6 }]}>
                    <PlayerTagBadge tag={tag} size="md" />
                  </Pressable>
                );
              })}
            </View>
          </Card>

          {error && !['displayName', 'bio', 'country'].includes(error.field ?? '') && <Label muted>{error.message}</Label>}
          <Button title={saving ? tr('common.saving') : tr('profile.editScreen.save')} onPress={save} disabled={saving} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 16 },
  avatarRow: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagChoice: { borderWidth: 2, borderRadius: 16, padding: 2 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { borderWidth: 2, borderRadius: 24, padding: 2 },
  tone: { width: 32, height: 32, borderRadius: 16, borderWidth: 2 },
});
