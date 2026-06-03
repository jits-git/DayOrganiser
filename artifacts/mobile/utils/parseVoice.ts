import * as chrono from "chrono-node";

export interface ParsedVoiceInput {
  description: string;
  targetDate: Date;
  hardDeadline: Date;
}

export function parseVoiceTranscript(text: string): ParsedVoiceInput {
  const now = new Date();
  const results = chrono.parse(text, now, { forwardDate: true });

  const dates = results
    .map((r) => r.start.date())
    .sort((a, b) => a.getTime() - b.getTime());

  // Remove date phrases from description (reverse index order to preserve positions)
  let description = text;
  const sortedByIndex = [...results].sort((a, b) => b.index - a.index);
  for (const p of sortedByIndex) {
    description =
      description.substring(0, p.index) +
      description.substring(p.index + p.text.length);
  }

  description = description
    .replace(/\s+/g, " ")
    .replace(/[,;:]+\s*$/, "")
    .replace(/^\s*[,;:]+/, "")
    .replace(/\s+(by|at|on|deadline|before)\s*$/i, "")
    .trim();

  const targetDate = dates[0] ?? new Date(now.getTime() + 60 * 60 * 1000);
  const rawDeadline = dates[1];
  const hardDeadline =
    rawDeadline && rawDeadline > targetDate
      ? rawDeadline
      : new Date(targetDate.getTime() + 2 * 60 * 60 * 1000);

  return {
    description: description || text,
    targetDate,
    hardDeadline,
  };
}

export function formatParsedDate(d: Date): string {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const timeStr = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (sameDay(d, now)) return `Today at ${timeStr}`;
  if (sameDay(d, tomorrow)) return `Tomorrow at ${timeStr}`;

  return (
    d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) +
    ` at ${timeStr}`
  );
}
