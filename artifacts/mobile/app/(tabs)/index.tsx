import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Platform,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OverduePromptManager } from "@/components/OverdueModal";
import { TaskCard } from "@/components/TaskCard";
import { TaskModal } from "@/components/TaskModal";
import { VoiceTaskModal } from "@/components/VoiceTaskModal";
import { useSettings } from "@/context/SettingsContext";
import { useTasks } from "@/context/TaskContext";
import { useColors } from "@/hooks/useColors";
import { ParsedVoiceInput } from "@/utils/parseVoice";
import { Task } from "@/types/task";

// ─── helpers ────────────────────────────────────────────────────────────────

function getGreeting(hour: number, name: string): string {
  if (!name) return "Today";
  const period = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return `Good ${period}, ${name}!`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfWeek(d: Date): Date {
  // returns the upcoming Sunday (or today if today is Sunday)
  const day = d.getDay(); // 0 = Sun
  const end = new Date(d);
  end.setDate(d.getDate() + (day === 0 ? 0 : 7 - day));
  end.setHours(23, 59, 59, 999);
  return end;
}

// ─── types ───────────────────────────────────────────────────────────────────

type EmptySentinel = { _sentinel: true; id: string };
type TimelineItem = Task | EmptySentinel;

interface TimelineSection {
  key: string;
  title: string;
  overdueCount?: number;
  data: TimelineItem[];
}

function byTarget(a: Task, b: Task): number {
  return new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime();
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function TodayScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { tasks, completeTask } = useTasks();
  const { settings } = useSettings();

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);
  const [prefillData, setPrefillData] = useState<ParsedVoiceInput | undefined>(undefined);

  const now = new Date();
  const todayDate = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const title = getGreeting(now.getHours(), settings.userName);

  // ── section data ──────────────────────────────────────────────────────────

  const sections = useMemo<TimelineSection[]>(() => {
    const tomorrow = startOfDay(new Date(now));
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
    const weekEnd = endOfWeek(now);

    const overdueToday: Task[] = [];
    const activeToday: Task[] = [];
    const completedToday: Task[] = [];
    const tomorrowTasks: Task[] = [];
    const weekTasks: Task[] = [];
    const laterTasks: Task[] = [];

    for (const task of tasks) {
      const target = new Date(task.targetDate);
      const deadline = new Date(task.hardDeadline);

      if (task.isCompleted) {
        if (task.completedAt && isSameDay(new Date(task.completedAt), now)) {
          completedToday.push(task);
        }
        continue;
      }

      if (deadline < now) {
        overdueToday.push(task);
      } else if (isSameDay(target, now) || isSameDay(deadline, now)) {
        activeToday.push(task);
      } else if (isSameDay(target, tomorrow) || isSameDay(deadline, tomorrow)) {
        tomorrowTasks.push(task);
      } else if (
        (target >= dayAfterTomorrow && target <= weekEnd) ||
        (deadline >= dayAfterTomorrow && deadline <= weekEnd)
      ) {
        weekTasks.push(task);
      } else {
        laterTasks.push(task);
      }
    }

    // Sort active lists chronologically; overdue most-urgent first
    overdueToday.sort((a, b) => new Date(a.hardDeadline).getTime() - new Date(b.hardDeadline).getTime());
    activeToday.sort(byTarget);
    completedToday.sort((a, b) =>
      new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime()
    );
    tomorrowTasks.sort(byTarget);
    weekTasks.sort(byTarget);
    laterTasks.sort(byTarget);

    const todayData: TimelineItem[] =
      overdueToday.length + activeToday.length + completedToday.length > 0
        ? [...overdueToday, ...activeToday, ...completedToday]
        : [{ _sentinel: true, id: "empty-today" }];

    const result: TimelineSection[] = [
      {
        key: "today",
        title: "TODAY",
        overdueCount: overdueToday.length,
        data: todayData,
      },
    ];

    if (tomorrowTasks.length > 0) {
      result.push({ key: "tomorrow", title: "TOMORROW", data: tomorrowTasks });
    }
    if (weekTasks.length > 0) {
      result.push({ key: "week", title: "THIS WEEK", data: weekTasks });
    }
    if (laterTasks.length > 0) {
      result.push({ key: "later", title: "LATER", data: laterTasks });
    }

    return result;
  }, [tasks]);

  // ── handlers ─────────────────────────────────────────────────────────────

  function handleEdit(task: Task) {
    setSelectedTask(task);
    setModalVisible(true);
  }

  // ── render helpers ────────────────────────────────────────────────────────

  function renderSectionHeader({ section }: { section: TimelineSection }) {
    return (
      <View style={[styles.sectionHeader, { backgroundColor: c.background }]}>
        <Text
          style={[
            styles.sectionTitle,
            { color: c.mutedForeground, fontFamily: "Inter_600SemiBold" },
          ]}
        >
          {section.title}
        </Text>
        {!!section.overdueCount && section.overdueCount > 0 && (
          <View style={[styles.overdueBadge, { backgroundColor: c.destructive }]}>
            <Text
              style={[
                styles.overdueBadgeText,
                { color: c.destructiveForeground, fontFamily: "Inter_600SemiBold" },
              ]}
            >
              {section.overdueCount} overdue
            </Text>
          </View>
        )}
      </View>
    );
  }

  function renderItem({ item }: { item: TimelineItem }) {
    if ("_sentinel" in item) {
      return (
        <View style={styles.itemPad}>
          <View
            style={[
              styles.emptyCard,
              { backgroundColor: c.card, borderColor: c.border, borderRadius: c.radius },
            ]}
          >
            <Feather name="sun" size={28} color={c.mutedForeground} />
            <Text
              style={[
                styles.emptyText,
                { color: c.mutedForeground, fontFamily: "Inter_400Regular" },
              ]}
            >
              No tasks due today
            </Text>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.itemPad}>
        <TaskCard task={item} onComplete={completeTask} onPress={handleEdit} />
      </View>
    );
  }

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* ── fixed header ── */}
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
        <View style={styles.headerLeft}>
          <Text
            style={[
              styles.dateLabel,
              { color: c.mutedForeground, fontFamily: "Inter_400Regular" },
            ]}
          >
            {todayDate}
          </Text>
          <Text
            style={[styles.titleText, { color: c.foreground, fontFamily: "Inter_700Bold" }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {title}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => router.push("/settings")}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[styles.iconBtn, { backgroundColor: c.secondary, borderRadius: 20 }]}
          >
            <Feather name="settings" size={18} color={c.foreground} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push("/popo")}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[styles.iconBtn, { backgroundColor: c.primary + "18", borderRadius: 20 }]}
          >
            <Feather name="zap" size={18} color={c.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setVoiceModalVisible(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[styles.iconBtn, { backgroundColor: c.secondary, borderRadius: 20 }]}
          >
            <Feather name="mic" size={18} color={c.foreground} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setSelectedTask(null);
              setPrefillData(undefined);
              setModalVisible(true);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[styles.iconBtn, { backgroundColor: c.primary, borderRadius: 20 }]}
          >
            <Feather name="plus" size={20} color={c.primaryForeground} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── timeline ── */}
      <SectionList<TimelineItem, TimelineSection>
        style={styles.flex}
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset + 32 }}
        SectionSeparatorComponent={() => (
          <View style={[styles.sectionSep, { backgroundColor: c.border }]} />
        )}
      />

      <OverduePromptManager />

      <VoiceTaskModal
        visible={voiceModalVisible}
        onClose={() => setVoiceModalVisible(false)}
        onConfirm={(parsed) => {
          setPrefillData(parsed);
          setSelectedTask(null);
          setVoiceModalVisible(false);
          setModalVisible(true);
        }}
      />

      <TaskModal
        visible={modalVisible}
        task={selectedTask}
        prefilled={selectedTask ? undefined : prefillData}
        onClose={() => {
          setModalVisible(false);
          setSelectedTask(null);
          setPrefillData(undefined);
        }}
      />
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
  headerLeft: { flex: 1 },
  headerActions: { flexDirection: "row", gap: 10, alignItems: "center" },
  iconBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  dateLabel: { fontSize: 13, marginBottom: 2 },
  titleText: { fontSize: 32 },
  // section header (sticky)
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 10,
  },
  sectionTitle: { fontSize: 11, letterSpacing: 1 },
  overdueBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  overdueBadgeText: { fontSize: 11 },
  sectionSep: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  // items
  itemPad: { paddingHorizontal: 16 },
  emptyCard: {
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  emptyText: { fontSize: 14 },
});
