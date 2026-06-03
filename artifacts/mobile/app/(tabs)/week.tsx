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

import { TaskCard } from "@/components/TaskCard";
import { TaskModal } from "@/components/TaskModal";
import { VoiceTaskModal } from "@/components/VoiceTaskModal";
import { useTasks } from "@/context/TaskContext";
import { useColors } from "@/hooks/useColors";
import { ParsedVoiceInput } from "@/utils/parseVoice";
import { Task } from "@/types/task";

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getWeekDays(now: Date): Date[] {
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function formatWeekRange(days: Date[]): string {
  const first = days[0];
  const last = days[6];
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${first.toLocaleDateString(undefined, opts)} – ${last.toLocaleDateString(undefined, opts)}`;
}

export default function WeekScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { tasks, completeTask } = useTasks();

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [initialDate, setInitialDate] = useState<Date | undefined>(undefined);
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);
  const [prefillData, setPrefillData] = useState<ParsedVoiceInput | undefined>(undefined);

  const now = new Date();
  const weekDays = getWeekDays(now);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const day of weekDays) {
      map.set(day.toDateString(), []);
    }
    for (const task of tasks) {
      const target = new Date(task.targetDate);
      const deadline = new Date(task.hardDeadline);
      for (const day of weekDays) {
        if (isSameDay(target, day) || isSameDay(deadline, day)) {
          map.get(day.toDateString())!.push(task);
          break;
        }
      }
    }
    return map;
  }, [tasks, weekDays]);

  function handleEdit(task: Task) {
    setSelectedTask(task);
    setInitialDate(undefined);
    setModalVisible(true);
  }

  function handleAddForDay(day: Date) {
    setSelectedTask(null);
    setInitialDate(day);
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
        <View>
          <Text style={[styles.rangeLabel, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {formatWeekRange(weekDays)}
          </Text>
          <Text style={[styles.title, { color: c.foreground, fontFamily: "Inter_700Bold" }]}>
            This Week
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
            onPress={() => { setSelectedTask(null); setPrefillData(undefined); setInitialDate(now); setModalVisible(true); }}
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
        {weekDays.map((day) => {
          const isToday = isSameDay(day, now);
          const isPast = day < now && !isToday;
          const dayTasks = tasksByDay.get(day.toDateString()) ?? [];

          return (
            <View key={day.toDateString()} style={styles.daySection}>
              <TouchableOpacity
                style={[
                  styles.dayHeaderRow,
                  {
                    backgroundColor: isToday ? c.primary : c.card,
                    borderColor: isToday ? c.primary : c.border,
                    borderRadius: c.radius,
                  },
                ]}
                onPress={() => handleAddForDay(day)}
                activeOpacity={0.7}
              >
                <View style={styles.dayHeaderLeft}>
                  <Text
                    style={[
                      styles.dayName,
                      {
                        color: isToday ? c.primaryForeground : isPast ? c.mutedForeground : c.foreground,
                        fontFamily: "Inter_700Bold",
                      },
                    ]}
                  >
                    {day.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase()}
                  </Text>
                  <Text
                    style={[
                      styles.dayNumber,
                      {
                        color: isToday ? c.primaryForeground : isPast ? c.mutedForeground : c.foreground,
                        fontFamily: "Inter_600SemiBold",
                      },
                    ]}
                  >
                    {day.getDate()}
                  </Text>
                  {isToday && (
                    <View style={[styles.todayDot, { backgroundColor: c.primaryForeground }]} />
                  )}
                </View>
                <View style={styles.dayHeaderRight}>
                  {dayTasks.length > 0 && (
                    <Text
                      style={[
                        styles.taskCount,
                        {
                          color: isToday ? c.primaryForeground + "CC" : c.mutedForeground,
                          fontFamily: "Inter_400Regular",
                        },
                      ]}
                    >
                      {dayTasks.length} task{dayTasks.length !== 1 ? "s" : ""}
                    </Text>
                  )}
                  <Feather
                    name="plus"
                    size={16}
                    color={isToday ? c.primaryForeground : c.mutedForeground}
                  />
                </View>
              </TouchableOpacity>

              {dayTasks.map((t) => (
                <TaskCard key={t.id} task={t} onComplete={completeTask} onPress={handleEdit} />
              ))}

              {dayTasks.length === 0 && (
                <View
                  style={[
                    styles.emptyDay,
                    { borderColor: c.border, borderRadius: c.radius },
                  ]}
                >
                  <Text style={[styles.emptyDayText, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    {isPast ? "No tasks" : "Nothing scheduled"}
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

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
        initialDate={initialDate}
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
  rangeLabel: { fontSize: 13, marginBottom: 2 },
  title: { fontSize: 32 },
  headerActions: { flexDirection: "row", gap: 10, alignItems: "center" },
  iconBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: 16, paddingTop: 16 },
  daySection: { marginBottom: 14 },
  dayHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  dayHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  dayName: { fontSize: 12, letterSpacing: 0.5 },
  dayNumber: { fontSize: 20 },
  todayDot: { width: 6, height: 6, borderRadius: 3 },
  dayHeaderRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  taskCount: { fontSize: 13 },
  emptyDay: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderStyle: "dashed",
  },
  emptyDayText: { fontSize: 13 },
});
