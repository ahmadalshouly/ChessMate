import { hasPermission, type AdminMe, type AdminPermission } from '@chessmate/core';
import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { useT } from '@/i18n';
import { useAdminApi, type AdminApi } from '@/lib/adminApi';
import { useAuth } from '@/lib/auth';
import { Button, Row, Screen, Stack, Text } from '@/ui';

import { EmptyState } from './ui';

interface AdminContextValue {
  me: AdminMe;
  api: AdminApi;
  can: (p: AdminPermission) => boolean;
}

const Ctx = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAdmin outside the admin console');
  return v;
}

/**
 * Loads the signed-in account's staff role from the server (the source of
 * truth) and shows a "staff only" screen to everyone else.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const api = useAdminApi();
  const tr = useT();
  const [me, setMe] = useState<AdminMe | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'denied' | 'error'>('loading');

  const load = useCallback(() => {
    if (status === 'loading') return;
    if (status !== 'signedIn') return setState('denied');
    setState('loading');
    api
      .me()
      .then((m) => {
        setMe(m);
        setState('ok');
      })
      .catch((e: { status?: number }) => setState(e?.status === 403 || e?.status === 401 ? 'denied' : 'error'));
  }, [api, status]);

  useEffect(load, [load]);

  const can = useCallback((p: AdminPermission) => hasPermission(me?.role, p), [me]);

  if (state === 'ok' && me) return <Ctx.Provider value={{ me, api, can }}>{children}</Ctx.Provider>;
  return (
    <Screen>
      <Stack flex={1} justify="center" align="center" gap="lg">
        {state === 'loading' ? (
          <Text tone="muted">{tr('admin.gate.loading')}</Text>
        ) : state === 'error' ? (
          <EmptyState icon="cloud-offline-outline" title={tr('admin.common.failed')} action={<Button title={tr('admin.common.retry')} variant="secondary" onPress={load} />} />
        ) : (
          <EmptyState
            icon="shield-outline"
            title={tr('admin.gate.title')}
            body={tr('admin.gate.body')}
            action={
              <Row gap="sm">
                <Button title={tr('admin.gate.home')} variant="secondary" onPress={() => router.replace('/')} />
                {status !== 'signedIn' && <Button title={tr('admin.gate.signIn')} onPress={() => router.push('/sign-in')} />}
              </Row>
            }
          />
        )}
      </Stack>
    </Screen>
  );
}
