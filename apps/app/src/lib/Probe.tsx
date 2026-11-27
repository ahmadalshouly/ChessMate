import { Profiler, type ReactNode } from 'react';

import { onProbeRender, probing } from './heatProbe';

/** Counts renders of this part of the app for EXPO_PUBLIC_HEAT_TEST=probe; otherwise just its children. */
export function Probe({ id, children }: { id: string; children: ReactNode }) {
  if (!probing) return <>{children}</>;
  return (
    <Profiler id={id} onRender={onProbeRender}>
      {children}
    </Profiler>
  );
}
