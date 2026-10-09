import { relativeLabel, timeLabel } from "./time";
import type { Task } from "./types";
import { overdue, today } from "./views";

const MAX_SPOKEN = 5;

function list(tasks: Task[], now: Date, lang: "si" | "en", withDay: boolean): string {
  const items = tasks.slice(0, MAX_SPOKEN).map((t) => {
    if (!t.dueAt) return t.title;
    const when = withDay ? relativeLabel(t.dueAt, t.allDay, now, lang) : t.allDay ? "" : timeLabel(new Date(t.dueAt));
    return when ? `${t.title} — ${when}` : t.title;
  });
  const rest = tasks.length - items.length;
  if (rest > 0) items.push(lang === "si" ? `තව ${rest}ක් තියෙනවා` : `and ${rest} more`);
  return items.join(lang === "si" ? "; " : "; ");
}

function greeting(now: Date, lang: "si" | "en", name: string): string {
  const h = now.getHours();
  const n = name ? ` ${name}` : "";
  if (lang === "si") return h < 12 ? `සුබ උදෑසනක්${n}!` : h < 17 ? `සුබ දහවලක්${n}!` : `සුබ සන්ධ්‍යාවක්${n}!`;
  return h < 12 ? `Good morning${n}!` : h < 17 ? `Good afternoon${n}!` : `Good evening${n}!`;
}

/** Text spoken by the morning briefing and shown on the Today hero card. */
export function briefingText(tasks: Task[], now: Date, lang: "si" | "en", name = ""): string {
  const od = overdue(tasks, now);
  const td = today(tasks, now).filter((t) => t.status === "open");
  const parts = [greeting(now, lang, name)];
  if (!od.length && !td.length) {
    parts.push(lang === "si" ? "අදට කරන්න දෙයක් දාලා නෑ. Mic එක ඔබලා අලුත් task එකක් කියන්න." : "Nothing is planned for today. Tap the mic to add a task.");
    return parts.join(" ");
  }
  if (td.length)
    parts.push(
      lang === "si" ? `අද කරන්න ${td.length}ක් තියෙනවා: ${list(td, now, lang, false)}.` : `You have ${td.length} for today: ${list(td, now, lang, false)}.`,
    );
  if (od.length)
    parts.push(lang === "si" ? `ඉවර නොකළ ${od.length}ක් තියෙනවා: ${list(od, now, lang, true)}.` : `${od.length} overdue: ${list(od, now, lang, true)}.`);
  return parts.join(" ");
}

/** Evening review: what is still open today. */
export function reviewText(tasks: Task[], now: Date, lang: "si" | "en"): string {
  const left = [...overdue(tasks, now), ...today(tasks, now).filter((t) => t.status === "open")];
  const done = today(tasks, now).filter((t) => t.status === "done").length;
  if (!left.length) return lang === "si" ? `නියමයි! අද වැඩ ${done}ම ඉවරයි.` : `Great — all ${done} tasks done today.`;
  return lang === "si"
    ? `අද ${done}ක් ඉවරයි. තාම ඉතුරු ${left.length}ක්: ${list(left, now, lang, false)}. හෙටට දාන්නද?`
    : `${done} done today. Still open: ${list(left, now, lang, false)}. Move them to tomorrow?`;
}

/** Short headline for the Today card, e.g. "අද කරන්න 5ක් · ඉවර නොකළ 2ක්". */
export function headline(tasks: Task[], now: Date, lang: "si" | "en"): string {
  const od = overdue(tasks, now).length;
  const td = today(tasks, now).filter((t) => t.status === "open").length;
  if (lang === "si") return od ? `අද කරන්න ${td}ක් · ඉවර නොකළ ${od}ක්` : `අද කරන්න ${td}ක්`;
  return od ? `${td} today · ${od} overdue` : `${td} today`;
}
