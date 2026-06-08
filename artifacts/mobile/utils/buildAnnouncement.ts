import { AppSettings } from "@/types/settings";
import { Task } from "@/types/task";

export type AnnouncementPeriod = "morning" | "afternoon" | "evening";

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n !== 1 ? "s" : ""}`;
}

function formatShortTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${m.toString().padStart(2, "0")}${suffix}`;
}

// Oxford-comma list: "A", "A, and B", "A, B, and C"
function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return items.slice(0, -1).join(", ") + ", and " + items[items.length - 1];
}

// Name up to `max` tasks; append "and N more" if the list is longer
function nameImportant(tasks: Task[], label: (t: Task) => string, max = 3): string {
  const named = tasks.slice(0, max).map(label);
  const extra = tasks.length - max;
  if (extra > 0) named.push(`${extra} more`);
  return joinList(named);
}

function taskLabel(t: Task, now: Date): string {
  const isOverdue = new Date(t.hardDeadline) < now;
  return isOverdue
    ? `${t.description} (overdue)`
    : `${t.description} by ${formatShortTime(t.targetDate)}`;
}

// Deduplicate by id (used when merging today-by-target + overdue lists)
function dedup(tasks: Task[]): Task[] {
  return [...new Map(tasks.map((t) => [t.id, t])).values()];
}

/**
 * Immediate on-demand summary: important missed, completed today,
 * important still ahead, total incomplete today.
 */
export function buildSummary(tasks: Task[], settings: AppSettings): string {
  const now = new Date();
  const name = settings.userName ? ` ${settings.userName}` : "";

  const active = tasks.filter((t) => !t.isCompleted);
  const completedToday = tasks.filter(
    (t) => t.isCompleted && t.completedAt && isSameDay(new Date(t.completedAt), now)
  );
  const importantMissed = active.filter(
    (t) => t.isImportant && new Date(t.hardDeadline) < now
  );
  const importantAhead = active.filter(
    (t) =>
      t.isImportant &&
      new Date(t.hardDeadline) >= now &&
      (isSameDay(new Date(t.targetDate), now) || isSameDay(new Date(t.hardDeadline), now))
  );
  const incompleteToday = active.filter(
    (t) =>
      isSameDay(new Date(t.targetDate), now) ||
      isSameDay(new Date(t.hardDeadline), now) ||
      new Date(t.hardDeadline) < now
  );

  const parts: string[] = [];

  if (completedToday.length > 0) {
    parts.push(`You completed ${plural(completedToday.length, "task")} today.`);
  }
  if (importantMissed.length > 0) {
    const listed = nameImportant(importantMissed, (t) => t.description);
    const was = importantMissed.length === 1 ? "was" : "were";
    parts.push(
      `${plural(importantMissed.length, "important task")} ${was} missed: ${listed}.`
    );
  }
  if (importantAhead.length > 0) {
    const listed = nameImportant(
      importantAhead,
      (t) => `${t.description} by ${formatShortTime(t.targetDate)}`
    );
    parts.push(
      `${importantAhead.length === 1 ? "Important task" : "Important tasks"} still ahead: ${listed}.`
    );
  }
  if (incompleteToday.length > 0) {
    parts.push(`${plural(incompleteToday.length, "task")} still incomplete today.`);
  }

  if (parts.length === 0) {
    return `Here's your summary${name}! Nothing pending. Great work!`;
  }
  return `Here's your summary${name}! ${parts.join(" ")}`;
}

export function buildAnnouncement(
  tasks: Task[],
  settings: AppSettings,
  period: AnnouncementPeriod
): string {
  const now = new Date();
  const name = settings.userName ? ` ${settings.userName}` : "";

  const active = tasks.filter((t) => !t.isCompleted);
  const overdue = active.filter((t) => new Date(t.hardDeadline) < now);

  switch (period) {
    case "morning": {
      const todayByTarget = active.filter((t) => isSameDay(new Date(t.targetDate), now));
      const allToday = dedup([...todayByTarget, ...overdue]);
      const total = allToday.length;

      if (total === 0) {
        return `Good morning${name}! Your schedule is clear today. Enjoy your day!`;
      }

      const importantToday = allToday.filter((t) => t.isImportant);
      const hardDeadlinesToday = allToday.filter((t) =>
        isSameDay(new Date(t.hardDeadline), now)
      );

      let text = `Good morning${name}! You have ${plural(total, "task")} today.`;

      if (importantToday.length > 0) {
        const verb = importantToday.length === 1 ? "is" : "are";
        const listed = nameImportant(importantToday, (t) => taskLabel(t, now));
        text += ` Your important ${importantToday.length === 1 ? "task" : "tasks"} ${verb}: ${listed}.`;
      }

      if (hardDeadlinesToday.length > 0) {
        text += ` ${plural(hardDeadlinesToday.length, "task")} ${
          hardDeadlinesToday.length === 1 ? "has a hard deadline" : "have hard deadlines"
        } today.`;
      }

      return text;
    }

    case "afternoon": {
      const completedToday = tasks.filter(
        (t) => t.isCompleted && t.completedAt && isSameDay(new Date(t.completedAt), now)
      );
      const todayActive = active.filter(
        (t) =>
          isSameDay(new Date(t.targetDate), now) || isSameDay(new Date(t.hardDeadline), now)
      );
      const pending = dedup([...todayActive, ...overdue]);

      const completedImportant = completedToday.filter((t) => t.isImportant);
      const pendingImportant = pending.filter((t) => t.isImportant);
      const hardDeadlinesLeft = pending.filter((t) =>
        isSameDay(new Date(t.hardDeadline), now)
      );

      if (pending.length === 0 && completedToday.length === 0) {
        return `Good afternoon${name}! You're all caught up. Keep it up!`;
      }

      let text = `Good afternoon${name}!`;

      if (completedToday.length > 0) {
        text += ` You've completed ${plural(completedToday.length, "task")} so far.`;
      }
      if (pending.length > 0) {
        text += ` ${plural(pending.length, "task")} still pending.`;
      }

      // Blend completed and pending important tasks in one sentence
      if (completedImportant.length > 0 || pendingImportant.length > 0) {
        const parts: string[] = [
          ...completedImportant
            .slice(0, 2)
            .map((t) => `${t.description} is done`),
          ...pendingImportant
            .slice(0, 2)
            .map((t) => `${t.description} is still pending by ${formatShortTime(t.targetDate)}`),
        ];
        const extra =
          completedImportant.length +
          pendingImportant.length -
          parts.length;
        if (extra > 0) parts.push(`${extra} more important`);
        text += ` Your important tasks: ${joinList(parts)}.`;
      }

      if (hardDeadlinesLeft.length > 0) {
        text += ` ${plural(hardDeadlinesLeft.length, "hard deadline")} remaining today.`;
      }

      return text;
    }

    case "evening": {
      const completedToday = tasks.filter(
        (t) => t.isCompleted && t.completedAt && isSameDay(new Date(t.completedAt), now)
      );
      const todayActive = active.filter(
        (t) =>
          isSameDay(new Date(t.targetDate), now) || isSameDay(new Date(t.hardDeadline), now)
      );
      const missed = dedup([...todayActive, ...overdue]);

      const completedImportant = completedToday.filter((t) => t.isImportant);
      const missedImportant = missed.filter((t) => t.isImportant);

      if (completedToday.length === 0 && missed.length === 0) {
        return `Good evening${name}! Nothing on the schedule today. Rest up for tomorrow!`;
      }

      let text = `Good evening${name}!`;

      if (completedToday.length > 0) {
        text += ` You completed ${plural(completedToday.length, "task")} today`;
        if (completedImportant.length > 0) {
          const listed = nameImportant(completedImportant, (t) => t.description);
          text += `, including ${listed}`;
        }
        text += ".";
      }

      if (missed.length > 0) {
        if (missedImportant.length > 0) {
          const listed = nameImportant(missedImportant, (t) => t.description);
          const was = missedImportant.length === 1 ? "was" : "were";
          text += ` ${plural(missedImportant.length, "important task")} ${was} not completed: ${listed}.`;
        } else {
          const was = missed.length === 1 ? "was" : "were";
          text += ` ${plural(missed.length, "task")} ${was} not completed.`;
        }
      } else {
        text += " Great work today!";
      }

      return text;
    }
  }
}
