/**
 * Web maintenance mode. Staff switch it on in Admin → Maintenance; while it is
 * on, the web app shows only the maintenance page to everyone except admins.
 * The iPhone and Android apps are not affected.
 */
export interface MaintenanceState {
  active: boolean;
  /** Shown as the page heading. Empty: the app's default ("We'll be right back"). */
  title: string;
  /** Shown under the heading. Empty: the app's default text. */
  description: string;
  /** When the countdown runs out, ms since epoch. Null: no countdown. */
  endsAt: number | null;
  /** True: the site opens again by itself when the countdown runs out (launch day). */
  autoEnd: boolean;
  /** Last change, ms since epoch, and who made it. */
  updatedAt: number | null;
  updatedBy: string | null;
}

export const MAINTENANCE_LIMITS = { title: 80, description: 600 } as const;

export const MAINTENANCE_OFF: MaintenanceState = {
  active: false,
  title: '',
  description: '',
  endsAt: null,
  autoEnd: false,
  updatedAt: null,
  updatedBy: null,
};

/** Whether the maintenance page is in force right now (a countdown with autoEnd ends it by itself). */
export function maintenanceInForce(s: Pick<MaintenanceState, 'active' | 'endsAt' | 'autoEnd'> | null | undefined, now: number = Date.now()): boolean {
  if (!s?.active) return false;
  return !(s.autoEnd && s.endsAt != null && s.endsAt <= now);
}

/** Splits the time left into days, hours, minutes and seconds (all zero once it has passed). */
export function countdownParts(
  endsAt: number,
  now: number = Date.now(),
): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
} {
  const left = Math.max(0, Math.floor((endsAt - now) / 1000));
  return {
    days: Math.floor(left / 86_400),
    hours: Math.floor((left % 86_400) / 3600),
    minutes: Math.floor((left % 3600) / 60),
    seconds: left % 60,
    done: left === 0,
  };
}
