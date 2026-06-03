import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from "react-native-reanimated";

import { useColors } from "@/hooks/useColors";
import { Task } from "@/types/task";

interface TaskCardProps {
  task: Task;
  onComplete: (id: string) => void;
  onPress: (task: Task) => void;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function isOverdue(iso: string): boolean {
  return new Date(iso) < new Date();
}

export function TaskCard({ task, onComplete, onPress }: TaskCardProps) {
  const colors = useColors();
  const scale = useSharedValue(1);

  const hardOverdue = !task.isCompleted && isOverdue(task.hardDeadline);
  const targetOverdue = !task.isCompleted && isOverdue(task.targetDate) && !hardOverdue;

  let statusColor = task.color ?? colors.primary;
  if (task.isCompleted) statusColor = colors.mutedForeground;
  else if (hardOverdue) statusColor = colors.destructive;
  else if (targetOverdue) statusColor = colors.accent;
  else if (task.color) statusColor = task.color;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  async function handleComplete() {
    if (task.isCompleted) return;
    scale.value = withSequence(withSpring(0.95), withSpring(1));
    if (Platform.OS !== "web") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onComplete(task.id);
  }

  return (
    <Animated.View entering={FadeIn.duration(250)}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => onPress(task)}
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderRadius: colors.radius,
          },
        ]}
      >
        <Animated.View style={[styles.inner, animatedStyle]}>
          <View style={[styles.accent, { backgroundColor: statusColor }]} />

          <View style={styles.content}>
            <Text
              style={[
                styles.description,
                {
                  color: task.isCompleted ? colors.mutedForeground : colors.foreground,
                  textDecorationLine: task.isCompleted ? "line-through" : "none",
                  fontFamily: "Inter_600SemiBold",
                },
              ]}
              numberOfLines={2}
            >
              {task.description}
            </Text>

            {!!task.detail && (
              <Text
                style={[
                  styles.detail,
                  { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
                ]}
                numberOfLines={1}
              >
                {task.detail}
              </Text>
            )}

            <View style={styles.metaRow}>
              <Feather name="clock" size={12} color={colors.mutedForeground} />
              <Text
                style={[
                  styles.metaText,
                  {
                    color:
                      targetOverdue && !task.isCompleted
                        ? colors.accent
                        : colors.mutedForeground,
                    fontFamily: "Inter_400Regular",
                  },
                ]}
              >
                Target: {formatDateTime(task.targetDate)}
              </Text>
            </View>

            <View style={styles.metaRow}>
              <Feather
                name="alert-triangle"
                size={12}
                color={hardOverdue && !task.isCompleted ? colors.destructive : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.metaText,
                  {
                    color:
                      hardOverdue && !task.isCompleted
                        ? colors.destructive
                        : colors.mutedForeground,
                    fontFamily: "Inter_400Regular",
                  },
                ]}
              >
                Deadline: {formatDateTime(task.hardDeadline)}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={handleComplete}
            style={[
              styles.checkBtn,
              {
                borderColor: task.isCompleted ? colors.primary : colors.border,
                backgroundColor: task.isCompleted ? colors.primary : "transparent",
                borderRadius: 20,
              },
            ]}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            {task.isCompleted && (
              <Feather name="check" size={14} color={colors.primaryForeground} />
            )}
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    marginBottom: 8,
    overflow: "hidden",
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  accent: {
    width: 4,
    alignSelf: "stretch",
    borderRadius: 2,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  description: {
    fontSize: 15,
    lineHeight: 20,
  },
  detail: {
    fontSize: 12,
    lineHeight: 16,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metaText: {
    fontSize: 12,
  },
  checkBtn: {
    width: 28,
    height: 28,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
