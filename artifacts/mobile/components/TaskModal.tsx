import DateTimePicker from "@react-native-community/datetimepicker";
import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useTasks } from "@/context/TaskContext";
import { useSettings } from "@/context/SettingsContext";
import { Task } from "@/types/task";
import colors from "@/constants/colors";

interface PrefilledTask {
  description?: string;
  targetDate?: Date;
  hardDeadline?: Date;
}

interface TaskModalProps {
  visible: boolean;
  task?: Task | null;
  initialDate?: Date;
  prefilled?: PrefilledTask;
  onClose: () => void;
}

type PickerTarget = "targetDate" | "targetTime" | "deadlineDate" | "deadlineTime";

function computeDefaultDeadline(target: Date, offsetDays: number): Date {
  if (offsetDays === 0) {
    const eod = new Date(target.getFullYear(), target.getMonth(), target.getDate(), 23, 59, 0, 0);
    return eod > target ? eod : new Date(target.getTime() + 2 * 60 * 60 * 1000);
  }
  return new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate() + offsetDays,
    target.getHours(),
    target.getMinutes(),
    0,
    0
  );
}

function roundToNext15(d: Date): Date {
  const ms = 15 * 60 * 1000;
  return new Date(Math.ceil(d.getTime() / ms) * ms);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function TaskModal({ visible, task, initialDate, prefilled, onClose }: TaskModalProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { addTask, updateTask, deleteTask } = useTasks();
  const { settings } = useSettings();

  const isEdit = !!task;

  const [description, setDescription] = useState("");
  const [detail, setDetail] = useState("");
  const [selectedColor, setSelectedColor] = useState<string | undefined>(undefined);
  const [isImportant, setIsImportant] = useState(false);
  const [targetDate, setTargetDate] = useState<Date>(roundToNext15(new Date()));
  const [hardDeadline, setHardDeadline] = useState<Date>(
    roundToNext15(new Date(Date.now() + 2 * 60 * 60 * 1000))
  );
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);

  useEffect(() => {
    if (visible) {
      if (task) {
        setDescription(task.description);
        setDetail(task.detail ?? "");
        setSelectedColor(task.color);
        setIsImportant(task.isImportant ?? false);
        setTargetDate(new Date(task.targetDate));
        setHardDeadline(new Date(task.hardDeadline));
      } else {
        setDescription(prefilled?.description ?? "");
        setDetail("");
        setSelectedColor(undefined);
        setIsImportant(false);
        const base = prefilled?.targetDate
          ? prefilled.targetDate
          : initialDate
          ? roundToNext15(new Date(initialDate.setHours(9, 0, 0, 0)))
          : roundToNext15(new Date());
        setTargetDate(base);
        setHardDeadline(
          prefilled?.hardDeadline ??
          computeDefaultDeadline(base, settings.hardDeadlineOffsetDays ?? 0)
        );
      }
      setPickerTarget(null);
    }
  }, [visible, task, initialDate, prefilled]);

  function handlePickerChange(_: unknown, selected?: Date) {
    if (!selected || !pickerTarget) {
      setPickerTarget(null);
      return;
    }

    const mergeDate = (existing: Date, newDate: Date) => {
      const merged = new Date(newDate);
      merged.setHours(existing.getHours(), existing.getMinutes(), 0, 0);
      return merged;
    };

    const mergeTime = (existing: Date, newTime: Date) => {
      const merged = new Date(existing);
      merged.setHours(newTime.getHours(), newTime.getMinutes(), 0, 0);
      return merged;
    };

    const offset = settings.hardDeadlineOffsetDays ?? 0;

    const applyChanges = () => {
      if (pickerTarget === "targetDate") {
        const newTarget = mergeDate(targetDate, selected);
        setTargetDate(newTarget);
        if (newTarget >= hardDeadline) setHardDeadline(computeDefaultDeadline(newTarget, offset));
      } else if (pickerTarget === "targetTime") {
        const newTarget = mergeTime(targetDate, selected);
        setTargetDate(newTarget);
        if (newTarget >= hardDeadline) setHardDeadline(computeDefaultDeadline(newTarget, offset));
      } else if (pickerTarget === "deadlineDate") {
        const newDeadline = mergeDate(hardDeadline, selected);
        setHardDeadline(newDeadline <= targetDate ? computeDefaultDeadline(targetDate, offset) : newDeadline);
      } else if (pickerTarget === "deadlineTime") {
        const newDeadline = mergeTime(hardDeadline, selected);
        setHardDeadline(newDeadline <= targetDate ? computeDefaultDeadline(targetDate, offset) : newDeadline);
      }
    };

    if (Platform.OS === "android") {
      applyChanges();
      setPickerTarget(null);
    } else {
      applyChanges();
    }
  }

  async function handleSave() {
    if (!description.trim()) {
      Alert.alert("Required", "Please enter what you would like to do.");
      return;
    }
    if (targetDate >= hardDeadline) {
      Alert.alert("Invalid dates", "Target completion time must be before the hard deadline.");
      return;
    }

    if (isEdit && task) {
      await updateTask(task.id, {
        description: description.trim(),
        detail: detail.trim() || undefined,
        color: selectedColor,
        isImportant,
        targetDate: targetDate.toISOString(),
        hardDeadline: hardDeadline.toISOString(),
        targetOverduePrompted: false,
        deadlineOverduePrompted: false,
      });
    } else {
      await addTask({
        description: description.trim(),
        detail: detail.trim() || undefined,
        color: selectedColor,
        isImportant,
        targetDate: targetDate.toISOString(),
        hardDeadline: hardDeadline.toISOString(),
      });
    }
    onClose();
  }

  async function handleDelete() {
    if (!task) return;
    Alert.alert("Delete task", "Are you sure you want to delete this task?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteTask(task.id);
          onClose();
        },
      },
    ]);
  }

  const currentPickerValue =
    pickerTarget === "targetDate" || pickerTarget === "targetTime"
      ? targetDate
      : hardDeadline;

  const pickerMode: "date" | "time" =
    pickerTarget === "targetDate" || pickerTarget === "deadlineDate" ? "date" : "time";

  const iosPickerVisible = Platform.OS === "ios" && pickerTarget !== null;
  const androidPickerVisible = Platform.OS === "android" && pickerTarget !== null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={[styles.flex, { backgroundColor: c.background }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={[
            styles.header,
            {
              paddingTop: Platform.OS === "ios" ? 20 : insets.top + 16,
              borderBottomColor: c.border,
            },
          ]}
        >
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Feather name="x" size={22} color={c.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: c.foreground, fontFamily: "Inter_600SemiBold" }]}>
            {isEdit ? "Edit Task" : "New Task"}
          </Text>
          <TouchableOpacity onPress={handleSave} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Feather name="check" size={22} color={c.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.label, { color: c.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            WHAT WOULD YOU LIKE TO DO?
          </Text>
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: c.card,
                borderColor: c.border,
                color: c.foreground,
                borderRadius: c.radius,
                fontFamily: "Inter_400Regular",
              },
            ]}
            placeholder="Describe your task..."
            placeholderTextColor={c.mutedForeground}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={2}
            textAlignVertical="top"
            autoFocus={!isEdit}
          />

          <Text
            style={[
              styles.label,
              { color: c.mutedForeground, fontFamily: "Inter_500Medium", marginTop: 20 },
            ]}
          >
            DETAILS{" "}
            <Text style={{ color: c.mutedForeground, fontWeight: "400" }}>(optional)</Text>
          </Text>
          <TextInput
            style={[
              styles.textInput,
              styles.detailInput,
              {
                backgroundColor: c.card,
                borderColor: c.border,
                color: c.foreground,
                borderRadius: c.radius,
                fontFamily: "Inter_400Regular",
              },
            ]}
            placeholder="Add more context or notes..."
            placeholderTextColor={c.mutedForeground}
            value={detail}
            onChangeText={setDetail}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <TouchableOpacity
            onPress={() => setIsImportant((v) => !v)}
            activeOpacity={0.75}
            style={[
              styles.importanceBtn,
              {
                backgroundColor: isImportant ? "#F59E0B22" : c.secondary,
                borderColor: isImportant ? "#F59E0B99" : c.border,
                borderRadius: c.radius,
                marginTop: 20,
              },
            ]}
          >
            <View
              style={[
                styles.importanceStarWrap,
                {
                  backgroundColor: isImportant ? "#F59E0B22" : c.background,
                  borderRadius: 20,
                },
              ]}
            >
              <Feather
                name="star"
                size={22}
                color={isImportant ? "#F59E0B" : c.mutedForeground}
              />
            </View>
            <Text
              style={[
                styles.importanceBtnText,
                {
                  color: isImportant ? "#D97706" : c.mutedForeground,
                  fontFamily: isImportant ? "Inter_700Bold" : "Inter_500Medium",
                },
              ]}
            >
              Important
            </Text>
            {isImportant && (
              <View style={styles.importanceActiveDot} />
            )}
          </TouchableOpacity>

          <Text
            style={[
              styles.label,
              { color: c.mutedForeground, fontFamily: "Inter_500Medium", marginTop: 20 },
            ]}
          >
            COLOR
          </Text>
          <View style={styles.colorRow}>
            <TouchableOpacity
              onPress={() => setSelectedColor(undefined)}
              style={[
                styles.colorSwatch,
                styles.colorNone,
                {
                  borderColor: selectedColor === undefined ? c.primary : c.border,
                  borderWidth: selectedColor === undefined ? 2 : 1,
                  backgroundColor: c.card,
                },
              ]}
            >
              <Feather
                name="slash"
                size={14}
                color={selectedColor === undefined ? c.primary : c.mutedForeground}
              />
            </TouchableOpacity>
            {colors.taskColors.map((col) => (
              <TouchableOpacity
                key={col}
                onPress={() => setSelectedColor(col)}
                style={[
                  styles.colorSwatch,
                  {
                    backgroundColor: col,
                    borderColor: selectedColor === col ? c.foreground : "transparent",
                    borderWidth: selectedColor === col ? 2.5 : 0,
                  },
                ]}
              >
                {selectedColor === col && (
                  <Feather name="check" size={13} color="#fff" />
                )}
              </TouchableOpacity>
            ))}
          </View>

          <Text
            style={[
              styles.label,
              { color: c.mutedForeground, fontFamily: "Inter_500Medium", marginTop: 24 },
            ]}
          >
            TARGET COMPLETION
          </Text>
          <View
            style={[
              styles.row,
              { backgroundColor: c.card, borderColor: c.border, borderRadius: c.radius },
            ]}
          >
            <TouchableOpacity
              style={[styles.dateBtn, { borderRightColor: c.border }]}
              onPress={() => setPickerTarget("targetDate")}
            >
              <Feather name="calendar" size={15} color={c.primary} />
              <Text style={[styles.dateBtnText, { color: c.foreground, fontFamily: "Inter_500Medium" }]}>
                {formatDate(targetDate)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.dateBtn}
              onPress={() => setPickerTarget("targetTime")}
            >
              <Feather name="clock" size={15} color={c.primary} />
              <Text style={[styles.dateBtnText, { color: c.foreground, fontFamily: "Inter_500Medium" }]}>
                {formatTime(targetDate)}
              </Text>
            </TouchableOpacity>
          </View>

          <Text
            style={[
              styles.label,
              { color: c.mutedForeground, fontFamily: "Inter_500Medium", marginTop: 24 },
            ]}
          >
            HARD DEADLINE
          </Text>
          <View
            style={[
              styles.row,
              { backgroundColor: c.card, borderColor: c.border, borderRadius: c.radius },
            ]}
          >
            <TouchableOpacity
              style={[styles.dateBtn, { borderRightColor: c.border }]}
              onPress={() => setPickerTarget("deadlineDate")}
            >
              <Feather name="calendar" size={15} color={c.destructive} />
              <Text style={[styles.dateBtnText, { color: c.foreground, fontFamily: "Inter_500Medium" }]}>
                {formatDate(hardDeadline)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.dateBtn}
              onPress={() => setPickerTarget("deadlineTime")}
            >
              <Feather name="clock" size={15} color={c.destructive} />
              <Text style={[styles.dateBtnText, { color: c.foreground, fontFamily: "Inter_500Medium" }]}>
                {formatTime(hardDeadline)}
              </Text>
            </TouchableOpacity>
          </View>

          {targetDate >= hardDeadline && (
            <Text style={[styles.errorText, { color: c.destructive, fontFamily: "Inter_400Regular" }]}>
              Target must be before the hard deadline.
            </Text>
          )}

          {iosPickerVisible && (
            <View
              style={[
                styles.iosPicker,
                { backgroundColor: c.card, borderRadius: c.radius, borderColor: c.border },
              ]}
            >
              <DateTimePicker
                value={currentPickerValue}
                mode={pickerMode}
                display="spinner"
                onChange={handlePickerChange}
                minimumDate={
                  pickerMode === "date"
                    ? pickerTarget === "deadlineDate" ? targetDate : new Date()
                    : undefined
                }
                textColor={c.foreground}
              />
              <TouchableOpacity
                onPress={() => setPickerTarget(null)}
                style={[styles.doneBtn, { backgroundColor: c.primary, borderRadius: c.radius }]}
              >
                <Text style={[styles.doneBtnText, { color: c.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                  Done
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {isEdit && (
            <TouchableOpacity
              onPress={handleDelete}
              style={[styles.deleteBtn, { borderColor: c.destructive, borderRadius: c.radius }]}
            >
              <Feather name="trash-2" size={16} color={c.destructive} />
              <Text style={[styles.deleteBtnText, { color: c.destructive, fontFamily: "Inter_500Medium" }]}>
                Delete task
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {androidPickerVisible && (
          <DateTimePicker
            value={currentPickerValue}
            mode={pickerMode}
            display="default"
            onChange={handlePickerChange}
            minimumDate={
              pickerMode === "date"
                ? pickerTarget === "deadlineDate" ? targetDate : new Date()
                : undefined
            }
          />
        )}

        <TouchableOpacity
          style={[
            styles.saveBtn,
            {
              backgroundColor: c.primary,
              borderRadius: c.radius,
              marginHorizontal: 20,
              marginBottom: Math.max(insets.bottom, 24),
            },
          ]}
          onPress={handleSave}
          activeOpacity={0.85}
        >
          <Text style={[styles.saveBtnText, { color: c.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
            {isEdit ? "Save Changes" : "Add Task"}
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 16 },
  body: { padding: 20 },
  label: { fontSize: 11, letterSpacing: 0.8, marginBottom: 8 },
  textInput: {
    borderWidth: 1,
    padding: 14,
    fontSize: 15,
    minHeight: 72,
  },
  detailInput: { minHeight: 80 },
  colorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  colorSwatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  colorNone: {
    borderStyle: "dashed",
  },
  row: {
    flexDirection: "row",
    borderWidth: 1,
    overflow: "hidden",
  },
  dateBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
    borderRightWidth: 1,
  },
  dateBtnText: { fontSize: 14 },
  errorText: { fontSize: 12, marginTop: 8 },
  iosPicker: {
    marginTop: 20,
    borderWidth: 1,
    overflow: "hidden",
    paddingBottom: 12,
  },
  doneBtn: {
    marginHorizontal: 20,
    marginTop: 4,
    paddingVertical: 10,
    alignItems: "center",
  },
  doneBtnText: { fontSize: 15 },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    paddingVertical: 14,
    marginTop: 32,
  },
  deleteBtnText: { fontSize: 15 },
  saveBtn: {
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  saveBtnText: { fontSize: 16 },
  importanceBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1.5,
  },
  importanceStarWrap: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  importanceBtnText: { fontSize: 16, flex: 1 },
  importanceActiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F59E0B",
  },
});
