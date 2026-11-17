import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AuthShell, FormMessage, TextLink } from '@/components/auth/AuthShell';
import { TextField } from '@/components/auth/TextField';
import { Button, Label } from '@/components/ui';
import { authApi, validateEmail } from '@/lib/auth';
import { toFormError } from '@/lib/auth/errors';

export default function ForgotPassword() {
  const { email: prefill } = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(prefill ?? '');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        title="Check your email"
        footer={
          <Label muted>
            <TextLink title="Back to sign in" onPress={() => router.replace('/sign-in')} />
          </Label>
        }>
        <FormMessage kind="info">
          If an account exists for {sentTo}, we've sent a link to reset your password. It expires in an hour.
        </FormMessage>
        <Label muted size={14}>
          Nothing arrived? Check spam, or try again in a minute.
        </Label>
        <Button title="Send again" variant="secondary" onPress={() => setSentTo(null)} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email on your account and we'll send you a reset link."
      footer={
        <Label muted>
          Remembered it? <TextLink title="Sign in" onPress={() => router.replace('/sign-in')} />
        </Label>
      }>
      {formError ? <FormMessage kind="error">{formError}</FormMessage> : null}
      <TextField
        label="Email"
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
      <Button title={busy ? 'Sending…' : 'Send reset link'} onPress={submit} disabled={busy} />
    </AuthShell>
  );
}
