import AsyncStorage from "@react-native-async-storage/async-storage";

const SHEET_ID_KEY = "@dayorganizer/feedbackSheetId";
const SHEET_NAME = "Day Organizer Feedback";

async function getOrCreateSheet(accessToken: string): Promise<string> {
  const stored = await AsyncStorage.getItem(SHEET_ID_KEY);
  if (stored) {
    console.log("[feedback] reusing existing sheet:", stored);
    return stored;
  }

  console.log("[feedback] creating new Google Sheet...");
  const res = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: SHEET_NAME,
      mimeType: "application/vnd.google-apps.spreadsheet",
    }),
  });

  const body = await res.text();
  console.log("[feedback] Drive create response:", res.status, body);
  if (!res.ok) throw new Error(`Failed to create sheet: ${res.status} ${body}`);

  const { id } = JSON.parse(body) as { id: string };
  await AsyncStorage.setItem(SHEET_ID_KEY, id);
  console.log("[feedback] sheet created:", id);
  return id;
}

export async function submitFeedback(
  feedbackText: string,
  email: string,
  accessToken: string
): Promise<void> {
  console.log("[feedback] submitting to Google Sheets | email:", email);

  const sheetId = await getOrCreateSheet(accessToken);
  const row = [new Date().toISOString(), feedbackText, email, "In-App Feedback"];
  console.log("[feedback] appending row:", JSON.stringify(row));

  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:append` +
    `?valueInputOption=RAW`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [row] }),
  });

  const body = await res.text();
  console.log("[feedback] Sheets append response:", res.status, body);
  if (!res.ok) throw new Error(`Failed to append row: ${res.status} ${body}`);

  console.log("[feedback] row appended successfully ✓");
}
