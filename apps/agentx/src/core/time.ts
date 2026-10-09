/** Date helpers in the phone's local time zone (Sri Lanka has no DST, but nothing here assumes it). */

const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, "0");

/** `2026-10-09T10:00:00+05:30` — local wall time with the offset, which both AIs and `Date` understand. */
export function toLocalISO(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`
  );
}

/** `YYYY-MM-DD` in local time. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function addMinutes(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 60_000);
}

/** Parse `HH:mm` into minutes after midnight. */
export function hm(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** True when `d` falls inside quiet hours (which may wrap past midnight). */
export function inQuietHours(d: Date, start: string, end: string): boolean {
  const m = minutesOfDay(d);
  const s = hm(start);
  const e = hm(end);
  if (s === e) return false;
  return s < e ? m >= s && m < e : m >= s || m < e;
}

/** Move `d` to the end of quiet hours if it falls inside them. */
export function afterQuietHours(d: Date, start: string, end: string): Date {
  if (!inQuietHours(d, start, end)) return d;
  const e = hm(end);
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(e / 60), e % 60);
  return r <= d ? addDays(r, 1) : r;
}

/** Parse an ISO-ish string from the AI. Accepts dates without time (→ 09:00 local). Returns null if invalid. */
export function parseWhen(s: string | null | undefined): { date: Date; allDay: boolean } | null {
  if (!s) return null;
  const trimmed = s.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) {
    const d = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 9, 0);
    return Number.isNaN(d.getTime()) ? null : { date: d, allDay: true };
  }
  // No offset → treat as local wall time.
  const local = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (local) {
    const d = new Date(Number(local[1]), Number(local[2]) - 1, Number(local[3]), Number(local[4]), Number(local[5]), Number(local[6] ?? 0));
    return Number.isNaN(d.getTime()) ? null : { date: d, allDay: false };
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : { date: d, allDay: false };
}

const SI_DAYS = ["ඉරිදා", "සඳුදා", "අඟහරුවාදා", "බදාදා", "බ්‍රහස්පතින්දා", "සිකුරාදා", "සෙනසුරාදා"];
const SI_DAYS_SHORT = ["ඉ", "ස", "අ", "බ", "බ්‍ර", "සි", "සෙ"];
const SI_MONTHS = ["ජනවාරි", "පෙබරවාරි", "මාර්තු", "අප්‍රේල්", "මැයි", "ජූනි", "ජූලි", "අගෝස්තු", "සැප්තැම්බර්", "ඔක්තෝබර්", "නොවැම්බර්", "දෙසැම්බර්"];
const EN_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function weekdayName(d: Date, lang: "si" | "en", short = false): string {
  if (lang === "si") return (short ? SI_DAYS_SHORT : SI_DAYS)[d.getDay()]!;
  const n = EN_DAYS[d.getDay()]!;
  return short ? n.slice(0, 3) : n;
}

export function longDate(d: Date, lang: "si" | "en"): string {
  return lang === "si"
    ? `${weekdayName(d, "si")}, ${SI_MONTHS[d.getMonth()]} ${d.getDate()}`
    : `${weekdayName(d, "en")}, ${EN_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function timeLabel(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
}

/** "අද 10:00 AM", "හෙට", "ඊයේ 5:00 PM", "Fri 3:00 PM", "Oct 21". */
export function relativeLabel(iso: string, allDay: boolean, now: Date, lang: "si" | "en"): string {
  const d = new Date(iso);
  const diff = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86_400_000);
  const words = lang === "si" ? { 0: "අද", 1: "හෙට", 2: "අනිද්දා", [-1]: "ඊයේ" } : ({ 0: "Today", 1: "Tomorrow", [-1]: "Yesterday" } as Record<number, string>);
  let day: string;
  if (words[diff]) day = words[diff]!;
  else if (diff > 1 && diff < 7) day = weekdayName(d, lang);
  else day = lang === "si" ? `${SI_MONTHS[d.getMonth()]} ${d.getDate()}` : `${EN_MONTHS[d.getMonth()]!.slice(0, 3)} ${d.getDate()}`;
  return allDay ? day : `${day} ${timeLabel(d)}`;
}
