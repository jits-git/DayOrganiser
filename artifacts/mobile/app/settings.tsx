import DateTimePicker from "@react-native-community/datetimepicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useSettings } from "@/context/SettingsContext";
import { useGoogleAuth } from "@/context/GoogleAuthContext";
import { triggerAnnouncement } from "@/hooks/useVoiceAnnouncement";
import { backupToDrive, restoreFromDrive } from "@/utils/googleDrive";
import { AIProvider } from "@/types/settings";
import { PROVIDER_MODELS, DEFAULT_MODEL } from "@/utils/aiProvider";

const TASKS_KEY = "@dayorganizer/tasks";
const SETTINGS_KEY = "@dayorganizer/settings";

function formatTime(hour: number, minute: number): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatSyncTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

type PickerKey = "morning" | "afternoon" | "evening";

export default function SettingsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useSettings();
  const { isSignedIn, userEmail, signIn, signOut } = useGoogleAuth();

  const [activePicker, setActivePicker] = useState<PickerKey | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [localUserName, setLocalUserName] = useState(settings.userName);
  const [localAssistantName, setLocalAssistantName] = useState(
    settings.assistantName || "Kate"
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [localApiKey, setLocalApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  const activeProvider: AIProvider = settings.aiProvider ?? "claude";

  useEffect(() => {
    setLocalUserName(settings.userName);
    setLocalAssistantName(settings.assistantName || "Kate");
  }, [settings.userName, settings.assistantName]);

  useEffect(() => {
    SecureStore.getItemAsync(`popo_apikey_${activeProvider}`).then((key) => {
      setLocalApiKey(key ?? "");
    });
  }, [activeProvider]);

  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const rows: {
    key: PickerKey;
    label: string;
    sublabel: string;
    icon: string;
    time: { hour: number; minute: number };
  }[] = [
    {
      key: "morning",
      label: "Morning Summary",
      sublabel: "Daily task overview at the start of the day",
      icon: "sunrise",
      time: settings.morningNotification,
    },
    {
      key: "afternoon",
      label: "Afternoon Check-in",
      sublabel: "Progress update and remaining tasks",
      icon: "sun",
      time: settings.afternoonNotification,
    },
    {
      key: "evening",
      label: "Evening Wrap-up",
      sublabel: "End-of-day summary of completed and pending tasks",
      icon: "sunset",
      time: settings.eveningNotification,
    },
  ];

  function handlePickerChange(_: unknown, selected?: Date) {
    if (!selected || !activePicker) {
      setActivePicker(null);
      return;
    }

    const updated = { hour: selected.getHours(), minute: selected.getMinutes() };

    if (activePicker === "morning") {
      updateSettings({ morningNotification: updated });
    } else if (activePicker === "afternoon") {
      updateSettings({ afternoonNotification: updated });
    } else if (activePicker === "evening") {
      updateSettings({ eveningNotification: updated });
    }

    if (Platform.OS === "android") setActivePicker(null);
  }

  const currentPickerValue = activePicker
    ? (() => {
        const t =
          activePicker === "morning"
            ? settings.morningNotification
            : activePicker === "afternoon"
            ? settings.afternoonNotification
            : settings.eveningNotification;
        const d = new Date();
        d.setHours(t.hour, t.minute, 0, 0);
        return d;
      })()
    : new Date();

  async function handleSyncNow() {
    setIsSyncing(true);
    try {
      await backupToDrive();
      await updateSettings({ lastDriveSync: new Date().toISOString() });
      Alert.alert("Synced", "Backup saved to Google Drive.");
    } catch (e: any) {
      Alert.alert("Sync Failed", e?.message ?? "Could not sync to Google Drive.");
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleRestore() {
    Alert.alert(
      "Restore from Drive",
      "This will overwrite your current tasks and settings with the latest backup. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          style: "destructive",
          onPress: async () => {
            setIsRestoring(true);
            try {
              const data = await restoreFromDrive();
              if (!data) {
                Alert.alert("No Backup", "No backup.json found in your DayOrganizer Drive folder.");
                return;
              }

              // Preserve current auth tokens
              const currentTokens = {
                googleAccessToken: settings.googleAccessToken,
                googleRefreshToken: settings.googleRefreshToken,
                googleTokenExpiry: settings.googleTokenExpiry,
                googleUserEmail: settings.googleUserEmail,
                lastDriveSync: settings.lastDriveSync,
              };

              if (data.tasks) {
                await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(data.tasks));
              }
              if (data.settings) {
                const restoredSettings = { ...data.settings, ...currentTokens };
                await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(restoredSettings));
              }

              Alert.alert(
                "Restored",
                "Your tasks and settings have been restored. Please restart the app.",
                [{ text: "OK" }]
              );
            } catch (e: any) {
              Alert.alert("Restore Failed", e?.message ?? "Could not restore from Google Drive.");
            } finally {
              setIsRestoring(false);
            }
          },
        },
      ]
    );
  }

  async function handleSignOut() {
    Alert.alert("Sign Out", "Disconnect Google Drive backup?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: signOut },
    ]);
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topInset + 16,
            backgroundColor: c.background,
            borderBottomColor: c.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[styles.backBtn, { backgroundColor: c.secondary, borderRadius: 20 }]}
        >
          <Feather name="arrow-left" size={18} color={c.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.foreground, fontFamily: "Inter_700Bold" }]}>
          Settings
        </Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.body, { paddingBottom: bottomInset + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={[
            styles.sectionLabel,
            { color: c.mutedForeground, fontFamily: "Inter_500Medium" },
          ]}
        >
          NOTIFICATION TIMES
        </Text>

        {rows.map((row, idx) => (
          <View key={row.key}>
            <TouchableOpacity
              style={[
                styles.row,
                {
                  backgroundColor: c.card,
                  borderColor: c.border,
                  borderRadius: c.radius,
                  borderTopLeftRadius: idx === 0 ? c.radius : 0,
                  borderTopRightRadius: idx === 0 ? c.radius : 0,
                  borderBottomLeftRadius: idx === rows.length - 1 ? c.radius : 0,
                  borderBottomRightRadius: idx === rows.length - 1 ? c.radius : 0,
                  borderBottomWidth: idx < rows.length - 1 ? 0 : 1,
                },
              ]}
              onPress={() => setActivePicker(activePicker === row.key ? null : row.key)}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: c.primary + "18", borderRadius: 10 },
                ]}
              >
                <Feather name={row.icon as any} size={18} color={c.primary} />
              </View>
              <View style={styles.rowText}>
                <Text
                  style={[styles.rowLabel, { color: c.foreground, fontFamily: "Inter_500Medium" }]}
                >
                  {row.label}
                </Text>
                <Text
                  style={[
                    styles.rowSublabel,
                    { color: c.mutedForeground, fontFamily: "Inter_400Regular" },
                  ]}
                >
                  {row.sublabel}
                </Text>
              </View>
              <View
                style={[
                  styles.timePill,
                  {
                    backgroundColor:
                      activePicker === row.key ? c.primary : c.secondary,
                    borderRadius: 16,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.timeText,
                    {
                      color: activePicker === row.key ? c.primaryForeground : c.primary,
                      fontFamily: "Inter_600SemiBold",
                    },
                  ]}
                >
                  {formatTime(row.time.hour, row.time.minute)}
                </Text>
              </View>
            </TouchableOpacity>

            {idx < rows.length - 1 && (
              <View style={[styles.separator, { backgroundColor: c.border }]} />
            )}

            {Platform.OS === "ios" && activePicker === row.key && (
              <View
                style={[
                  styles.iosPicker,
                  {
                    backgroundColor: c.card,
                    borderColor: c.border,
                    borderRadius: c.radius,
                  },
                ]}
              >
                <DateTimePicker
                  value={currentPickerValue}
                  mode="time"
                  display="spinner"
                  onChange={handlePickerChange}
                  textColor={c.foreground}
                />
                <TouchableOpacity
                  onPress={() => setActivePicker(null)}
                  style={[
                    styles.doneBtn,
                    { backgroundColor: c.primary, borderRadius: c.radius },
                  ]}
                >
                  <Text
                    style={[
                      styles.doneBtnText,
                      { color: c.primaryForeground, fontFamily: "Inter_600SemiBold" },
                    ]}
                  >
                    Done
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}

        <Text
          style={[
            styles.sectionLabel,
            { color: c.mutedForeground, fontFamily: "Inter_500Medium", marginTop: 28 },
          ]}
        >
          TASK DEFAULTS
        </Text>

        <View
          style={[
            styles.row,
            {
              backgroundColor: c.card,
              borderColor: c.border,
              borderRadius: c.radius,
              borderWidth: 1,
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 0,
            },
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, width: "100%" }}>
            <View style={[styles.iconWrap, { backgroundColor: c.primary + "18", borderRadius: 10 }]}>
              <Feather name="clock" size={18} color={c.primary} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: c.foreground, fontFamily: "Inter_500Medium" }]}>
                Hard Deadline Offset
              </Text>
              <Text style={[styles.rowSublabel, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Default days added after target completion
              </Text>
            </View>
          </View>
          <View style={styles.chipRow}>
            {([0, 1, 2, 3, 7] as const).map((days) => {
              const active = (settings.hardDeadlineOffsetDays ?? 0) === days;
              return (
                <TouchableOpacity
                  key={days}
                  onPress={() => updateSettings({ hardDeadlineOffsetDays: days })}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? c.primary : c.secondary,
                      borderRadius: 14,
                    },
                  ]}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: active ? c.primaryForeground : c.foreground,
                        fontFamily: "Inter_500Medium",
                      },
                    ]}
                  >
                    {days === 0 ? "Same day" : `+${days} day${days > 1 ? "s" : ""}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <Text
          style={[
            styles.sectionLabel,
            { color: c.mutedForeground, fontFamily: "Inter_500Medium", marginTop: 28 },
          ]}
        >
          PERSONAL
        </Text>

        {[
          {
            icon: "user",
            label: "Your Name",
            value: localUserName,
            placeholder: "Enter your name",
            onChange: setLocalUserName,
            onBlur: () => {
              if (localUserName !== settings.userName) {
                updateSettings({ userName: localUserName });
              }
            },
          },
          {
            icon: "message-circle",
            label: "Assistant Name",
            value: localAssistantName,
            placeholder: "Kate",
            onChange: setLocalAssistantName,
            onBlur: () => {
              if (localAssistantName !== settings.assistantName) {
                updateSettings({ assistantName: localAssistantName || "Kate" });
              }
            },
          },
        ].map((field, idx, arr) => (
          <View key={field.label}>
            <View
              style={[
                styles.row,
                styles.nameRow,
                {
                  backgroundColor: c.card,
                  borderColor: c.border,
                  borderRadius: c.radius,
                  borderTopLeftRadius: idx === 0 ? c.radius : 0,
                  borderTopRightRadius: idx === 0 ? c.radius : 0,
                  borderBottomLeftRadius: idx === arr.length - 1 ? c.radius : 0,
                  borderBottomRightRadius: idx === arr.length - 1 ? c.radius : 0,
                  borderBottomWidth: idx < arr.length - 1 ? 0 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: c.primary + "18", borderRadius: 10 },
                ]}
              >
                <Feather name={field.icon as any} size={18} color={c.primary} />
              </View>
              <Text
                style={[
                  styles.rowLabel,
                  { color: c.foreground, fontFamily: "Inter_500Medium", flex: 0, minWidth: 120 },
                ]}
              >
                {field.label}
              </Text>
              <TextInput
                style={[
                  styles.nameInput,
                  {
                    color: c.foreground,
                    fontFamily: "Inter_400Regular",
                    borderColor: c.border,
                    borderRadius: 8,
                    backgroundColor: c.secondary,
                  },
                ]}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                placeholder={field.placeholder}
                placeholderTextColor={c.mutedForeground}
                autoCapitalize="words"
                returnKeyType="done"
              />
            </View>
            {idx < arr.length - 1 && (
              <View style={[styles.separator, { backgroundColor: c.border }]} />
            )}
          </View>
        ))}

        <Text
          style={[
            styles.sectionLabel,
            { color: c.mutedForeground, fontFamily: "Inter_500Medium", marginTop: 28 },
          ]}
        >
          FEATURES
        </Text>

        <View
          style={[
            styles.row,
            {
              backgroundColor: c.card,
              borderColor: c.border,
              borderRadius: c.radius,
              borderWidth: 1,
            },
          ]}
        >
          <View
            style={[
              styles.iconWrap,
              { backgroundColor: c.primary + "18", borderRadius: 10 },
            ]}
          >
            <Feather name="volume-2" size={18} color={c.primary} />
          </View>
          <View style={styles.rowText}>
            <Text
              style={[styles.rowLabel, { color: c.foreground, fontFamily: "Inter_500Medium" }]}
            >
              Voice Announcements
            </Text>
            <Text
              style={[
                styles.rowSublabel,
                { color: c.mutedForeground, fontFamily: "Inter_400Regular" },
              ]}
            >
              Read a summary aloud when opening from a daily notification
            </Text>
          </View>
          <Switch
            value={settings.voiceAnnouncementsEnabled ?? false}
            onValueChange={(v) => updateSettings({ voiceAnnouncementsEnabled: v })}
            trackColor={{ false: c.border, true: c.primary }}
            thumbColor="#fff"
          />
        </View>

        {/* DEBUG — remove before release */}
        <TouchableOpacity
          onPress={async () => {
            setIsSpeaking(true);
            await triggerAnnouncement("morning");
            setIsSpeaking(false);
          }}
          disabled={isSpeaking}
          activeOpacity={0.75}
          style={[
            styles.debugBtn,
            {
              borderColor: c.accent,
              borderRadius: c.radius,
              opacity: isSpeaking ? 0.5 : 1,
            },
          ]}
        >
          <Feather name="play-circle" size={18} color={c.accent} />
          <Text style={[styles.debugBtnText, { color: c.accent, fontFamily: "Inter_500Medium" }]}>
            {isSpeaking ? "Speaking…" : "Test Morning Announcement"}
          </Text>
        </TouchableOpacity>

        {/* ── AI Assistant ── */}
        <Text
          style={[
            styles.sectionLabel,
            { color: c.mutedForeground, fontFamily: "Inter_500Medium", marginTop: 28 },
          ]}
        >
          AI ASSISTANT
        </Text>

        {/* Provider selector */}
        <View
          style={[
            styles.row,
            {
              backgroundColor: c.card,
              borderColor: c.border,
              borderRadius: c.radius,
              borderWidth: 1,
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 0,
            },
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, width: "100%" }}>
            <View style={[styles.iconWrap, { backgroundColor: c.primary + "18", borderRadius: 10 }]}>
              <Feather name="zap" size={18} color={c.primary} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: c.foreground, fontFamily: "Inter_500Medium" }]}>
                Provider
              </Text>
              <Text style={[styles.rowSublabel, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Which AI service powers Popo
              </Text>
            </View>
          </View>
          <View style={styles.chipRow}>
            {(["claude", "openai", "gemini", "openrouter"] as AIProvider[]).map((p) => {
              const active = activeProvider === p;
              const label =
                p === "claude" ? "Claude" :
                p === "openai" ? "OpenAI" :
                p === "gemini" ? "Gemini" : "OpenRouter";
              return (
                <TouchableOpacity
                  key={p}
                  onPress={() => updateSettings({ aiProvider: p, aiModel: DEFAULT_MODEL[p] })}
                  style={[
                    styles.chip,
                    { backgroundColor: active ? c.primary : c.secondary, borderRadius: 14 },
                  ]}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: active ? c.primaryForeground : c.foreground, fontFamily: "Inter_500Medium" },
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={[styles.separator, { backgroundColor: c.border }]} />

        {/* API Key */}
        <View
          style={[
            styles.row,
            {
              backgroundColor: c.card,
              borderColor: c.border,
              borderTopLeftRadius: 0,
              borderTopRightRadius: 0,
              borderBottomLeftRadius: c.radius,
              borderBottomRightRadius: c.radius,
              borderWidth: 1,
              borderTopWidth: 0,
              gap: 8,
            },
          ]}
        >
          <View style={[styles.iconWrap, { backgroundColor: c.primary + "18", borderRadius: 10 }]}>
            <Feather name="key" size={18} color={c.primary} />
          </View>
          <Text style={[styles.rowLabel, { color: c.foreground, fontFamily: "Inter_500Medium", flex: 0, minWidth: 72 }]}>
            API Key
          </Text>
          <TextInput
            style={[
              styles.nameInput,
              {
                color: c.foreground,
                fontFamily: "Inter_400Regular",
                borderColor: c.border,
                borderRadius: 8,
                backgroundColor: c.secondary,
              },
            ]}
            value={localApiKey}
            onChangeText={setLocalApiKey}
            onBlur={() => SecureStore.setItemAsync(`popo_apikey_${activeProvider}`, localApiKey)}
            placeholder="Paste your API key…"
            placeholderTextColor={c.mutedForeground}
            secureTextEntry={!showApiKey}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
          />
          <TouchableOpacity
            onPress={() => setShowApiKey((v) => !v)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name={showApiKey ? "eye-off" : "eye"} size={16} color={c.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Model selector */}
        <View
          style={[
            styles.row,
            {
              backgroundColor: c.card,
              borderColor: c.border,
              borderRadius: c.radius,
              borderWidth: 1,
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 0,
              marginTop: 8,
            },
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, width: "100%" }}>
            <View style={[styles.iconWrap, { backgroundColor: c.primary + "18", borderRadius: 10 }]}>
              <Feather name="cpu" size={18} color={c.primary} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: c.foreground, fontFamily: "Inter_500Medium" }]}>
                Model
              </Text>
              <Text style={[styles.rowSublabel, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Faster models cost less; smarter models reason better
              </Text>
            </View>
          </View>
          <View style={styles.chipRow}>
            {PROVIDER_MODELS[activeProvider].map((m) => {
              const active = (settings.aiModel ?? DEFAULT_MODEL[activeProvider]) === m.id;
              return (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => updateSettings({ aiModel: m.id })}
                  style={[
                    styles.chip,
                    { backgroundColor: active ? c.primary : c.secondary, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 5 },
                  ]}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: active ? c.primaryForeground : c.foreground, fontFamily: "Inter_500Medium" },
                    ]}
                  >
                    {m.label}
                  </Text>
                  {m.free && (
                    <View style={[styles.freeBadge, { backgroundColor: active ? "rgba(255,255,255,0.25)" : c.primary + "22" }]}>
                      <Text style={[styles.freeBadgeText, { color: active ? c.primaryForeground : c.primary, fontFamily: "Inter_600SemiBold" }]}>
                        FREE
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {activeProvider === "openrouter" && (
          <Text style={[styles.aiProviderNote, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Get a free API key at openrouter.ai — free models have no cost, paid models are billed per token.
          </Text>
        )}

        {/* ── Google Drive Backup ── */}
        <Text
          style={[
            styles.sectionLabel,
            { color: c.mutedForeground, fontFamily: "Inter_500Medium", marginTop: 28 },
          ]}
        >
          GOOGLE DRIVE BACKUP
        </Text>

        {!isSignedIn ? (
          <TouchableOpacity
            onPress={signIn}
            activeOpacity={0.8}
            style={[
              styles.driveBtn,
              {
                backgroundColor: c.primary,
                borderRadius: c.radius,
              },
            ]}
          >
            <Feather name="log-in" size={18} color={c.primaryForeground} />
            <Text style={[styles.driveBtnText, { color: c.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
              Login with Google
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.driveCard, { backgroundColor: c.card, borderColor: c.border, borderRadius: c.radius }]}>
            <View style={styles.driveAccountRow}>
              <View style={[styles.iconWrap, { backgroundColor: "#4285F418", borderRadius: 10 }]}>
                <Feather name="hard-drive" size={18} color="#4285F4" />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: c.foreground, fontFamily: "Inter_500Medium" }]}>
                  Google Drive
                </Text>
                {userEmail ? (
                  <Text style={[styles.rowSublabel, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    {userEmail}
                  </Text>
                ) : null}
                {settings.lastDriveSync ? (
                  <Text style={[styles.rowSublabel, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    Last synced: {formatSyncTime(settings.lastDriveSync)}
                  </Text>
                ) : (
                  <Text style={[styles.rowSublabel, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    Never synced
                  </Text>
                )}
              </View>
            </View>

            <View style={[styles.driveSeparator, { backgroundColor: c.border }]} />

            <View style={styles.driveActions}>
              <TouchableOpacity
                onPress={handleSyncNow}
                disabled={isSyncing}
                activeOpacity={0.8}
                style={[
                  styles.driveActionBtn,
                  { backgroundColor: c.primary, borderRadius: c.radius, opacity: isSyncing ? 0.6 : 1 },
                ]}
              >
                <Feather name="upload-cloud" size={16} color={c.primaryForeground} />
                <Text style={[styles.driveActionText, { color: c.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                  {isSyncing ? "Syncing…" : "Sync Now"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleRestore}
                disabled={isRestoring}
                activeOpacity={0.8}
                style={[
                  styles.driveActionBtn,
                  { backgroundColor: c.secondary, borderRadius: c.radius, opacity: isRestoring ? 0.6 : 1 },
                ]}
              >
                <Feather name="download-cloud" size={16} color={c.foreground} />
                <Text style={[styles.driveActionText, { color: c.foreground, fontFamily: "Inter_600SemiBold" }]}>
                  {isRestoring ? "Restoring…" : "Restore"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSignOut}
                activeOpacity={0.8}
                style={[
                  styles.driveActionBtn,
                  { backgroundColor: c.secondary, borderRadius: c.radius },
                ]}
              >
                <Feather name="log-out" size={16} color={c.mutedForeground} />
                <Text style={[styles.driveActionText, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                  Sign Out
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <Text style={[styles.driveNote, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {isSignedIn
            ? "Auto-syncs every 4 hours between 5 AM–11 PM. Backup saved to DayOrganizer/backup.json in your Drive."
            : "Connect Google to back up tasks and settings to your Google Drive."}
        </Text>

        <Text
          style={[
            styles.footerNote,
            { color: c.mutedForeground, fontFamily: "Inter_400Regular" },
          ]}
        >
          Notifications require permission to be granted on your device. Changes take effect immediately.
        </Text>
      </ScrollView>

      {Platform.OS === "android" && activePicker && (
        <DateTimePicker
          value={currentPickerValue}
          mode="time"
          display="default"
          onChange={handlePickerChange}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18 },
  body: { padding: 20 },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
    borderWidth: 1,
  },
  separator: { height: StyleSheet.hairlineWidth },
  iconWrap: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 15 },
  rowSublabel: { fontSize: 12, lineHeight: 16 },
  timePill: { paddingHorizontal: 12, paddingVertical: 6 },
  timeText: { fontSize: 14 },
  iosPicker: {
    borderWidth: 1,
    marginTop: 2,
    paddingBottom: 12,
    overflow: "hidden",
  },
  doneBtn: {
    marginHorizontal: 20,
    paddingVertical: 10,
    alignItems: "center",
  },
  doneBtnText: { fontSize: 15 },
  footerNote: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 24,
    textAlign: "center",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    textAlign: "right",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingTop: 10,
    paddingBottom: 4,
    paddingLeft: 50,
  },
  chip: { paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 12 },
  freeBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 },
  freeBadgeText: { fontSize: 9, letterSpacing: 0.4 },
  aiProviderNote: { fontSize: 12, lineHeight: 17, marginTop: 6, paddingHorizontal: 2 },
  debugBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderStyle: "dashed",
    paddingVertical: 13,
    marginTop: 20,
  },
  debugBtnText: { fontSize: 14 },
  // Google Drive styles
  driveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
  },
  driveBtnText: { fontSize: 15 },
  driveCard: {
    borderWidth: 1,
    overflow: "hidden",
  },
  driveAccountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  driveSeparator: { height: StyleSheet.hairlineWidth },
  driveActions: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
  },
  driveActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 4,
  },
  driveActionText: { fontSize: 13 },
  driveNote: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
    textAlign: "center",
  },
});
