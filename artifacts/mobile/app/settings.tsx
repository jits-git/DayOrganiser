import DateTimePicker from "@react-native-community/datetimepicker";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useSettings } from "@/context/SettingsContext";

function formatTime(hour: number, minute: number): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
}

type PickerKey = "morning" | "afternoon" | "evening";

export default function SettingsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useSettings();

  const [activePicker, setActivePicker] = useState<PickerKey | null>(null);

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
});
