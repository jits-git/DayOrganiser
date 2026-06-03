import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useRef, useMemo, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
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
import colors from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
import { ParsedVoiceInput } from "@/utils/parseVoice";
import { Task } from "@/types/task";

const SCREEN_WIDTH = Dimensions.get("window").width;

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getCalendarGrid(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const rows: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function MonthScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { tasks, completeTask } = useTasks();

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<Date>(now);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [touchStartX, setTouchStartX] = useState(0);
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);
  const [prefillData, setPrefillData] = useState<ParsedVoiceInput | undefined>(undefined);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const animatingRef = useRef(false);

  const grid = useMemo(() => getCalendarGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      const targetD = new Date(task.targetDate);
      const deadlineD = new Date(task.hardDeadline);

      const targetInMonth = targetD.getFullYear() === viewYear && targetD.getMonth() === viewMonth;
      const deadlineInMonth = deadlineD.getFullYear() === viewYear && deadlineD.getMonth() === viewMonth;

      if (!targetInMonth && !deadlineInMonth) continue;

      if (targetInMonth) {
        const targetKey = targetD.toDateString();
        if (!map.has(targetKey)) map.set(targetKey, []);
        if (!map.get(targetKey)!.find((t) => t.id === task.id)) {
          map.get(targetKey)!.push(task);
        }
      }

      if (deadlineInMonth) {
        const deadlineKey = deadlineD.toDateString();
        const targetKey = targetD.toDateString();
        if (deadlineKey !== targetKey) {
          if (!map.has(deadlineKey)) map.set(deadlineKey, []);
          if (!map.get(deadlineKey)!.find((t) => t.id === task.id)) {
            map.get(deadlineKey)!.push(task);
          }
        }
      }
    }
    return map;
  }, [tasks, viewYear, viewMonth]);

  const selectedDateTasks = useMemo(
    () => tasksByDate.get(selectedDate.toDateString()) ?? [],
    [tasksByDate, selectedDate]
  );

  function changeMonth(direction: "prev" | "next") {
    if (animatingRef.current) return;
    animatingRef.current = true;

    const exitTo = direction === "next" ? -SCREEN_WIDTH : SCREEN_WIDTH;
    const enterFrom = direction === "next" ? SCREEN_WIDTH : -SCREEN_WIDTH;

    Animated.timing(slideAnim, {
      toValue: exitTo,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      let newYear = viewYear;
      let newMonth: number;
      if (direction === "next") {
        if (viewMonth === 11) { newYear = viewYear + 1; newMonth = 0; }
        else { newMonth = viewMonth + 1; }
      } else {
        if (viewMonth === 0) { newYear = viewYear - 1; newMonth = 11; }
        else { newMonth = viewMonth - 1; }
      }
      setViewYear(newYear);
      setViewMonth(newMonth);
      const todayInNewMonth = now.getFullYear() === newYear && now.getMonth() === newMonth;
      setSelectedDate(todayInNewMonth ? now : new Date(newYear, newMonth, 1));

      slideAnim.setValue(enterFrom);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        animatingRef.current = false;
      });
    });
  }

  function handleEdit(task: Task) {
    setSelectedTask(task);
    setModalVisible(true);
  }

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

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
        <View style={styles.monthNav}>
          <TouchableOpacity
            onPress={() => changeMonth("prev")}
            style={[styles.navBtn, { backgroundColor: c.secondary, borderRadius: 20 }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="chevron-left" size={20} color={c.foreground} />
          </TouchableOpacity>
          <Text style={[styles.monthLabel, { color: c.foreground, fontFamily: "Inter_700Bold" }]}>
            {monthLabel}
          </Text>
          <TouchableOpacity
            onPress={() => changeMonth("next")}
            style={[styles.navBtn, { backgroundColor: c.secondary, borderRadius: 20 }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="chevron-right" size={20} color={c.foreground} />
          </TouchableOpacity>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => router.push("/settings")}
            style={[styles.iconBtn, { backgroundColor: c.secondary, borderRadius: 20 }]}
          >
            <Feather name="settings" size={18} color={c.foreground} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setVoiceModalVisible(true)}
            style={[styles.iconBtn, { backgroundColor: c.secondary, borderRadius: 20 }]}
          >
            <Feather name="mic" size={18} color={c.foreground} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setSelectedTask(null); setPrefillData(undefined); setModalVisible(true); }}
            style={[styles.iconBtn, { backgroundColor: c.primary, borderRadius: 20 }]}
          >
            <Feather name="plus" size={20} color={c.primaryForeground} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.calendarContainer, { backgroundColor: c.background }]}>
        <View style={[styles.dayLabels, { borderBottomColor: c.border }]}>
          {DAY_LABELS.map((d) => (
            <Text
              key={d}
              style={[
                styles.dayLabelText,
                { color: c.mutedForeground, fontFamily: "Inter_500Medium" },
              ]}
            >
              {d}
            </Text>
          ))}
        </View>

        <View style={styles.gridWrapper}>
          <Animated.View
            style={[styles.gridContent, { transform: [{ translateX: slideAnim }] }]}
            onTouchStart={(e) => setTouchStartX(e.nativeEvent.pageX)}
            onTouchEnd={(e) => {
              const diff = e.nativeEvent.pageX - touchStartX;
              if (Math.abs(diff) > 60) {
                if (diff > 0) changeMonth("prev");
                else changeMonth("next");
              }
            }}
          >
            {grid.map((row, ri) => (
              <View key={ri} style={styles.calRow}>
                {row.map((date, ci) => {
                  if (!date) return <View key={ci} style={styles.calCell} />;

                  const isToday = isSameDay(date, now);
                  const isSelected = isSameDay(date, selectedDate);
                  const isPast = date < new Date(now.getFullYear(), now.getMonth(), now.getDate());
                  const dateTasks = tasksByDate.get(date.toDateString()) ?? [];
                  const dotColors = dateTasks.slice(0, 3).map((t) => t.color ?? c.primary);

                  return (
                    <TouchableOpacity
                      key={ci}
                      style={[
                        styles.calCell,
                        isSelected && {
                          backgroundColor: c.primary,
                          borderRadius: 24,
                        },
                        isToday && !isSelected && {
                          borderWidth: 1.5,
                          borderColor: c.primary,
                          borderRadius: 24,
                        },
                      ]}
                      onPress={() => setSelectedDate(date)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.calDate,
                          {
                            color: isSelected
                              ? c.primaryForeground
                              : isPast
                              ? c.mutedForeground
                              : c.foreground,
                            fontFamily: isToday || isSelected ? "Inter_700Bold" : "Inter_400Regular",
                          },
                        ]}
                      >
                        {date.getDate()}
                      </Text>
                      {dotColors.length > 0 && (
                        <View style={styles.dotRow}>
                          {dotColors.map((col, di) => (
                            <View
                              key={di}
                              style={[
                                styles.dot,
                                {
                                  backgroundColor: isSelected ? c.primaryForeground + "AA" : col,
                                },
                              ]}
                            />
                          ))}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </Animated.View>
        </View>
      </View>

      <View style={[styles.divider, { borderTopColor: c.border }]} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.taskList, { paddingBottom: bottomInset + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.selectedDateLabel, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </Text>

        {selectedDateTasks.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: c.card, borderColor: c.border, borderRadius: c.radius }]}>
            <Feather name="calendar" size={22} color={c.mutedForeground} />
            <Text style={[styles.emptyText, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              No tasks on this day
            </Text>
          </View>
        ) : (
          selectedDateTasks.map((t) => (
            <TaskCard key={t.id} task={t} onComplete={completeTask} onPress={handleEdit} />
          ))
        )}
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
        initialDate={selectedDate}
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
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  monthNav: { flexDirection: "row", alignItems: "center", gap: 12 },
  monthLabel: { fontSize: 18 },
  navBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerActions: { flexDirection: "row", gap: 10, alignItems: "center" },
  iconBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  calendarContainer: { paddingHorizontal: 8 },
  dayLabels: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 8,
    paddingTop: 8,
  },
  dayLabelText: { flex: 1, textAlign: "center", fontSize: 12 },
  gridWrapper: { overflow: "hidden" },
  gridContent: {},
  calRow: { flexDirection: "row", marginTop: 2 },
  calCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
  },
  calDate: { fontSize: 14 },
  dotRow: { flexDirection: "row", gap: 2, marginTop: 1 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8 },
  taskList: { paddingHorizontal: 16, paddingTop: 12 },
  selectedDateLabel: {
    fontSize: 12,
    letterSpacing: 0.3,
    marginBottom: 10,
  },
  emptyCard: {
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
    gap: 8,
  },
  emptyText: { fontSize: 14 },
});
