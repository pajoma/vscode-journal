const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const MAX_RANGE_DAYS = 92;

export interface DateParts {
  year: string;
  month: string;
  day: string;
}

export function parseIsoDate(value: string): DateParts {
  const m = ISO_DATE.exec(value);
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : undefined;
  if (!m || !d || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) {
    throw new Error(`Invalid date '${value}', expected YYYY-MM-DD`);
  }
  return { year: m[1], month: m[2], day: m[3] };
}

export function today(timezone: string): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function addDays(iso: string, days: number): string {
  const { year, month, day } = parseIsoDate(iso);
  return new Date(Date.UTC(+year, +month - 1, +day + days)).toISOString().slice(0, 10);
}

/** Accepts YYYY-MM-DD or the keywords today / yesterday / tomorrow. */
export function resolveDate(value: string | undefined, timezone: string): string {
  const v = (value ?? "today").trim().toLowerCase();
  const base = today(timezone);
  if (v === "today") return base;
  if (v === "yesterday") return addDays(base, -1);
  if (v === "tomorrow") return addDays(base, 1);
  parseIsoDate(v);
  return v;
}

export function dateRange(from: string, to: string): string[] {
  if (from > to) throw new Error(`'from' (${from}) is after 'to' (${to})`);
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    days.push(d);
    if (days.length > MAX_RANGE_DAYS) {
      throw new Error(`Date range exceeds ${MAX_RANGE_DAYS} days`);
    }
  }
  return days;
}

/** Title line as written by the extension's default entry template, e.g. "Wednesday, October 07 2026". */
export function entryTitle(iso: string): string {
  const { year, month, day } = parseIsoDate(iso);
  const date = new Date(Date.UTC(+year, +month - 1, +day));
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(date);
  return `${fmt({ weekday: "long" })}, ${fmt({ month: "long" })} ${day} ${year}`;
}

export function parseTime(value: string): number {
  const m = TIME.exec(value.trim());
  if (!m) throw new Error(`Invalid time '${value}', expected HH:MM`);
  return +m[1] * 60 + +m[2];
}

export function formatTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
