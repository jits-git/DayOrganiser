import AsyncStorage from "@react-native-async-storage/async-storage";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_NAME = "DayOrganizer";
const BACKUP_FILENAME = "backup.json";

const TASKS_KEY = "@dayorganizer/tasks";
const SETTINGS_KEY = "@dayorganizer/settings";

async function getAccessToken(): Promise<string | null> {
  const stored = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!stored) return null;
  const settings = JSON.parse(stored);
  if (!settings.googleAccessToken) return null;
  // Check expiry with 5-minute buffer
  if (settings.googleTokenExpiry && Date.now() > settings.googleTokenExpiry - 5 * 60 * 1000) {
    return null;
  }
  return settings.googleAccessToken;
}

async function findOrCreateFolder(token: string): Promise<string> {
  const searchRes = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(
      `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
    )}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  const createRes = await fetch(`${DRIVE_API}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });
  const folder = await createRes.json();
  return folder.id;
}

async function findBackupFile(token: string, folderId: string): Promise<string | null> {
  const res = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(
      `name='${BACKUP_FILENAME}' and '${folderId}' in parents and trashed=false`
    )}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
}

export async function backupToDrive(): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error("Not authenticated with Google");

  const [tasksRaw, settingsRaw] = await Promise.all([
    AsyncStorage.getItem(TASKS_KEY),
    AsyncStorage.getItem(SETTINGS_KEY),
  ]);

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks: tasksRaw ? JSON.parse(tasksRaw) : [],
    settings: settingsRaw ? JSON.parse(settingsRaw) : {},
  };

  // Strip auth tokens from backup
  if (backup.settings) {
    delete backup.settings.googleAccessToken;
    delete backup.settings.googleRefreshToken;
    delete backup.settings.googleTokenExpiry;
  }

  const body = JSON.stringify(backup);
  const folderId = await findOrCreateFolder(token);
  const existingFileId = await findBackupFile(token, folderId);

  if (existingFileId) {
    await fetch(`${DRIVE_UPLOAD_API}/files/${existingFileId}?uploadType=multipart`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=foo_bar_baz`,
      },
      body: [
        "--foo_bar_baz\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n",
        JSON.stringify({ name: BACKUP_FILENAME, mimeType: "application/json" }),
        "\r\n--foo_bar_baz\r\nContent-Type: application/json\r\n\r\n",
        body,
        "\r\n--foo_bar_baz--",
      ].join(""),
    });
  } else {
    await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=foo_bar_baz`,
      },
      body: [
        "--foo_bar_baz\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n",
        JSON.stringify({ name: BACKUP_FILENAME, mimeType: "application/json", parents: [folderId] }),
        "\r\n--foo_bar_baz\r\nContent-Type: application/json\r\n\r\n",
        body,
        "\r\n--foo_bar_baz--",
      ].join(""),
    });
  }
}

export async function restoreFromDrive(): Promise<{ tasks: unknown[]; settings: Record<string, unknown> } | null> {
  const token = await getAccessToken();
  if (!token) throw new Error("Not authenticated with Google");

  const folderId = await findOrCreateFolder(token);
  const fileId = await findBackupFile(token, folderId);
  if (!fileId) return null;

  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data;
}

export function isWithinSyncWindow(): boolean {
  const hour = new Date().getHours();
  return hour >= 5 && hour < 23;
}
