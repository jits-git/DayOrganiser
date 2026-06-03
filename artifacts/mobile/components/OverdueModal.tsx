import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useColors } from "@/hooks/useColors";
import { useTasks } from "@/context/TaskContext";
import { Task } from "@/types/task";
import { TaskModal } from "@/components/TaskModal";

interface OverdueEntry {
  task: Task;
  type: "target" | "deadline";
}

export function OverduePromptManager() {
  const c = useColors();
  const { tasks, completeTask, updateTask } = useTasks();

  const [queue, setQueue] = useState<OverdueEntry[]>([]);
  const [replanTask, setReplanTask] = useState<Task | null>(null);

  useEffect(() => {
    const now = new Date();
    const entries: OverdueEntry[] = [];

    for (const task of tasks) {
      if (task.isCompleted) continue;

      if (!task.targetOverduePrompted && new Date(task.targetDate) < now) {
        entries.push({ task, type: "target" });
      }
      if (!task.deadlineOverduePrompted && new Date(task.hardDeadline) < now) {
        entries.push({ task, type: "deadline" });
      }
    }

    if (entries.length > 0) {
      setQueue(entries);
    }
  }, []);

  const current = queue[0];

  async function dismiss(markField: "targetOverduePrompted" | "deadlineOverduePrompted") {
    if (!current) return;
    await updateTask(current.task.id, { [markField]: true });
    setQueue((prev) => prev.slice(1));
  }

  async function handleComplete() {
    if (!current) return;
    await completeTask(current.task.id);
    setQueue((prev) => prev.slice(1));
  }

  async function handleReplan() {
    if (!current) return;
    const field =
      current.type === "target" ? "targetOverduePrompted" : "deadlineOverduePrompted";
    await updateTask(current.task.id, { [field]: true });
    setQueue((prev) => prev.slice(1));
    setReplanTask(current.task);
  }

  const isDeadline = current?.type === "deadline";

  return (
    <>
      <Modal
        visible={!!current && !replanTask}
        transparent
        animationType="fade"
        onRequestClose={() =>
          dismiss(isDeadline ? "deadlineOverduePrompted" : "targetOverduePrompted")
        }
      >
        <View style={styles.overlay}>
          <Animated.View
            entering={FadeInDown.duration(300)}
            style={[
              styles.card,
              {
                backgroundColor: c.card,
                borderRadius: c.radius + 4,
                borderColor: isDeadline ? c.destructive : c.accent,
              },
            ]}
          >
            <View
              style={[
                styles.iconRow,
                {
                  backgroundColor: isDeadline
                    ? c.destructive + "20"
                    : c.accent + "20",
                  borderRadius: 24,
                },
              ]}
            >
              <Feather
                name={isDeadline ? "alert-octagon" : "alert-triangle"}
                size={28}
                color={isDeadline ? c.destructive : c.accent}
              />
            </View>

            <Text
              style={[
                styles.title,
                {
                  color: isDeadline ? c.destructive : c.accent,
                  fontFamily: "Inter_700Bold",
                },
              ]}
            >
              {isDeadline ? "Hard Deadline Passed" : "Target Time Passed"}
            </Text>

            <Text
              style={[
                styles.taskName,
                { color: c.foreground, fontFamily: "Inter_600SemiBold" },
              ]}
            >
              {current?.task.description}
            </Text>

            <Text
              style={[
                styles.subtitle,
                { color: c.mutedForeground, fontFamily: "Inter_400Regular" },
              ]}
            >
              {isDeadline
                ? "The hard deadline for this task has passed."
                : "The target completion time for this task has passed."}
              {"\n"}
              Did you complete it or do you need to reschedule?
            </Text>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                onPress={handleReplan}
                style={[
                  styles.btn,
                  styles.replanBtn,
                  { borderColor: c.border, borderRadius: c.radius },
                ]}
              >
                <Feather name="refresh-cw" size={15} color={c.foreground} />
                <Text
                  style={[
                    styles.btnText,
                    { color: c.foreground, fontFamily: "Inter_500Medium" },
                  ]}
                >
                  Replan
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleComplete}
                style={[
                  styles.btn,
                  styles.completeBtn,
                  { backgroundColor: c.primary, borderRadius: c.radius },
                ]}
              >
                <Feather name="check" size={15} color={c.primaryForeground} />
                <Text
                  style={[
                    styles.btnText,
                    { color: c.primaryForeground, fontFamily: "Inter_600SemiBold" },
                  ]}
                >
                  Mark Done
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      <TaskModal
        visible={!!replanTask}
        task={replanTask}
        onClose={() => setReplanTask(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    padding: 24,
    alignItems: "center",
    gap: 12,
    borderWidth: 1.5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  iconRow: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    textAlign: "center",
  },
  taskName: {
    fontSize: 20,
    textAlign: "center",
    lineHeight: 26,
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 4,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
    width: "100%",
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
  },
  replanBtn: {
    borderWidth: 1,
  },
  completeBtn: {},
  btnText: {
    fontSize: 15,
  },
});
