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

export function buildAnnouncement(
  tasks: Task[],
  settings: AppSettings,
  period: AnnouncementPeriod
): string {
  const now = new Date();
  const name = settings.userName ? `, ${settings.userName}` : "";

  const active = tasks.filter((t) => !t.isCompleted);
  const overdue = active.filter((t) => new Date(t.hardDeadline) < now);

  switch (period) {
    case "morning": {
      const noon = new Date(now);
      noon.setHours(12, 0, 0, 0);
      const todayActive = active.filter((t) => isSameDay(new Date(t.targetDate), now));
      const total = todayActive.length + overdue.length;

      if (total === 0) {
        return `Good morning${name}! Your schedule is clear today. Enjoy your day!`;
      }

      const beforeNoon = todayActive.filter((t) => new Date(t.targetDate) < noon).length;
      let text = `Good morning${name}! You have ${plural(total, "task")} today`;
      if (beforeNoon > 0) text += `, ${plural(beforeNoon, "due")} before noon`;
      text += ".";
      if (overdue.length > 0) {
        text += ` ${plural(overdue.length, "overdue task")} also ${overdue.length === 1 ? "needs" : "need"} attention.`;
      }
      return text;
    }

    case "afternoon": {
      const todayActive = active.filter(
        (t) => isSameDay(new Date(t.targetDate), now) || isSameDay(new Date(t.hardDeadline), now)
      );
      const remaining = todayActive.length + overdue.length;
      const urgentToday = todayActive.filter((t) => isSameDay(new Date(t.hardDeadline), now)).length;

      if (remaining === 0) {
        return `Good afternoon${name}! You're all caught up on today's tasks. Keep it up!`;
      }

      let text = `Good afternoon${name}! You have ${plural(remaining, "task")} still pending`;
      if (urgentToday > 0) {
        text += `, ${plural(urgentToday, "due")} by end of day`;
      }
      text += ".";
      return text;
    }

    case "evening": {
      const completedToday = tasks.filter(
        (t) => t.isCompleted && t.completedAt && isSameDay(new Date(t.completedAt), now)
      ).length;
      const todayActive = active.filter(
        (t) => isSameDay(new Date(t.targetDate), now) || isSameDay(new Date(t.hardDeadline), now)
      );
      const remaining = todayActive.length + overdue.length;

      if (completedToday === 0 && remaining === 0) {
        return `Good evening${name}! Nothing on the schedule today. Rest up for tomorrow!`;
      }

      if (completedToday > 0) {
        let text = `Good evening${name}! You completed ${plural(completedToday, "task")} today.`;
        if (remaining > 0) {
          text += ` ${plural(remaining, "task")} ${remaining === 1 ? "is" : "are"} still pending.`;
        }
        return text;
      }

      return `Good evening${name}! You have ${plural(remaining, "pending task")} today. Finish strong!`;
    }
  }
}
