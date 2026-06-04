import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Platform,
  ScrollView,
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

function getGreeting(hour: number, name: string): string {
  if (!name) return "Today";
  const period = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return `Good ${period}, ${name}!`;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getEndOfWeek(d: Date): Date {
  const day = d.getDay();
  const end = new Date(d);
  end.setDate(d.getDate() + (day === 0 ? 0 : 7 - day));
  end.setHours(23, 59, 59, 999);
  return end;
}

function getRemainingWeekDays(now: Date): Date[] {
  const endOfWeek = getEndOfWeek(now);
  const days: Date[] = [];
  const start = new Date(now);
  start.setDate(now.getDate() + 1);
  start.setHours(0, 0, 0, 0);
  const cur = new Date(start);
  while (cur <= endOfWeek) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function formatDayHeader(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function formatShortTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

interface DayGroupProps {
  day: Date;
  tasks: Task[];
  onComplete: (id: string) => void;
  onPress: (task: Task) => void;
  colors: ReturnType<typeof useColors>;
}

function DayGroup({ day, tasks, onComplete, onPress, colors }: DayGroupProps) {
  if (tasks.length === 0) return null;
  return (
    <View style={styles.dayGroup}>
      <Text style={[styles.dayLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
        {formatDayHeader(day)}
      </Text>
      {tasks.map((t) => (
        <TaskCard key={t.id} task={t} onComplete={onComplete} onPress={onPress} />
      ))}
    </View>
  );
}

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

  const { overdueToday, activeToday, completedToday, weekDays, weekTasksMap, comingDates, comingTasksMap } =
    useMemo(() => {
      const endOfWeek = getEndOfWeek(now);
      const remainingWeek = getRemainingWeekDays(now);

      const overdueToday: Task[] = [];
      const activeToday: Task[] = [];
      const completedToday: Task[] = [];

      const weekTasksMap: Map<string, Task[]> = new Map();
      const comingTasksMap: Map<string, Task[]> = new Map();

      for (const day of remainingWeek) {
        weekTasksMap.set(day.toDateString(), []);
      }

      for (const task of tasks) {
        const target = new Date(task.targetDate);
        const deadline = new Date(task.hardDeadline);

        if (task.isCompleted) {
          if (task.completedAt && isSameDay(new Date(task.completedAt), now)) {
            completedToday.push(task);
          }
          continue;
        }

        const deadlinePast = deadline < now;
        const targetToday = isSameDay(target, now);
        const deadlineToday = isSameDay(deadline, now);

        if (deadlinePast) {
          overdueToday.push(task);
        } else if (targetToday || deadlineToday) {
          activeToday.push(task);
        } else {
          const refDate = deadline < endOfWeek ? deadline : target < endOfWeek ? target : null;
          if (refDate && refDate > now) {
            const key = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate()).toDateString();
            if (weekTasksMap.has(key)) {
              weekTasksMap.get(key)!.push(task);
            } else {
              const comingKey = new Date(
                deadline.getFullYear(),
                deadline.getMonth(),
                deadline.getDate()
              ).toDateString();
              if (!comingTasksMap.has(comingKey)) comingTasksMap.set(comingKey, []);
              comingTasksMap.get(comingKey)!.push(task);
            }
          } else {
            const comingKey = new Date(
              deadline.getFullYear(),
              deadline.getMonth(),
              deadline.getDate()
            ).toDateString();
            if (!comingTasksMap.has(comingKey)) comingTasksMap.set(comingKey, []);
            comingTasksMap.get(comingKey)!.push(task);
          }
        }
      }

      const comingDates = Array.from(comingTasksMap.keys())
        .map((k) => new Date(k))
        .sort((a, b) => a.getTime() - b.getTime());

      return {
        overdueToday,
        activeToday,
        completedToday,
        weekDays: remainingWeek,
        weekTasksMap,
        comingDates,
        comingTasksMap,
      };
    }, [tasks]);

  const hasWeekTasks = weekDays.some((d) => (weekTasksMap.get(d.toDateString()) ?? []).length > 0);
  const hasComingTasks = comingDates.length > 0;

  function handleEdit(task: Task) {
    setSelectedTask(task);
    setModalVisible(true);
  }

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
        <View style={styles.headerLeft}>
          <Text style={[styles.dateLabel, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {todayDate}
          </Text>
          <Text
            style={[styles.title, { color: c.foreground, fontFamily: "Inter_700Bold" }]}
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
            onPress={() => setVoiceModalVisible(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[styles.iconBtn, { backgroundColor: c.secondary, borderRadius: 20 }]}
          >
            <Feather name="mic" size={18} color={c.foreground} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setSelectedTask(null); setPrefillData(undefined); setModalVisible(true); }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[styles.iconBtn, { backgroundColor: c.primary, borderRadius: 20 }]}
          >
            <Feather name="plus" size={20} color={c.primaryForeground} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomInset + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: c.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
            TODAY
          </Text>
          {overdueToday.length > 0 && (
            <View style={[styles.overdueBadge, { backgroundColor: c.destructive }]}>
              <Text style={[styles.overdueBadgeText, { color: c.destructiveForeground, fontFamily: "Inter_600SemiBold" }]}>
                {overdueToday.length} overdue
              </Text>
            </View>
          )}
        </View>

        {overdueToday.map((t) => (
          <TaskCard key={t.id} task={t} onComplete={completeTask} onPress={handleEdit} />
        ))}

        {activeToday.map((t) => (
          <TaskCard key={t.id} task={t} onComplete={completeTask} onPress={handleEdit} />
        ))}

        {completedToday.map((t) => (
          <TaskCard key={t.id} task={t} onComplete={completeTask} onPress={handleEdit} />
        ))}

        {overdueToday.length === 0 && activeToday.length === 0 && completedToday.length === 0 && (
          <View style={[styles.emptyCard, { backgroundColor: c.card, borderColor: c.border, borderRadius: c.radius }]}>
            <Feather name="sun" size={28} color={c.mutedForeground} />
            <Text style={[styles.emptyText, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              No tasks due today
            </Text>
          </View>
        )}

        {hasWeekTasks && (
          <>
            <View style={[styles.sectionDivider, { borderTopColor: c.border }]} />
            <Text style={[styles.sectionTitle, { color: c.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
              THIS WEEK
            </Text>
            {weekDays.map((day) => (
              <DayGroup
                key={day.toDateString()}
                day={day}
                tasks={weekTasksMap.get(day.toDateString()) ?? []}
                onComplete={completeTask}
                onPress={handleEdit}
                colors={c}
              />
            ))}
          </>
        )}

        {hasComingTasks && (
          <>
            <View style={[styles.sectionDivider, { borderTopColor: c.border }]} />
            <Text style={[styles.sectionTitle, { color: c.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
              COMING UP
            </Text>
            {comingDates.map((date) => (
              <DayGroup
                key={date.toDateString()}
                day={date}
                tasks={comingTasksMap.get(date.toDateString()) ?? []}
                onComplete={completeTask}
                onPress={handleEdit}
                colors={c}
              />
            ))}
          </>
        )}
      </ScrollView>

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
        onClose={() => { setModalVisible(false); setSelectedTask(null); setPrefillData(undefined); }}
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
  title: { fontSize: 32 },
  scroll: { paddingHorizontal: 16, paddingTop: 16 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  sectionTitle: { fontSize: 11, letterSpacing: 1 },
  overdueBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  overdueBadgeText: { fontSize: 11 },
  sectionDivider: { borderTopWidth: StyleSheet.hairlineWidth, marginVertical: 20 },
  dayGroup: { marginBottom: 12 },
  dayLabel: { fontSize: 12, letterSpacing: 0.3, marginBottom: 8 },
  emptyCard: {
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  emptyText: { fontSize: 14 },
});
