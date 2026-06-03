/**
 * Native implementation: smart natural-language text input powered by chrono-node.
 * expo-speech-recognition requires a dev build and is not available in Expo Go,
 * so we degrade gracefully to typed NLP input — same parsing magic, no native module.
 */
import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
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
import Animated, {
  FadeInDown,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import {
  ParsedVoiceInput,
  formatParsedDate,
  parseVoiceTranscript,
} from "@/utils/parseVoice";

interface VoiceTaskModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (parsed: ParsedVoiceInput) => void;
}

type Phase = "input" | "review";

export function VoiceTaskModal({
  visible,
  onClose,
  onConfirm,
}: VoiceTaskModalProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>("input");
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedVoiceInput | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) {
      setPhase("input");
      setText("");
      setParsed(null);
      setError("");
    }
  }, [visible]);

  function handleParse() {
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Please describe your task first.");
      return;
    }
    setError("");
    const result = parseVoiceTranscript(trimmed);
    setParsed(result);
    setPhase("review");
  }

  function handleRetry() {
    setPhase("input");
    setParsed(null);
    setError("");
  }

  function handleConfirm() {
    if (!parsed) return;
    onConfirm(parsed);
    onClose();
  }

  const topInset = Platform.OS === "ios" ? 20 : insets.top + 16;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: c.background }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <View
          style={[
            styles.header,
            { paddingTop: topInset, borderBottomColor: c.border },
          ]}
        >
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Feather name="x" size={22} color={c.foreground} />
          </TouchableOpacity>
          <Text
            style={[
              styles.headerTitle,
              { color: c.foreground, fontFamily: "Inter_600SemiBold" },
            ]}
          >
            Smart Task Input
          </Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {phase === "input" && (
            <View style={styles.phaseContainer}>
              <View
                style={[
                  styles.iconCircle,
                  { backgroundColor: c.primary + "18", borderRadius: 40 },
                ]}
              >
                <Feather name="edit-3" size={28} color={c.primary} />
              </View>

              <Text
                style={[
                  styles.title,
                  { color: c.foreground, fontFamily: "Inter_600SemiBold" },
                ]}
              >
                Describe your task
              </Text>
              <Text
                style={[
                  styles.subtitle,
                  { color: c.mutedForeground, fontFamily: "Inter_400Regular" },
                ]}
              >
                Include the date and time naturally — we'll extract them for you.
              </Text>

              <View
                style={[
                  styles.exampleBox,
                  { backgroundColor: c.secondary, borderRadius: c.radius },
                ]}
              >
                <Text
                  style={[
                    styles.exampleText,
                    { color: c.mutedForeground, fontFamily: "Inter_400Regular" },
                  ]}
                >
                  "Submit the report{" "}
                  <Text style={{ color: c.primary }}>tomorrow at 3pm</Text>
                  , deadline{" "}
                  <Text style={{ color: c.destructive }}>Friday at 5pm</Text>"
                </Text>
              </View>

              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: c.card,
                    borderColor: error ? c.destructive : c.border,
                    color: c.foreground,
                    fontFamily: "Inter_400Regular",
                    borderRadius: c.radius,
                  },
                ]}
                placeholder="E.g. Call the dentist next Friday at 10am..."
                placeholderTextColor={c.mutedForeground}
                value={text}
                onChangeText={(t) => { setText(t); setError(""); }}
                multiline
                numberOfLines={3}
                autoFocus
                returnKeyType="done"
              />

              {!!error && (
                <Text
                  style={[
                    styles.errorText,
                    { color: c.destructive, fontFamily: "Inter_400Regular" },
                  ]}
                >
                  {error}
                </Text>
              )}

              <TouchableOpacity
                onPress={handleParse}
                style={[
                  styles.parseBtn,
                  { backgroundColor: c.primary, borderRadius: c.radius },
                ]}
                activeOpacity={0.85}
              >
                <Feather name="zap" size={16} color={c.primaryForeground} />
                <Text
                  style={[
                    styles.parseBtnText,
                    { color: c.primaryForeground, fontFamily: "Inter_600SemiBold" },
                  ]}
                >
                  Parse & Preview
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {phase === "review" && parsed && (
            <Animated.View
              entering={FadeInDown.duration(300)}
              style={styles.phaseContainer}
            >
              <View
                style={[
                  styles.iconCircle,
                  { backgroundColor: c.primary + "18", borderRadius: 40 },
                ]}
              >
                <Feather name="check-circle" size={28} color={c.primary} />
              </View>

              <Text
                style={[
                  styles.title,
                  { color: c.foreground, fontFamily: "Inter_600SemiBold" },
                ]}
              >
                Got it!
              </Text>

              <View style={styles.reviewCards}>
                <ReviewRow
                  icon="file-text"
                  label="Task"
                  value={parsed.description}
                  colors={c}
                />
                <ReviewRow
                  icon="clock"
                  label="Target"
                  value={formatParsedDate(parsed.targetDate)}
                  colors={c}
                  accent={c.primary}
                />
                <ReviewRow
                  icon="alert-triangle"
                  label="Deadline"
                  value={formatParsedDate(parsed.hardDeadline)}
                  colors={c}
                  accent={c.destructive}
                />
              </View>

              <Text
                style={[
                  styles.note,
                  { color: c.mutedForeground, fontFamily: "Inter_400Regular" },
                ]}
              >
                You can adjust any details after creating the task.
              </Text>

              <View style={styles.actionRow}>
                <TouchableOpacity
                  onPress={handleRetry}
                  style={[
                    styles.retryBtn,
                    { borderColor: c.border, borderRadius: c.radius },
                  ]}
                >
                  <Feather name="edit-2" size={15} color={c.foreground} />
                  <Text
                    style={[
                      styles.retryText,
                      { color: c.foreground, fontFamily: "Inter_500Medium" },
                    ]}
                  >
                    Edit
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleConfirm}
                  style={[
                    styles.confirmBtn,
                    { backgroundColor: c.primary, borderRadius: c.radius },
                  ]}
                >
                  <Feather name="plus" size={15} color={c.primaryForeground} />
                  <Text
                    style={[
                      styles.confirmText,
                      { color: c.primaryForeground, fontFamily: "Inter_600SemiBold" },
                    ]}
                  >
                    Create Task
                  </Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ReviewRow({
  icon,
  label,
  value,
  colors,
  accent,
}: {
  icon: string;
  label: string;
  value: string;
  colors: any;
  accent?: string;
}) {
  return (
    <View
      style={[
        styles.reviewRow,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      <Feather
        name={icon as any}
        size={16}
        color={accent ?? colors.mutedForeground}
      />
      <View style={styles.reviewRowText}>
        <Text
          style={[
            styles.reviewLabel,
            { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.reviewValue,
            { color: colors.foreground, fontFamily: "Inter_600SemiBold" },
          ]}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 16 },
  body: { flex: 1 },
  bodyContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: 24,
  },
  phaseContainer: {
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 14,
  },
  iconCircle: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: { fontSize: 22, textAlign: "center" },
  subtitle: { fontSize: 14, textAlign: "center", marginTop: -6 },
  exampleBox: { padding: 14, width: "100%" },
  exampleText: { fontSize: 14, textAlign: "center", lineHeight: 22 },
  input: {
    width: "100%",
    borderWidth: 1,
    padding: 14,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 90,
    textAlignVertical: "top",
  },
  errorText: { fontSize: 13, marginTop: -6 },
  parseBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    marginTop: 4,
  },
  parseBtnText: { fontSize: 16 },
  reviewCards: { width: "100%", gap: 8 },
  reviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderWidth: 1,
  },
  reviewRowText: { flex: 1, gap: 2 },
  reviewLabel: { fontSize: 11, letterSpacing: 0.5 },
  reviewValue: { fontSize: 15 },
  note: { fontSize: 13, textAlign: "center", marginTop: -2 },
  actionRow: { flexDirection: "row", gap: 12, width: "100%", marginTop: 4 },
  retryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1,
  },
  retryText: { fontSize: 15 },
  confirmBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  confirmText: { fontSize: 15 },
});
