import { Feather } from "@expo/vector-icons";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
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

type Phase = "idle" | "listening" | "review";

export function VoiceTaskModal({
  visible,
  onClose,
  onConfirm,
}: VoiceTaskModalProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [parsed, setParsed] = useState<ParsedVoiceInput | null>(null);
  const transcriptRef = useRef("");

  const isListeningRef = useRef(false);

  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0);
  const micScale = useSharedValue(1);

  useEffect(() => {
    if (phase === "listening") {
      ringOpacity.value = withTiming(0.35);
      ringScale.value = withRepeat(
        withSequence(
          withTiming(1.9, { duration: 900, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: 900, easing: Easing.in(Easing.quad) })
        ),
        -1,
        false
      );
      micScale.value = withRepeat(
        withSequence(withTiming(1.06, { duration: 600 }), withTiming(1, { duration: 600 })),
        -1,
        false
      );
    } else {
      ringOpacity.value = withTiming(0);
      ringScale.value = withTiming(1);
      micScale.value = withTiming(1);
    }
  }, [phase]);

  useEffect(() => {
    if (!visible) {
      isListeningRef.current = false;
      ExpoSpeechRecognitionModule.abort();
      setPhase("idle");
      setTranscript("");
      setParsed(null);
      transcriptRef.current = "";
    }
  }, [visible]);

  useSpeechRecognitionEvent("result", (event) => {
    const text = event.results?.[0]?.transcript ?? "";
    setTranscript(text);
    transcriptRef.current = text;
  });

  useSpeechRecognitionEvent("end", () => {
    if (!isListeningRef.current) return;
    isListeningRef.current = false;
    const text = transcriptRef.current;
    if (text.trim()) {
      try {
        const result = parseVoiceTranscript(text);
        setParsed(result);
        setPhase("review");
      } catch {
        setPhase("idle");
      }
    } else {
      setPhase("idle");
    }
  });

  useSpeechRecognitionEvent("error", () => {
    isListeningRef.current = false;
    setPhase("idle");
  });

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  const micStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micScale.value }],
  }));

  async function startListening() {
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      Alert.alert(
        "Microphone permission required",
        "Please allow microphone access in Settings to use voice input."
      );
      return;
    }
    transcriptRef.current = "";
    setTranscript("");
    isListeningRef.current = true;
    setPhase("listening");
    ExpoSpeechRecognitionModule.start({ lang: "en-US", interimResults: true });
  }

  function handleStop() {
    ExpoSpeechRecognitionModule.stop();
  }

  function handleRetry() {
    setPhase("idle");
    setTranscript("");
    setParsed(null);
    transcriptRef.current = "";
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
      <View style={[styles.container, { backgroundColor: c.background }]}>
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
            Voice Task
          </Text>
          <View style={{ width: 22 }} />
        </View>

        <View style={styles.body}>
          {phase === "idle" && (
            <View style={styles.phaseContainer}>
              <Text
                style={[
                  styles.hintTitle,
                  { color: c.foreground, fontFamily: "Inter_600SemiBold" },
                ]}
              >
                Speak your task
              </Text>
              <Text
                style={[
                  styles.hintSub,
                  { color: c.mutedForeground, fontFamily: "Inter_400Regular" },
                ]}
              >
                Include the date and time naturally.
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
                  <Text style={{ color: c.primary }}>tomorrow at 3pm</Text>,
                  deadline{" "}
                  <Text style={{ color: c.destructive }}>Friday at 5pm</Text>"
                </Text>
              </View>

              <TouchableOpacity onPress={startListening} activeOpacity={0.85}>
                <View style={styles.micWrapper}>
                  <Animated.View
                    style={[
                      styles.micRing,
                      { backgroundColor: c.primary },
                      ringStyle,
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.micButton,
                      { backgroundColor: c.primary },
                      micStyle,
                    ]}
                  >
                    <Feather name="mic" size={34} color={c.primaryForeground} />
                  </Animated.View>
                </View>
              </TouchableOpacity>

              <Text
                style={[
                  styles.tapLabel,
                  { color: c.mutedForeground, fontFamily: "Inter_500Medium" },
                ]}
              >
                Tap to speak
              </Text>
            </View>
          )}

          {phase === "listening" && (
            <View style={styles.phaseContainer}>
              <Text
                style={[
                  styles.hintTitle,
                  { color: c.destructive, fontFamily: "Inter_600SemiBold" },
                ]}
              >
                Listening...
              </Text>

              <TouchableOpacity onPress={handleStop} activeOpacity={0.85}>
                <View style={styles.micWrapper}>
                  <Animated.View
                    style={[
                      styles.micRing,
                      { backgroundColor: c.destructive },
                      ringStyle,
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.micButton,
                      { backgroundColor: c.destructive },
                      micStyle,
                    ]}
                  >
                    <Feather name="mic" size={34} color="#fff" />
                  </Animated.View>
                </View>
              </TouchableOpacity>

              <Text
                style={[
                  styles.tapLabel,
                  { color: c.mutedForeground, fontFamily: "Inter_500Medium" },
                ]}
              >
                Tap to stop
              </Text>

              {!!transcript && (
                <View
                  style={[
                    styles.transcriptBox,
                    {
                      backgroundColor: c.card,
                      borderColor: c.border,
                      borderRadius: c.radius,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.transcriptText,
                      { color: c.foreground, fontFamily: "Inter_400Regular" },
                    ]}
                  >
                    {transcript}
                  </Text>
                </View>
              )}
            </View>
          )}

          {phase === "review" && parsed && (
            <View style={styles.phaseContainer}>
              <View
                style={[
                  styles.successIcon,
                  { backgroundColor: c.primary + "20", borderRadius: 36 },
                ]}
              >
                <Feather name="check-circle" size={32} color={c.primary} />
              </View>

              <Text
                style={[
                  styles.hintTitle,
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
                  styles.reviewNote,
                  { color: c.mutedForeground, fontFamily: "Inter_400Regular" },
                ]}
              >
                You can adjust any details after creating the task.
              </Text>

              <View style={styles.reviewButtons}>
                <TouchableOpacity
                  onPress={handleRetry}
                  style={[
                    styles.retryBtn,
                    { borderColor: c.border, borderRadius: c.radius },
                  ]}
                >
                  <Feather name="refresh-cw" size={16} color={c.foreground} />
                  <Text
                    style={[
                      styles.retryText,
                      { color: c.foreground, fontFamily: "Inter_500Medium" },
                    ]}
                  >
                    Try again
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleConfirm}
                  style={[
                    styles.confirmBtn,
                    { backgroundColor: c.primary, borderRadius: c.radius },
                  ]}
                >
                  <Feather name="plus" size={16} color={c.primaryForeground} />
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
            </View>
          )}
        </View>
      </View>
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
      <Feather name={icon as any} size={16} color={accent ?? colors.mutedForeground} />
      <View style={styles.reviewRowText}>
        <Text
          style={[
            styles.reviewRowLabel,
            { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.reviewRowValue,
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
  body: { flex: 1, justifyContent: "center" },
  phaseContainer: {
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 16,
  },
  hintTitle: { fontSize: 22, textAlign: "center" },
  hintSub: { fontSize: 14, textAlign: "center", marginTop: -8 },
  exampleBox: {
    padding: 16,
    width: "100%",
    marginBottom: 8,
  },
  exampleText: { fontSize: 15, textAlign: "center", lineHeight: 22 },
  micWrapper: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 8,
  },
  micRing: {
    position: "absolute",
    width: 110,
    height: 110,
    borderRadius: 55,
  },
  micButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  tapLabel: { fontSize: 14, marginTop: -4 },
  transcriptBox: {
    width: "100%",
    padding: 16,
    borderWidth: 1,
    minHeight: 72,
    marginTop: 8,
  },
  transcriptText: { fontSize: 16, lineHeight: 24, textAlign: "center" },
  successIcon: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  reviewCards: { width: "100%", gap: 8 },
  reviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderWidth: 1,
  },
  reviewRowText: { flex: 1, gap: 2 },
  reviewRowLabel: { fontSize: 11, letterSpacing: 0.5 },
  reviewRowValue: { fontSize: 15 },
  reviewNote: { fontSize: 13, textAlign: "center", marginTop: -4 },
  reviewButtons: { flexDirection: "row", gap: 12, width: "100%", marginTop: 8 },
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
