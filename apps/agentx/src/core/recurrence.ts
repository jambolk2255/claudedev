/**
 * A small RRULE subset, evaluated in local time (so "every Monday 9:00" stays 9:00):
 * FREQ=DAILY|WEEKLY|MONTHLY|YEARLY; INTERVAL=n; BYDAY=MO,TU,…; BYMONTHDAY=1..31|-1; UNTIL=YYYYMMDD
 */

const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

export interface Rule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  byDay: number[];
  byMonthDay: number[];
  until: Date | null;
}

export function parseRule(rrule: string): Rule | null {
  const parts = new Map<string, string>();
  for (const p of rrule.replace(/^RRULE:/i, "").split(";")) {
    const [k, v] = p.split("=");
    if (k && v) parts.set(k.trim().toUpperCase(), v.trim().toUpperCase());
  }
  const freq = parts.get("FREQ");
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") return null;
  const interval = Math.max(1, Number(parts.get("INTERVAL") ?? 1) || 1);
  const byDay = (parts.get("BYDAY") ?? "")
    .split(",")
    .map((d) => DAYS.indexOf(d.replace(/^[+-]?\d+/, "") as (typeof DAYS)[number]))
    .filter((i) => i >= 0);
  const byMonthDay = (parts.get("BYMONTHDAY") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n !== 0 && n >= -31 && n <= 31);
  const u = /^(\d{4})(\d{2})(\d{2})/.exec(parts.get("UNTIL") ?? "");
  const until = u ? new Date(Number(u[1]), Number(u[2]) - 1, Number(u[3]), 23, 59, 59) : null;
  return { freq, interval, byDay, byMonthDay, until };
}

const lastDayOfMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const monthsBetween = (a: Date, b: Date) => (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
const daysBetween = (a: Date, b: Date) =>
  Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000);

function matches(rule: Rule, start: Date, d: Date): boolean {
  switch (rule.freq) {
    case "DAILY":
      return daysBetween(start, d) % rule.interval === 0;
    case "WEEKLY": {
      const days = rule.byDay.length ? rule.byDay : [start.getDay()];
      if (!days.includes(d.getDay())) return false;
      // Week index counted from the week (Sunday-based) containing `start`.
      const startWeek = new Date(start.getFullYear(), start.getMonth(), start.getDate() - start.getDay());
      return Math.floor(daysBetween(startWeek, d) / 7) % rule.interval === 0;
    }
    case "MONTHLY": {
      if (monthsBetween(start, d) % rule.interval !== 0) return false;
      const days = rule.byMonthDay.length ? rule.byMonthDay : [start.getDate()];
      const last = lastDayOfMonth(d.getFullYear(), d.getMonth());
      // A rule for the 31st falls on the last day of shorter months.
      return days.some((md) => (md > 0 ? Math.min(md, last) : last + md + 1) === d.getDate());
    }
    case "YEARLY":
      return (
        (d.getFullYear() - start.getFullYear()) % rule.interval === 0 &&
        d.getMonth() === start.getMonth() &&
        d.getDate() === Math.min(start.getDate(), lastDayOfMonth(d.getFullYear(), d.getMonth()))
      );
  }
}

/** Next occurrence strictly after `after`, keeping the time of day of `start`. Null when the rule ended. */
export function nextOccurrence(rrule: string, start: Date, after: Date): Date | null {
  const rule = parseRule(rrule);
  if (!rule) return null;
  const from = after < start ? new Date(start.getTime() - 1) : after;
  const limit = 366 * 5 * rule.interval;
  for (let i = 0; i <= limit; i++) {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i, start.getHours(), start.getMinutes(), start.getSeconds());
    if (day <= from) continue;
    if (rule.until && day > rule.until) return null;
    if (matches(rule, start, day)) return day;
  }
  return null;
}

export function describeRule(rrule: string, lang: "si" | "en"): string {
  const rule = parseRule(rrule);
  if (!rule) return rrule;
  const si = lang === "si";
  const dayNames = si ? ["ඉරිදා", "සඳුදා", "අඟහරුවාදා", "බදාදා", "බ්‍රහස්පතින්දා", "සිකුරාදා", "සෙනසුරාදා"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const n = rule.interval;
  switch (rule.freq) {
    case "DAILY":
      return n === 1 ? (si ? "හැම දිනම" : "Every day") : si ? `දින ${n}කට වරක්` : `Every ${n} days`;
    case "WEEKLY": {
      const days = rule.byDay.map((d) => dayNames[d]).join(", ");
      const base = n === 1 ? (si ? "හැම සතියෙම" : "Every week") : si ? `සති ${n}කට වරක්` : `Every ${n} weeks`;
      return days ? `${base} · ${days}` : base;
    }
    case "MONTHLY": {
      const base = n === 1 ? (si ? "හැම මාසෙම" : "Every month") : si ? `මාස ${n}කට වරක්` : `Every ${n} months`;
      return rule.byMonthDay.length ? `${base} · ${rule.byMonthDay.join(", ")}` : base;
    }
    case "YEARLY":
      return si ? "හැම අවුරුද්දෙම" : "Every year";
  }
}
