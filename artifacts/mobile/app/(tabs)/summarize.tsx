import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSettings } from "@/context/SettingsContext";
import { useTasks } from "@/context/TaskContext";
import { useColors } from "@/hooks/useColors";
import { buildSummary } from "@/utils/buildAnnouncement";
import { Task } from "@/types/task";

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function speakText(text: string, onDone?: () => void): void {
  if (Platform.OS === "web") {
    onDone?.();
    return;
  }
  try {
    const Speech = require("expo-speech");
    Speech.stop();
    Speech.speak(text, { language: "en-US", onDone, onStopped: onDone, onError: onDone });
  } catch {
    onDone?.();
  }
}

function StatCard({
  value,
  label,
  accent,
  c,
}: {
  value: number;
  label: string;
  accent: string;
  c: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={[
        styles.statCard,
        { backgroundColor: c.card, borderColor: c.border, borderRadius: c.radius },
      ]}
    >
      <Text style={[styles.statValue, { color: accent, fontFamily: "Inter_700Bold" }]}>
        {value}
      </Text>
      <Text
        style={[
          styles.statLabel,
          { color: c.mutedForeground, fontFamily: "Inter_400Regular" },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function TaskPill({
  task,
  icon,
  iconColor,
  c,
}: {
  task: Task;
  icon: string;
  iconColor: string;
  c: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: c.card, borderColor: c.border, borderRadius: c.radius },
      ]}
    >
      <Feather name={icon as any} size={14} color={iconColor} />
      <Text
        style={[styles.pillText, { color: c.foreground, fontFamily: "Inter_500Medium" }]}
        numberOfLines={1}
      >
        {task.description}
      </Text>
    </View>
  );
}

export default function SummarizeScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { tasks } = useTasks();
  const { settings } = useSettings();
  const [summaryText, setSummaryText] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);

  const now = useMemo(() => new Date(), []);

  const stats = useMemo(() => {
    const active = tasks.filter((t) => !t.isCompleted);
    return {
      completedToday: tasks.filter(
        (t) => t.isCompleted && t.completedAt && isSameDay(new Date(t.completedAt), now)
      ),
      importantMissed: active.filter(
        (t) => t.isImportant && new Date(t.hardDeadline) < now
      ),
      importantAhead: active.filter(
        (t) => t.isImportant && new Date(t.hardDeadline) >= now
      ),
      incompleteToday: active.filter(
        (t) =>
          isSameDay(new Date(t.targetDate), now) ||
          isSameDay(new Date(t.hardDeadline), now) ||
          new Date(t.hardDeadline) < now
      ),
    };
  }, [tasks, now]);

  const play = useCallback(
    (text: string) => {
      setIsPlaying(true);
      speakText(text, () => setIsPlaying(false));
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      const text = buildSummary(tasks, settings);
      setSummaryText(text);
      play(text);

      return () => {
        if (Platform.OS !== "web") {
          try {
            const Speech = require("expo-speech");
            Speech.stop();
          } catch {}
        }
        setIsPlaying(false);
      };
    }, [tasks, settings, play])
  );

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topInset + 12,
            backgroundColor: c.background,
            borderBottomColor: c.border,
          },
        ]}
      >
        <View>
          <Text
            style={[
              styles.headerSub,
              { color: c.mutedForeground, fontFamily: "Inter_400Regular" },
            ]}
          >
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </Text>
          <Text
            style={[styles.headerTitle, { color: c.foreground, fontFamily: "Inter_700Bold" }]}
          >
            Summary
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => play(summaryText)}
          disabled={isPlaying || !summaryText}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[
            styles.replayBtn,
            {
              backgroundColor: isPlaying ? c.primary + "20" : c.secondary,
              borderRadius: 20,
            },
          ]}
        >
          <Feather
            name={isPlaying ? "volume-2" : "refresh-cw"}
            size={18}
            color={isPlaying ? c.primary : c.foreground}
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomInset + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Playback status */}
        <View
          style={[
            styles.statusRow,
            {
              backgroundColor: isPlaying ? c.primary + "12" : c.secondary,
              borderRadius: c.radius,
            },
          ]}
        >
          <Feather
            name="volume-2"
            size={15}
            color={isPlaying ? c.primary : c.mutedForeground}
          />
          <Text
            style={[
              styles.statusText,
              {
                color: isPlaying ? c.primary : c.mutedForeground,
                fontFamily: "Inter_500Medium",
              },
            ]}
          >
            {isPlaying ? "Playing…" : "Tap ↻ to hear again"}
          </Text>
        </View>

        {/* Summary text card */}
        {!!summaryText && (
          <View
            style={[
              styles.textCard,
              { backgroundColor: c.card, borderColor: c.border, borderRadius: c.radius },
            ]}
          >
            <Text
              style={[
                styles.summaryText,
                { color: c.foreground, fontFamily: "Inter_400Regular" },
              ]}
            >
              {summaryText}
            </Text>
          </View>
        )}

        {/* Stats 2×2 grid */}
        <View style={styles.statsGrid}>
          <StatCard
            value={stats.completedToday.length}
            label={"Done today"}
            accent={c.primary}
            c={c}
          />
          <StatCard
            value={stats.importantMissed.length}
            label={"Important\nmissed"}
            accent={
              stats.importantMissed.length > 0 ? c.destructive : c.mutedForeground
            }
            c={c}
          />
          <StatCard
            value={stats.importantAhead.length}
            label={"Important\nahead"}
            accent={"#F59E0B"}
            c={c}
          />
          <StatCard
            value={stats.incompleteToday.length}
            label={"Incomplete\ntoday"}
            accent={
              stats.incompleteToday.length > 0 ? c.foreground : c.mutedForeground
            }
            c={c}
          />
        </View>

        {/* Important missed list */}
        {stats.importantMissed.length > 0 && (
          <View>
            <Text
              style={[
                styles.listLabel,
                { color: c.mutedForeground, fontFamily: "Inter_500Medium" },
              ]}
            >
              IMPORTANT MISSED
            </Text>
            {stats.importantMissed.map((t) => (
              <TaskPill
                key={t.id}
                task={t}
                icon="alert-circle"
                iconColor={c.destructive}
                c={c}
              />
            ))}
          </View>
        )}

        {/* Important ahead list */}
        {stats.importantAhead.length > 0 && (
          <View>
            <Text
              style={[
                styles.listLabel,
                { color: c.mutedForeground, fontFamily: "Inter_500Medium" },
              ]}
            >
              IMPORTANT AHEAD
            </Text>
            {stats.importantAhead.map((t) => (
              <TaskPill key={t.id} task={t} icon="star" iconColor="#F59E0B" c={c} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerSub: { fontSize: 13, marginBottom: 2 },
  headerTitle: { fontSize: 32 },
  replayBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, gap: 16 },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
  },
  statusText: { fontSize: 14 },
  textCard: { borderWidth: 1, padding: 16 },
  summaryText: { fontSize: 16, lineHeight: 26 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statCard: {
    flex: 1,
    minWidth: "40%",
    borderWidth: 1,
    padding: 16,
    alignItems: "center",
    gap: 4,
  },
  statValue: { fontSize: 34 },
  statLabel: { fontSize: 12, textAlign: "center", lineHeight: 17 },
  listLabel: { fontSize: 11, letterSpacing: 0.8, marginBottom: 8 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  pillText: { fontSize: 14, flex: 1 },
});
