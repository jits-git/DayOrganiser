import { GoogleSignin } from "@react-native-google-signin/google-signin";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
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
  const { settings, isSettingsLoaded, updateSettings } = useSettings();

  // Start as false — we determine the real state after settings load from AsyncStorage.
  // This prevents a false "signed in" flash before the async load completes.
  const [isSignedIn, setIsSignedIn] = useState(false);
  const startupCheckedRef = useRef(false);

  // ── Startup auth reconciliation ───────────────────────────────────────────
  // Runs once, after SettingsContext has loaded from AsyncStorage.
  // Determines whether the stored token is still usable and refreshes if needed.
  useEffect(() => {
    if (!isSettingsLoaded || startupCheckedRef.current) return;
    startupCheckedRef.current = true;

    const { googleAccessToken, googleTokenExpiry, googleUserEmail } = settings;

    if (!googleAccessToken) {
      console.log("[Auth] Startup: no stored token — user not signed in");
      setIsSignedIn(false);
      return;
    }

    const fiveMinutes = 5 * 60 * 1000;
    const isExpired =
      googleTokenExpiry != null && Date.now() > googleTokenExpiry - fiveMinutes;

    if (!isExpired) {
      const minsLeft = googleTokenExpiry
        ? Math.round((googleTokenExpiry - Date.now()) / 60000)
        : "unknown";
      console.log(
        `[Auth] Startup: valid token for ${googleUserEmail ?? "unknown"} (${minsLeft} min remaining)`
      );
      setIsSignedIn(true);
      return;
    }

    // Token is expired — try to refresh via the native SDK before giving up
    console.log(
      `[Auth] Startup: token expired for ${googleUserEmail ?? "unknown"}, attempting refresh`
    );
    GoogleSignin.getTokens()
      .then(({ accessToken }) => {
        if (!accessToken) {
          console.warn("[Auth] Startup: refresh returned empty token — clearing auth state");
          return updateSettings({
            googleAccessToken: undefined,
            googleTokenExpiry: undefined,
          }).then(() => setIsSignedIn(false));
        }
        console.log("[Auth] Startup: token refreshed successfully");
        return updateSettings({
          googleAccessToken: accessToken,
          googleTokenExpiry: Date.now() + 3600 * 1000,
        }).then(() => setIsSignedIn(true));
      })
      .catch((e) => {
        console.error("[Auth] Startup: token refresh failed:", e?.message ?? e);
        // If refresh fails the user's session has expired — mark as signed out
        updateSettings({
          googleAccessToken: undefined,
          googleTokenExpiry: undefined,
        }).catch(() => {});
        setIsSignedIn(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSettingsLoaded]);

  // ── Background sync ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSignedIn) return;
    const FOUR_HOURS = 4 * 60 * 60 * 1000;
    const id = setInterval(async () => {
      if (!isWithinSyncWindow()) return;
      try {
        const { accessToken } = await GoogleSignin.getTokens();
        await updateSettings({
          googleAccessToken: accessToken,
          googleTokenExpiry: Date.now() + 3600 * 1000,
        });
        await backupToDrive();
        await updateSettings({ lastDriveSync: new Date().toISOString() });
        console.log("[Auth] Background sync completed");
      } catch (e) {
        console.error("[Auth] Background sync failed:", e);
      }
    }, FOUR_HOURS);
    return () => clearInterval(id);
  }, [isSignedIn]);

  // ── signIn ────────────────────────────────────────────────────────────────
  const signIn = useCallback(async () => {
    console.log("[Auth] signIn: checking Play Services");
    await GoogleSignin.hasPlayServices();

    console.log("[Auth] signIn: launching Google sign-in");
    const result = await GoogleSignin.signIn();
    if (result.type !== "success") {
      console.log("[Auth] signIn: flow ended without success, type =", result.type);
      return;
    }

    console.log("[Auth] signIn: obtaining tokens for", result.data.user.email);
    const { accessToken } = await GoogleSignin.getTokens();
    if (!accessToken) {
      console.error("[Auth] signIn: getTokens() returned no access token");
      throw new Error("Sign-in succeeded but no access token was returned.");
    }

    await updateSettings({
      googleAccessToken: accessToken,
      googleTokenExpiry: Date.now() + 3600 * 1000,
      googleUserEmail: result.data.user.email,
    });
    setIsSignedIn(true);
    console.log("[Auth] signIn: complete for", result.data.user.email);
  }, [updateSettings]);

  // ── signOut ───────────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    console.log("[Auth] signOut: starting");
    await GoogleSignin.signOut();
    await updateSettings({
      googleAccessToken: undefined,
      googleRefreshToken: undefined,
      googleTokenExpiry: undefined,
      googleUserEmail: undefined,
      lastDriveSync: undefined,
    });
    setIsSignedIn(false);
    console.log("[Auth] signOut: complete");
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
