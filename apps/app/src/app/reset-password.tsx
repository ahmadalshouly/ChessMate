import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AuthShell, FormMessage, TextLink } from '@/components/auth/AuthShell';
import { StrengthMeter, TextField } from '@/components/auth/TextField';
import { Button, Label } from '@/components/ui';
import { authApi, passwordStrength, validatePassword } from '@/lib/auth';
import { toFormError } from '@/lib/auth/errors';
import { useT } from '@/i18n';

/** Opened from the emailed link: chessmate://reset-password?token=… or https://<site>/reset-password?token=… */
export default function ResetPassword() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string | null; confirm?: string | null; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const tr = useT();

  async function submit() {
    const e = {
      password: validatePassword(password),
      confirm: confirm === password ? null : tr('auth.reset.mismatch'),
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
      <AuthShell title={tr('auth.reset.invalidTitle')} back={false}>
        <FormMessage kind="error">{tr('auth.reset.invalidBody')}</FormMessage>
        <Button title={tr('auth.reset.requestNew')} onPress={() => router.replace('/forgot-password')} />
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title={tr('auth.reset.doneTitle')} back={false}>
        <FormMessage kind="info">{tr('auth.reset.doneBody')}</FormMessage>
        <Button title={tr('auth.signIn')} onPress={() => router.replace('/sign-in')} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={tr('auth.reset.title')}
      back={false}
      footer={
        <Label muted>
          <TextLink title={tr('auth.backToSignIn')} onPress={() => router.replace('/sign-in')} />
        </Label>
      }>
      {errors.form ? <FormMessage kind="error">{errors.form}</FormMessage> : null}
      <TextField
        label={tr('auth.newPassword')}
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
        label={tr('auth.reset.confirm')}
        password
        value={confirm}
        onChangeText={setConfirm}
        error={errors.confirm}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button title={busy ? tr('common.saving') : tr('auth.reset.submit')} onPress={submit} disabled={busy} />
    </AuthShell>
  );
}
