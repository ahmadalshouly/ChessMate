import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import type { TextInputInstance } from 'react-native';

import { AuthShell, Divider, FormMessage, TextLink } from '@/components/auth/AuthShell';
import { TextField } from '@/components/auth/TextField';
import { Button, Label } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { toFormError } from '@/lib/auth/errors';
import { safeNext } from '@/lib/auth/navigation';

export default function SignIn() {
  const { signIn, continueAsGuest, status } = useAuth();
  const { next, login: prefill } = useLocalSearchParams<{ next?: string; login?: string }>();
  const [login, setLogin] = useState(prefill ?? '');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ login?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);

  async function submit() {
    const e: typeof errors = {};
    if (!login.trim()) e.login = 'Enter your username or email.';
    if (!password) e.password = 'Enter your password.';
    setErrors(e);
    if (e.login || e.password) return;
    setBusy(true);
    try {
      await signIn(login, password);
      router.replace(safeNext(next));
    } catch (err) {
      const fe = toFormError(err);
      setErrors(fe.field === 'login' || fe.field === 'password' ? { [fe.field]: fe.message } : { form: fe.message });
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to play rated games and keep your history."
      footer={
        <Label muted>
          New to ChessMate? <TextLink title="Create an account" onPress={() => router.replace({ pathname: '/sign-up', params: next ? { next } : {} })} />
        </Label>
      }>
      {errors.form ? <FormMessage kind="error">{errors.form}</FormMessage> : null}
      <TextField
        label="Username or email"
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
        label="Password"
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
        <TextLink title="Forgot password?" onPress={() => router.push({ pathname: '/forgot-password', params: login.includes('@') ? { email: login } : {} })} />
      </Label>
      <Button title={busy ? 'Signing in…' : 'Sign in'} onPress={submit} disabled={busy} />
      {status !== 'guest' ? (
        <>
          <Divider label="or" />
          <Button
            title="Continue as guest"
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
