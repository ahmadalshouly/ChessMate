/** The countdown's end time as staff type it in Admin → Maintenance, in this device's time zone. */

const pad = (n: number) => String(n).padStart(2, '0');
/** "2026-12-01 18:00" in this device's time zone. */
export const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** Reads "YYYY-MM-DD HH:MM" (or with a T) as local time; null when it isn't a real time. */
export const parseLocalInput = (s: string): number | null => {
  const m = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})\s*$/.exec(s);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  const date = new Date(y, mo - 1, d, h, mi);
  return date.getMonth() === mo - 1 && date.getDate() === d && h < 24 ? date.getTime() : null;
};
