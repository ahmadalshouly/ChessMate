import Ionicons from '@expo/vector-icons/Ionicons';
import { AVATARS, AVATAR_TONES, BIO_MAX, DISPLAY_NAME_MAX, PLAYER_TAGS, type Avatar as AvatarValue, type MyProfile, type PlayerTag } from '@chessmate/core';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { Button, Card, Label, Screen } from '@/components/ui';
import { Button as SmallButton } from '@/ui';
import { MAX_CONTENT_WIDTH, useTheme } from '@/constants/theme';
import { ApiError } from '@/features/account/api';
import { useAccountSession } from '@/features/account/session';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { setMyPhoto } from '@/lib/myPhoto';

import { PlayerTagBadge } from '@/features/titles/PlayerTagBadge';

import { Avatar, TONES } from './Avatar';
import { CountryPicker } from './CountryPicker';
import { Field, SectionTitle } from './controls';
import { pickAvatarPhoto, type PhotoSource } from './pickPhoto';
import { KeyboardScrollView } from '@/ui/components/Keyboard';
import { goBack } from '@/lib/goBack';

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
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const { user } = useAuth();
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

  /** Pictures upload straight away (they are not part of Save), so the header shows them at once. */
  const applyPhoto = (p: MyProfile) => {
    setAvatar((a) => (p.avatar.photo ? { ...a, photo: p.avatar.photo } : { id: a.id, tone: a.tone }));
    if (user) setMyPhoto(user.id, p.avatar.photo);
  };

  const choosePhoto = async (source: PhotoSource) => {
    setPhotoError(null);
    try {
      const picked = await pickAvatarPhoto(source);
      if ('canceled' in picked) return;
      if ('denied' in picked) return setPhotoError(tr('profile.editScreen.cameraDenied'));
      setPhotoBusy(true);
      applyPhoto(await session.apiFetch<MyProfile>('/api/me/avatar', { method: 'PUT', body: { image: picked.base64 } }));
    } catch (e) {
      setPhotoError(e instanceof ApiError ? e.message : tr('profile.editScreen.photoFailed'));
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      applyPhoto(await session.apiFetch<MyProfile>('/api/me/avatar', { method: 'DELETE' }));
    } catch (e) {
      setPhotoError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setPhotoBusy(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await session.apiFetch('/api/me/profile', { method: 'PATCH', body: { displayName, bio: bio || null, country, avatar, playerTag } });
      goBack('/profile');
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
      <KeyboardScrollView contentContainerStyle={styles.page}>
        <View style={styles.inner}>
          <Card>
            <SectionTitle>{tr('profile.editScreen.avatar')}</SectionTitle>
            <View style={styles.photoRow}>
              <SmallButton
                size="sm"
                variant="secondary"
                title={tr('profile.editScreen.takePhoto')}
                leftIcon={<Ionicons name="camera-outline" size={16} color={t.text} />}
                onPress={() => void choosePhoto('camera')}
                disabled={photoBusy}
              />
              <SmallButton
                size="sm"
                variant="secondary"
                title={tr('profile.editScreen.choosePhoto')}
                leftIcon={<Ionicons name="images-outline" size={16} color={t.text} />}
                onPress={() => void choosePhoto('library')}
                disabled={photoBusy}
              />
              {avatar.photo ? (
                <SmallButton size="sm" variant="ghost" title={tr('profile.editScreen.removePhoto')} onPress={() => void removePhoto()} disabled={photoBusy} />
              ) : null}
              {photoBusy && <ActivityIndicator accessibilityLabel={tr('profile.editScreen.uploading')} />}
            </View>
            {photoError && <Text style={{ color: t.danger, fontSize: 13 }}>{photoError}</Text>}
            {avatar.photo ? <Text style={{ color: t.muted, fontSize: 13 }}>{tr('profile.editScreen.photoHint')}</Text> : null}
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
      </KeyboardScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 16 },
  avatarRow: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagChoice: { borderWidth: 2, borderRadius: 16, padding: 2 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { borderWidth: 2, borderRadius: 24, padding: 2 },
  tone: { width: 32, height: 32, borderRadius: 16, borderWidth: 2 },
});
