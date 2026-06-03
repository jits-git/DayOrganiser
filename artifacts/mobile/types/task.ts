export interface Task {
  id: string;
  description: string;
  detail?: string;
  color?: string;
  targetDate: string;
  hardDeadline: string;
  isCompleted: boolean;
  completedAt?: string;
  notificationId?: string;
  targetOverduePrompted?: boolean;
  deadlineOverduePrompted?: boolean;
}
