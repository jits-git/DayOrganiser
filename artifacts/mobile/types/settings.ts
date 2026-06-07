export interface NotificationTime {
  hour: number;
  minute: number;
}

export interface AppSettings {
  morningNotification: NotificationTime;
  afternoonNotification: NotificationTime;
  eveningNotification: NotificationTime;
  hardDeadlineOffsetDays: number;
  userName: string;
  assistantName: string;
  onboardingComplete: boolean;
  voiceAnnouncementsEnabled: boolean;
  googleAccessToken?: string;
  googleRefreshToken?: string;
  googleTokenExpiry?: number;
  googleUserEmail?: string;
  lastDriveSync?: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  morningNotification: { hour: 7, minute: 0 },
  afternoonNotification: { hour: 13, minute: 0 },
  eveningNotification: { hour: 22, minute: 0 },
  hardDeadlineOffsetDays: 0,
  userName: "",
  assistantName: "Kate",
  onboardingComplete: false,
  voiceAnnouncementsEnabled: false,
};
