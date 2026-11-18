import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import type { TextInputInstance } from 'react-native';

import { AuthShell, Divider, FormMessage, TextLink } from '@/components/auth/AuthShell';
import { SocialSignIn } from '@/components/auth/SocialSignIn';
import { TextField } from '@/components/auth/TextField';
import { Button, Label } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { toFormError } from '@/lib/auth/errors';
import { leaveAuth } from '@/lib/auth/navigation';
import { useT } from '@/i18n';

export default function SignIn() {
  const { signIn, continueAsGuest, status } = useAuth();
  const tr = useT();
  const { next, login: prefill } = useLocalSearchParams<{ next?: string; login?: string }>();
  const [login, setLogin] = useState(prefill ?? '');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ login?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);

  async function submit() {
    const e: typeof errors = {};
    if (!login.trim()) e.login = tr('auth.signInScreen.loginEmpty');
    if (!password) e.password = tr('auth.signInScreen.passwordEmpty');
    setErrors(e);
    if (e.login || e.password) return;
    setBusy(true);
    try {
      await signIn(login, password);
      leaveAuth(next);
    } catch (err) {
      const fe = toFormError(err);
      setErrors(fe.field === 'login' || fe.field === 'password' ? { [fe.field]: fe.message } : { form: fe.message });
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title={tr('auth.signInScreen.title')}
      subtitle={tr('auth.signInScreen.subtitle')}
      footer={
        <Label muted>
          {tr('auth.signInScreen.newHere')} <TextLink title={tr('auth.signInScreen.createLink')} onPress={() => router.replace({ pathname: '/sign-up', params: next ? { next } : {} })} />
        </Label>
      }>
      {errors.form ? <FormMessage kind="error">{errors.form}</FormMessage> : null}
      <TextField
        label={tr('auth.signInScreen.login')}
        value={login}
        onChangeText={setLogin}
        error={errors.login}
        autoComplete="username"
        textContentType="username"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        submitBehavior="submit"
      />
      <TextField
        ref={passwordRef}
        label={tr('auth.password')}
        password
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Label muted size={14}>
        <TextLink title={tr('auth.signInScreen.forgot')} onPress={() => router.push({ pathname: '/forgot-password', params: login.includes('@') ? { email: login } : {} })} />
      </Label>
      <Button title={busy ? tr('auth.signInScreen.busy') : tr('auth.signIn')} onPress={submit} disabled={busy} />
      {status !== 'guest' ? <Divider label={tr('common.or')} /> : null}
      {/* Its own "or" divider only when the guest option below isn't shown. */}
      <SocialSignIn divider={status === 'guest'} onSignedIn={() => leaveAuth(next)} />
      {status !== 'guest' ? (
        <>
          <Button
            title={tr('auth.continueAsGuest')}
            variant="secondary"
            onPress={async () => {
              await continueAsGuest();
              router.replace('/');
            }}
          />
        </>
      ) : null}
    </AuthShell>
  );
}
