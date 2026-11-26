import { AntDesign } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { Divider, FormMessage } from '@/components/auth/AuthShell';
import { ApiError, authApi, useAuth, type OAuthProvider } from '@/lib/auth';
import { AppleWebCancelled, appleServicesId, appleWebSupported, preloadAppleWeb, signInWithAppleWeb } from '@/lib/auth/appleWeb';
import { GoogleCancelled, GoogleSetupError, googleBlockedByExpoGo, googleNativeReady, signInWithGoogleNative } from '@/lib/auth/googleNative';
import { Button, useAppTheme } from '@/ui';
import { translate } from '@/i18n';

// Closes the Google pop-up on web once it lands back on the app.
WebBrowser.maybeCompleteAuthSession();

/** Web uses Google's OAuth pop-up (expo-auth-session); Android and iPhone use Google's native SDK. */
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined;

function googleReadyHere(): boolean {
  if (Platform.OS === 'web') return !!GOOGLE_WEB_CLIENT_ID;
  return googleNativeReady();
}

function messageFor(provider: OAuthProvider, e: unknown): string {
  const name = provider === 'google' ? 'Google' : 'Apple';
  if (e instanceof GoogleSetupError) return translate('auth.social.googleSetup');
  if (e instanceof ApiError) {
    if (e.code === 'network') return e.message;
    if (e.code === 'not_configured') return translate('auth.social.notConfigured', { provider: name });
    if (e.code === 'rate_limited') return translate('auth.errors.rate_limited');
  }
  return translate('auth.social.failed', { provider: name });
}

/**
 * "Continue with Google" and "Sign in with Apple", shown under the email form.
 * Each button only appears where it can work: the server has it turned on, and
 * the platform has what it needs (Apple: iOS, or web with a Services ID over
 * https; Google: the client ID this platform needs). In Expo Go on a phone the
 * Google button only explains that it needs an installed build.
 */
export function SocialSignIn({ onSignedIn, divider = true }: { onSignedIn: () => void; divider?: boolean }) {
  const [server, setServer] = useState<Record<OAuthProvider, boolean> | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    authApi
      .providers()
      .then((r) => live && setServer(r.providers))
      .catch(() => live && setServer({ google: false, apple: false }));
    if (Platform.OS === 'web') {
      // Checked after mount: the static web build renders without a location.
      const ok = !!appleServicesId && appleWebSupported();
      if (ok) preloadAppleWeb();
      void Promise.resolve().then(() => live && setAppleAvailable(ok));
    } else if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync()
        .then((ok) => live && setAppleAvailable(ok))
        .catch(() => {});
    }
    return () => {
      live = false;
    };
  }, []);

  const showGoogle = !!server?.google && (googleBlockedByExpoGo || googleReadyHere());
  const showApple = !!server?.apple && appleAvailable;
  if (!showGoogle && !showApple) return null;

  return (
    <View style={{ gap: 12 }}>
      {divider ? <Divider label={translate('common.or')} /> : null}
      {error ? <FormMessage kind="error">{error}</FormMessage> : null}
      {showApple ? (
        Platform.OS === 'web' ? <AppleWebButton onError={setError} onSignedIn={onSignedIn} /> : <AppleButton onError={setError} onSignedIn={onSignedIn} />
      ) : null}
      {showGoogle ? (
        googleBlockedByExpoGo ? (
          <Button
            title={translate('auth.social.google')}
            variant="secondary"
            fullWidth
            leftIcon={<GoogleIcon />}
            onPress={() => setError(translate('auth.social.expoGo'))}
          />
        ) : Platform.OS === 'web' ? (
          <GoogleWebButton onError={setError} onSignedIn={onSignedIn} />
        ) : (
          <GoogleNativeButton onError={setError} onSignedIn={onSignedIn} />
        )
      ) : null}
    </View>
  );
}

function GoogleIcon() {
  const { colors } = useAppTheme();
  return <AntDesign name="google" size={18} color={colors.text} />;
}

function GoogleWebButton({ onError, onSignedIn }: { onError: (m: string | null) => void; onSignedIn: () => void }) {
  const { signInWithProvider } = useAuth();
  const [busy, setBusy] = useState(false);
  const [request, , promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    selectAccount: true,
    // Return to the site root (add exactly this URL as an authorized redirect URI in Google Cloud).
    ...(typeof window !== 'undefined' ? { redirectUri: window.location.origin } : null),
  });

  async function signIn() {
    onError(null);
    setBusy(true);
    try {
      const result = await promptAsync();
      if (result.type !== 'success') {
        setBusy(false);
        if (result.type === 'error') onError(messageFor('google', result.error));
        return;
      }
      const idToken = result.params.id_token ?? result.authentication?.idToken;
      if (!idToken) throw new Error('No ID token');
      await signInWithProvider('google', idToken);
      onSignedIn();
    } catch (e) {
      setBusy(false);
      onError(messageFor('google', e));
    }
  }

  return (
    <Button
      title={translate('auth.social.google')}
      variant="secondary"
      fullWidth
      loading={busy}
      disabled={!request}
      leftIcon={<GoogleIcon />}
      onPress={signIn}
    />
  );
}

function GoogleNativeButton({ onError, onSignedIn }: { onError: (m: string | null) => void; onSignedIn: () => void }) {
  const { signInWithProvider } = useAuth();
  const [busy, setBusy] = useState(false);

  async function signIn() {
    if (busy) return;
    onError(null);
    setBusy(true);
    try {
      const { idToken, fullName } = await signInWithGoogleNative();
      await signInWithProvider('google', idToken, fullName);
      onSignedIn();
    } catch (e) {
      setBusy(false);
      if (e instanceof GoogleCancelled) return;
      onError(messageFor('google', e));
    }
  }

  return <Button title={translate('auth.social.google')} variant="secondary" fullWidth loading={busy} leftIcon={<GoogleIcon />} onPress={signIn} />;
}

/** Apple on the web: Apple's own pop-up, styled like the other buttons with Apple's logo. */
function AppleWebButton({ onError, onSignedIn }: { onError: (m: string | null) => void; onSignedIn: () => void }) {
  const { signInWithProvider } = useAuth();
  const { colors } = useAppTheme();
  const [busy, setBusy] = useState(false);

  async function signIn() {
    if (busy) return;
    onError(null);
    setBusy(true);
    try {
      const { idToken, fullName } = await signInWithAppleWeb();
      await signInWithProvider('apple', idToken, fullName);
      onSignedIn();
    } catch (e) {
      setBusy(false);
      if (e instanceof AppleWebCancelled) return;
      onError(messageFor('apple', e));
    }
  }

  return (
    <Button
      title={translate('auth.social.apple')}
      variant="secondary"
      fullWidth
      loading={busy}
      leftIcon={<AntDesign name="apple" size={18} color={colors.text} />}
      onPress={signIn}
    />
  );
}

function AppleButton({ onError, onSignedIn }: { onError: (m: string | null) => void; onSignedIn: () => void }) {
  const { signInWithProvider } = useAuth();
  const { scheme } = useAppTheme();
  const [busy, setBusy] = useState(false);

  async function signIn() {
    if (busy) return;
    onError(null);
    setBusy(true);
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      });
      if (!cred.identityToken) throw new Error('No identity token');
      // Apple sends the name only the first time; the server uses it for the username.
      const fullName = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ') || undefined;
      await signInWithProvider('apple', cred.identityToken, fullName);
      onSignedIn();
    } catch (e) {
      setBusy(false);
      if ((e as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return;
      onError(messageFor('apple', e));
    }
  }

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      // Monochrome brand: white button on dark, black on light.
      buttonStyle={scheme === 'dark' ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={14}
      style={{ height: 44, alignSelf: 'stretch', opacity: busy ? 0.6 : 1 }}
      onPress={signIn}
    />
  );
}
