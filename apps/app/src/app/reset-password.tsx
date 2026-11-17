import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AuthShell, FormMessage, TextLink } from '@/components/auth/AuthShell';
import { StrengthMeter, TextField } from '@/components/auth/TextField';
import { Button, Label } from '@/components/ui';
import { authApi, passwordStrength, validatePassword } from '@/lib/auth';
import { toFormError } from '@/lib/auth/errors';

/** Opened from the emailed link: chessmate://reset-password?token=… or https://<site>/reset-password?token=… */
export default function ResetPassword() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string | null; confirm?: string | null; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    const e = {
      password: validatePassword(password),
      confirm: confirm === password ? null : "Passwords don't match.",
    };
    setErrors(e);
    if (e.password || e.confirm || !token) return;
    setBusy(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      const fe = toFormError(err);
      setErrors(fe.field === 'password' ? { password: fe.message } : { form: fe.message });
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthShell title="Link not valid" back={false}>
        <FormMessage kind="error">This reset link is missing its code. Open the link from your email again, or request a new one.</FormMessage>
        <Button title="Request a new link" onPress={() => router.replace('/forgot-password')} />
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Password updated" back={false}>
        <FormMessage kind="info">Your password has been changed. Sign in with your new password.</FormMessage>
        <Button title="Sign in" onPress={() => router.replace('/sign-in')} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      back={false}
      footer={
        <Label muted>
          <TextLink title="Back to sign in" onPress={() => router.replace('/sign-in')} />
        </Label>
      }>
      {errors.form ? <FormMessage kind="error">{errors.form}</FormMessage> : null}
      <TextField
        label="New password"
        password
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
      />
      <StrengthMeter score={passwordStrength(password)} visible={password.length > 0} />
      <TextField
        label="Confirm new password"
        password
        value={confirm}
        onChangeText={setConfirm}
        error={errors.confirm}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button title={busy ? 'Saving…' : 'Update password'} onPress={submit} disabled={busy} />
    </AuthShell>
  );
}
