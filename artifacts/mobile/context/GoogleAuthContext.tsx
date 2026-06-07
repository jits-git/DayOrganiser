import { GoogleSignin } from "@react-native-google-signin/google-signin";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { useSettings } from "@/context/SettingsContext";
import { backupToDrive, isWithinSyncWindow } from "@/utils/googleDrive";

const WEB_CLIENT_ID =
  "1057440910574-hpftfahagdk7acfunru08nkm6f2g53nr.apps.googleusercontent.com";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

GoogleSignin.configure({
  webClientId: WEB_CLIENT_ID,
  scopes: [DRIVE_SCOPE],
  offlineAccess: true,
});

interface GoogleAuthContextType {
  isSignedIn: boolean;
  userEmail: string | undefined;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const GoogleAuthContext = createContext<GoogleAuthContextType | null>(null);

export function GoogleAuthProvider({ children }: { children: React.ReactNode }) {
  const { settings, updateSettings } = useSettings();
  const [isSignedIn, setIsSignedIn] = useState(!!settings.googleAccessToken);

  useEffect(() => {
    setIsSignedIn(!!settings.googleAccessToken);
  }, [settings.googleAccessToken]);

  useEffect(() => {
    if (!isSignedIn) return;
    const FOUR_HOURS = 4 * 60 * 60 * 1000;
    const id = setInterval(async () => {
      if (!isWithinSyncWindow()) return;
      try {
        // Refresh the token before syncing so it doesn't expire mid-operation
        const { accessToken } = await GoogleSignin.getTokens();
        await updateSettings({ googleAccessToken: accessToken });
        await backupToDrive();
        await updateSettings({ lastDriveSync: new Date().toISOString() });
      } catch {
        // silently ignore foreground sync failures
      }
    }, FOUR_HOURS);
    return () => clearInterval(id);
  }, [isSignedIn]);

  const signIn = useCallback(async () => {
    await GoogleSignin.hasPlayServices();
    const result = await GoogleSignin.signIn();
    if (result.type !== "success") return;

    const { accessToken } = await GoogleSignin.getTokens();
    await updateSettings({
      googleAccessToken: accessToken,
      googleTokenExpiry: Date.now() + 3600 * 1000,
      googleUserEmail: result.data.user.email,
    });
    setIsSignedIn(true);
  }, [updateSettings]);

  const signOut = useCallback(async () => {
    await GoogleSignin.signOut();
    await updateSettings({
      googleAccessToken: undefined,
      googleRefreshToken: undefined,
      googleTokenExpiry: undefined,
      googleUserEmail: undefined,
      lastDriveSync: undefined,
    });
    setIsSignedIn(false);
  }, [updateSettings]);

  return (
    <GoogleAuthContext.Provider
      value={{ isSignedIn, userEmail: settings.googleUserEmail, signIn, signOut }}
    >
      {children}
    </GoogleAuthContext.Provider>
  );
}

export function useGoogleAuth() {
  const ctx = useContext(GoogleAuthContext);
  if (!ctx) throw new Error("useGoogleAuth must be used within GoogleAuthProvider");
  return ctx;
}
