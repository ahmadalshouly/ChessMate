import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AuthShell, FormMessage, TextLink } from '@/components/auth/AuthShell';
import { TextField } from '@/components/auth/TextField';
import { Button, Label } from '@/components/ui';
import { authApi, validateEmail } from '@/lib/auth';
import { toFormError } from '@/lib/auth/errors';
import { useT } from '@/i18n';

export default function ForgotPassword() {
  const { email: prefill } = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(prefill ?? '');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tr = useT();

  async function submit() {
    const v = email.trim();
    const invalid = validateEmail(v);
    setError(invalid);
    setFormError(null);
    if (invalid) return;
    setBusy(true);
    try {
      await authApi.forgotPassword(v);
      setSentTo(v);
    } catch (err) {
      setFormError(toFormError(err).message);
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <AuthShell
        title={tr('auth.forgot.checkEmail')}
        footer={
          <Label muted>
            <TextLink title={tr('auth.backToSignIn')} onPress={() => router.replace('/sign-in')} />
          </Label>
        }>
        <FormMessage kind="info">
          {tr('auth.forgot.sent', { email: sentTo })}
        </FormMessage>
        <Label muted size={14}>
          {tr('auth.forgot.nothing')}
        </Label>
        <Button title={tr('auth.forgot.sendAgain')} variant="secondary" onPress={() => setSentTo(null)} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={tr('auth.forgot.title')}
      subtitle={tr('auth.forgot.subtitle')}
      footer={
        <Label muted>
          {tr('auth.forgot.remembered')} <TextLink title={tr('auth.signIn')} onPress={() => router.replace('/sign-in')} />
        </Label>
      }>
      {formError ? <FormMessage kind="error">{formError}</FormMessage> : null}
      <TextField
        label={tr('auth.email')}
        value={email}
        onChangeText={setEmail}
        error={error}
        keyboardType="email-address"
        inputMode="email"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={submit}
      />
      <Button title={busy ? tr('auth.forgot.busy') : tr('auth.forgot.submit')} onPress={submit} disabled={busy} />
    </AuthShell>
  );
}
