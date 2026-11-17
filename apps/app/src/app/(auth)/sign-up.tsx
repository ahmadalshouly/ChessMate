import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import type { TextInputInstance } from 'react-native';

import { AuthShell, FormMessage, TextLink } from '@/components/auth/AuthShell';
import { StrengthMeter, TextField } from '@/components/auth/TextField';
import { Button, Label } from '@/components/ui';
import { passwordStrength, useAuth, validateEmail, validatePassword, validateUsername } from '@/lib/auth';
import { toFormError } from '@/lib/auth/errors';
import { safeNext } from '@/lib/auth/navigation';

type Field = 'username' | 'email' | 'password';

export default function SignUp() {
  const { signUp } = useAuth();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [values, setValues] = useState<Record<Field, string>>({ username: '', email: '', password: '' });
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Partial<Record<Field | 'form', string>>>({});
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  const local: Record<Field, string | null> = {
    username: validateUsername(values.username),
    email: validateEmail(values.email.trim()),
    password: validatePassword(values.password),
  };
  const errorFor = (f: Field) => serverErrors[f] ?? (touched[f] ? local[f] : null);

  const set = (f: Field) => (v: string) => {
    setValues((s) => ({ ...s, [f]: v }));
    if (serverErrors[f] || serverErrors.form) setServerErrors({});
  };

  async function submit() {
    setTouched({ username: true, email: true, password: true });
    if (local.username || local.email || local.password) return;
    setBusy(true);
    try {
      await signUp(values);
      router.replace(safeNext(next));
    } catch (err) {
      const fe = toFormError(err);
      const f = fe.field as Field | undefined;
      setServerErrors(f && f in values ? { [f]: fe.message } : { form: fe.message });
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Free forever. Get a rating, game history and coaching."
      footer={
        <Label muted>
          Already have an account? <TextLink title="Sign in" onPress={() => router.replace({ pathname: '/sign-in', params: next ? { next } : {} })} />
        </Label>
      }>
      {serverErrors.form ? <FormMessage kind="error">{serverErrors.form}</FormMessage> : null}
      <TextField
        label="Username"
        value={values.username}
        onChangeText={set('username')}
        onBlur={() => setTouched((s) => ({ ...s, username: true }))}
        error={errorFor('username')}
        hint="3 to 20 letters, numbers or underscores. Shown to opponents."
        autoComplete="username-new"
        textContentType="username"
        maxLength={20}
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
        submitBehavior="submit"
      />
      <TextField
        ref={emailRef}
        label="Email"
        value={values.email}
        onChangeText={set('email')}
        onBlur={() => setTouched((s) => ({ ...s, email: true }))}
        error={errorFor('email')}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        inputMode="email"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        submitBehavior="submit"
      />
      <TextField
        ref={passwordRef}
        label="Password"
        password
        value={values.password}
        onChangeText={set('password')}
        onBlur={() => setTouched((s) => ({ ...s, password: true }))}
        error={errorFor('password')}
        hint="At least 8 characters."
        autoComplete="new-password"
        textContentType="newPassword"
        passwordRules="minlength: 8;"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <StrengthMeter score={passwordStrength(values.password)} visible={values.password.length > 0} />
      <Button title={busy ? 'Creating account…' : 'Create account'} onPress={submit} disabled={busy} />
      <Label muted size={12}>
        By creating an account you agree to play fair. Engine assistance in live games is not allowed.
      </Label>
    </AuthShell>
  );
}
