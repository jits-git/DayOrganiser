import { GoogleSignin } from "@react-native-google-signin/google-signin";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_NAME = "DayOrganizer";
const BACKUP_FILENAME = "backup.json";

const TASKS_KEY = "@dayorganizer/tasks";
const SETTINGS_KEY = "@dayorganizer/settings";

async function getAccessToken(): Promise<string> {
  const stored = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!stored) {
    console.warn("[Drive] getAccessToken: no settings in storage");
    throw new Error("Not signed in to Google. Please sign in from Settings.");
  }

  let settings: Record<string, any>;
  try {
    settings = JSON.parse(stored);
  } catch {
    console.error("[Drive] getAccessToken: failed to parse settings JSON");
    throw new Error("Corrupt settings — please sign in again.");
  }

  if (!settings.googleAccessToken) {
    console.warn("[Drive] getAccessToken: no access token in settings");
    throw new Error("Not signed in to Google. Please sign in from Settings.");
  }

  const tokenExpiry: number | undefined = settings.googleTokenExpiry;
  const fiveMinutes = 5 * 60 * 1000;
  const isExpired = tokenExpiry != null && Date.now() > tokenExpiry - fiveMinutes;

  if (!isExpired) {
    const minsLeft = tokenExpiry ? Math.round((tokenExpiry - Date.now()) / 60000) : "unknown";
    console.log(`[Drive] getAccessToken: cached token valid (${minsLeft} min remaining)`);
    return settings.googleAccessToken as string;
  }

  // Token expired — attempt refresh via the native SDK (uses stored refresh token)
  console.log("[Drive] getAccessToken: token expired, calling GoogleSignin.getTokens() to refresh");
  try {
    const { accessToken } = await GoogleSignin.getTokens();
    if (!accessToken) {
      console.warn("[Drive] getAccessToken: getTokens() returned empty token");
      throw new Error("Token refresh returned no token — please sign in again.");
    }
    // Persist the refreshed token back to AsyncStorage so future reads see it
    const updated = {
      ...settings,
      googleAccessToken: accessToken,
      googleTokenExpiry: Date.now() + 3600 * 1000,
    };
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    console.log("[Drive] getAccessToken: token refreshed and saved successfully");
    return accessToken;
  } catch (e: any) {
    // Distinguish between "user needs to re-authenticate" and other errors
    const msg = e?.message ?? String(e);
    console.error("[Drive] getAccessToken: refresh failed:", msg);
    if (msg.includes("sign in") || msg.includes("auth") || msg.includes("token")) {
      throw new Error("Google session expired. Please sign in again from Settings.");
    }
    throw new Error(`Could not refresh Google token: ${msg}`);
  }
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
  console.log("[Drive] backupToDrive: starting");
  const token = await getAccessToken(); // throws with a descriptive message if unavailable

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
  console.log("[Drive] backupToDrive: complete");
}

export async function restoreFromDrive(): Promise<{ tasks: unknown[]; settings: Record<string, unknown> } | null> {
  console.log("[Drive] restoreFromDrive: starting");
  const token = await getAccessToken();

  const folderId = await findOrCreateFolder(token);
  const fileId = await findBackupFile(token, folderId);
  if (!fileId) {
    console.log("[Drive] restoreFromDrive: no backup file found");
    return null;
  }

  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  console.log("[Drive] restoreFromDrive: complete");
  return data;
}

export function isWithinSyncWindow(): boolean {
  const hour = new Date().getHours();
  return hour >= 5 && hour < 23;
}
