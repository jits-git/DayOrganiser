import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AuthSession from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { useSettings } from "@/context/SettingsContext";

WebBrowser.maybeCompleteAuthSession();

const WEB_CLIENT_ID =
  "1057440910574-hpftfahagdk7acfunru08nkm6f2g53nr.apps.googleusercontent.com";
const ANDROID_CLIENT_ID =
  "1057440910574-2gbnl28aug90lnpi8ubui54650o6cq2a.apps.googleusercontent.com";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

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

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: WEB_CLIENT_ID,
    androidClientId: ANDROID_CLIENT_ID,
    scopes: [DRIVE_SCOPE],
  });

  useEffect(() => {
    setIsSignedIn(!!settings.googleAccessToken);
  }, [settings.googleAccessToken]);

  useEffect(() => {
    if (response?.type === "success") {
      const { authentication } = response;
      if (authentication?.accessToken) {
        const expiry = authentication.expiresIn
          ? Date.now() + authentication.expiresIn * 1000
          : Date.now() + 3600 * 1000;

        fetchUserEmail(authentication.accessToken).then((email) => {
          updateSettings({
            googleAccessToken: authentication.accessToken,
            googleRefreshToken: authentication.refreshToken ?? undefined,
            googleTokenExpiry: expiry,
            googleUserEmail: email ?? undefined,
          });
          setIsSignedIn(true);
        });
      }
    }
  }, [response]);

  const signIn = useCallback(async () => {
    await promptAsync();
  }, [promptAsync]);

  const signOut = useCallback(async () => {
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

async function fetchUserEmail(token: string): Promise<string | null> {
  try {
    const res = await fetch("https://www.googleapis.com/userinfo/v2/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return data.email ?? null;
  } catch {
    return null;
  }
}
