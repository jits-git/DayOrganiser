export interface Task {
  id: string;
  description: string;
  detail?: string;
  color?: string;
  isImportant?: boolean;
  targetDate: string;
  hardDeadline: string;
  isCompleted: boolean;
  completedAt?: string;
  notificationId?: string;
  deadlineNotificationId?: string;
  targetOverduePrompted?: boolean;
  deadlineOverduePrompted?: boolean;
}
