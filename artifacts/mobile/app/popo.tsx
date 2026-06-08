import { Feather } from "@expo/vector-icons";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import * as SecureStore from "expo-secure-store";
import * as Speech from "expo-speech";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSettings } from "@/context/SettingsContext";
import { useTasks } from "@/context/TaskContext";
import { useColors } from "@/hooks/useColors";
import { Task } from "@/types/task";
import { AppSettings, AIProvider } from "@/types/settings";
import { callAI, ChatMessage, DEFAULT_MODEL } from "@/utils/aiProvider";

// ── types ─────────────────────────────────────────────────────────────────────

type PopoState = "idle" | "listening" | "thinking" | "talking";

type AddTaskAction = {
  type: "add_task";
  description: string;
  targetDate: string;
  hardDeadline: string;
  isImportant?: boolean;
  detail?: string;
};
type CompleteTaskAction = { type: "complete_task"; description: string };
type DeleteTaskAction = { type: "delete_task"; description: string };
type PopoAction = AddTaskAction | CompleteTaskAction | DeleteTaskAction;

// ── constants ─────────────────────────────────────────────────────────────────

const ACTION_REGEX = /\[ACTION:\s*(\{[\s\S]*?\})\s*\]/;
const CORE_SIZE = 84;

// ── helpers ───────────────────────────────────────────────────────────────────

function secureKey(p: AIProvider) {
  return `popo_apikey_${p}`;
}

function parseAction(raw: string): { displayText: string; action: PopoAction | null } {
  const match = raw.match(ACTION_REGEX);
  if (!match) return { displayText: raw.trim(), action: null };
  try {
    return { displayText: raw.replace(ACTION_REGEX, "").trim(), action: JSON.parse(match[1]) as PopoAction };
  } catch {
    return { displayText: raw.trim(), action: null };
  }
}

function isAffirmative(t: string) {
  return /^(yes|yeah|yep|yup|sure|ok|okay|do it|sounds good|go ahead|please|correct|right|add it|confirm)$/i.test(
    t.trim()
  );
}

function isNegative(t: string) {
  return /^(no|nope|nah|cancel|skip|stop|don'?t|never|forget it|never ?mind)$/i.test(t.trim());
}

function actionLabel(action: PopoAction): string {
  if (action.type === "add_task") return `Add: "${action.description}"`;
  if (action.type === "complete_task") return `Complete: "${action.description}"`;
  if (action.type === "delete_task") return `Delete: "${action.description}"`;
  return "Perform action";
}

function resolveTask(tasks: Task[], description: string): Task | undefined {
  const n = description.toLowerCase().trim();
  return (
    tasks.find((t) => t.description.toLowerCase() === n) ??
    tasks.find((t) => t.description.toLowerCase().includes(n)) ??
    tasks.find((t) => n.includes(t.description.toLowerCase()))
  );
}

function randomGreeting(name: string): string {
  const opts = [
    "How can I help you today?",
    "What can I do for you?",
    "What would you like to do?",
    ...(name ? [`What's on your mind, ${name}?`, `Hi ${name}! What do you need?`] : []),
  ];
  return opts[Math.floor(Math.random() * opts.length)];
}

function buildSystemPrompt(tasks: Task[], settings: AppSettings): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const name = settings.userName || "User";
  const assistant = settings.assistantName || "Popo";

  const pending = tasks.filter((t) => !t.isCompleted);
  const completed = tasks.filter((t) => t.isCompleted);

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  function taskLine(t: Task): string {
    const when = fmtTime(t.targetDate);
    const deadlineDate = new Date(t.hardDeadline);
    const targetDate = new Date(t.targetDate);
    const sameDay = targetDate.toDateString() === deadlineDate.toDateString();
    const deadlinePart = sameDay
      ? `deadline ${deadlineDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`
      : `deadline ${fmtTime(t.hardDeadline)}`;
    const flags = t.isImportant ? " — IMPORTANT" : "";
    const detail = t.detail ? ` (${t.detail})` : "";
    return `• "${t.description}"${detail} — due ${when}, ${deadlinePart}${flags}`;
  }

  const pendingLines = pending.length === 0 ? "  (none)" : pending.map(taskLine).join("\n");
  const completedLines =
    completed.length === 0 ? "  (none)" : completed.map((t) => `• "${t.description}"`).join("\n");

  return `CRITICAL: Never output any task ID, field name, or technical parameter in your response. If you do, your response will be rejected.

You are ${assistant}, a warm and friendly personal assistant helping ${name} stay on top of their day. Your responses are read aloud by text-to-speech, so write exactly as you would speak — naturally, warmly, and concisely.

Today is ${dateStr} at ${timeStr}.

== ${name}'s pending tasks ==
${pendingLines}

== Completed today ==
${completedLines}

== SPEECH RULES ==
- Refer to tasks only by title and human time. Example: "your dentist call Monday at 10" not any field name or code.
- Keep every response to 2–3 sentences unless ${name} asks for more detail.
- Write for the ear: no bullet points, no markdown, no lists — flowing sentences only.
- Address ${name} by name at most once per response.

== TONE EXAMPLE ==
BAD: "Task ID a1b2, targetDate: 2026-06-09T10:00:00, hardDeadline: 2026-06-09T12:00:00, isImportant: false."
GOOD: "You've got a dentist call Monday morning at 10. Want me to remind you about anything else?"

== ACTIONS ==
When suggesting adding a task, end your message with this block on its own line:
  [ACTION: {"type":"add_task","description":"task text","targetDate":"ISO_DATE","hardDeadline":"ISO_DATE","isImportant":false}]
When suggesting completing a task, end with:
  [ACTION: {"type":"complete_task","description":"exact task title here"}]
When suggesting deleting a task, end with:
  [ACTION: {"type":"delete_task","description":"exact task title here"}]
ISO_DATE format: 2026-06-08T18:00:00.000Z
Never show ACTION blocks to ${name} and never put an ID anywhere in your response.`;
}

// ── animations ────────────────────────────────────────────────────────────────

function ListeningAnimation({ color }: { color: string }) {
  const r1 = useSharedValue(1);
  const r1a = useSharedValue(0.55);
  const r2 = useSharedValue(1);
  const r2a = useSharedValue(0.55);
  const r3 = useSharedValue(1);
  const r3a = useSharedValue(0.55);

  useEffect(() => {
    const dur = 1700;
    const cfg = { duration: dur, easing: Easing.out(Easing.quad) };
    r1.value = withRepeat(withTiming(2.6, cfg), -1, false);
    r1a.value = withRepeat(withTiming(0, { duration: dur }), -1, false);
    r2.value = withDelay(567, withRepeat(withTiming(2.6, cfg), -1, false));
    r2a.value = withDelay(567, withRepeat(withTiming(0, { duration: dur }), -1, false));
    r3.value = withDelay(1134, withRepeat(withTiming(2.6, cfg), -1, false));
    r3a.value = withDelay(1134, withRepeat(withTiming(0, { duration: dur }), -1, false));
    return () => {
      cancelAnimation(r1); cancelAnimation(r1a);
      cancelAnimation(r2); cancelAnimation(r2a);
      cancelAnimation(r3); cancelAnimation(r3a);
    };
  }, []);

  const s1 = useAnimatedStyle(() => ({ transform: [{ scale: r1.value }], opacity: r1a.value }));
  const s2 = useAnimatedStyle(() => ({ transform: [{ scale: r2.value }], opacity: r2a.value }));
  const s3 = useAnimatedStyle(() => ({ transform: [{ scale: r3.value }], opacity: r3a.value }));

  const ring = {
    position: "absolute" as const,
    width: CORE_SIZE,
    height: CORE_SIZE,
    borderRadius: CORE_SIZE / 2,
    backgroundColor: color,
  };

  return (
    <View style={aStyles.listenContainer}>
      <Animated.View style={[ring, s3]} />
      <Animated.View style={[ring, s2]} />
      <Animated.View style={[ring, s1]} />
      <View style={[aStyles.core, { backgroundColor: color }]}>
        <Feather name="mic" size={36} color="#fff" />
      </View>
    </View>
  );
}

function ThinkingAnimation({ color }: { color: string }) {
  const d1 = useSharedValue(0.5);
  const d2 = useSharedValue(0.5);
  const d3 = useSharedValue(0.5);

  useEffect(() => {
    const makeAnim = (delay: number) =>
      withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(1.35, { duration: 420, easing: Easing.inOut(Easing.ease) }),
            withTiming(0.5, { duration: 420, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          false
        )
      );
    d1.value = makeAnim(0);
    d2.value = makeAnim(170);
    d3.value = makeAnim(340);
    return () => { cancelAnimation(d1); cancelAnimation(d2); cancelAnimation(d3); };
  }, []);

  const s1 = useAnimatedStyle(() => ({ transform: [{ scale: d1.value }] }));
  const s2 = useAnimatedStyle(() => ({ transform: [{ scale: d2.value }] }));
  const s3 = useAnimatedStyle(() => ({ transform: [{ scale: d3.value }] }));

  const dot = { width: 22, height: 22, borderRadius: 11, backgroundColor: color };

  return (
    <View style={aStyles.thinkContainer}>
      <Animated.View style={[dot, s1]} />
      <Animated.View style={[dot, s2]} />
      <Animated.View style={[dot, s3]} />
    </View>
  );
}

function TalkingAnimation({ color }: { color: string }) {
  const b1 = useSharedValue(0.12);
  const b2 = useSharedValue(0.12);
  const b3 = useSharedValue(0.12);
  const b4 = useSharedValue(0.12);
  const b5 = useSharedValue(0.12);

  useEffect(() => {
    const maxes = [0.8, 0.55, 1.0, 0.65, 0.85];
    const all = [b1, b2, b3, b4, b5];
    all.forEach((b, i) => {
      b.value = withDelay(
        i * 75,
        withRepeat(
          withSequence(
            withTiming(maxes[i], { duration: 370, easing: Easing.inOut(Easing.ease) }),
            withTiming(0.12, { duration: 370, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          false
        )
      );
    });
    return () => all.forEach((b) => cancelAnimation(b));
  }, []);

  const bs1 = useAnimatedStyle(() => ({ transform: [{ scaleY: b1.value }] }));
  const bs2 = useAnimatedStyle(() => ({ transform: [{ scaleY: b2.value }] }));
  const bs3 = useAnimatedStyle(() => ({ transform: [{ scaleY: b3.value }] }));
  const bs4 = useAnimatedStyle(() => ({ transform: [{ scaleY: b4.value }] }));
  const bs5 = useAnimatedStyle(() => ({ transform: [{ scaleY: b5.value }] }));

  const bar = { width: 14, height: 80, borderRadius: 7, backgroundColor: color };

  return (
    <View style={aStyles.talkContainer}>
      <Animated.View style={[bar, bs1]} />
      <Animated.View style={[bar, bs2]} />
      <Animated.View style={[bar, bs3]} />
      <Animated.View style={[bar, bs4]} />
      <Animated.View style={[bar, bs5]} />
    </View>
  );
}

const aStyles = StyleSheet.create({
  listenContainer: {
    width: 240,
    height: 240,
    alignItems: "center",
    justifyContent: "center",
  },
  core: {
    width: CORE_SIZE,
    height: CORE_SIZE,
    borderRadius: CORE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  thinkContainer: {
    width: 240,
    height: 100,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
  },
  talkContainer: {
    width: 240,
    height: 120,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
});

// ── screen ────────────────────────────────────────────────────────────────────

export default function PopoScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const { tasks, addTask, completeTask, deleteTask } = useTasks();

  const assistantName = settings.assistantName || "Popo";
  const userName = settings.userName || "";

  const [popoState, setPopoState] = useState<PopoState>("idle");
  const [lastResponse, setLastResponse] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [pendingAction, setPendingAction] = useState<PopoAction | null>(null);

  const isMountedRef = useRef(true);
  const isListeningRef = useRef(false);
  const historyRef = useRef<ChatMessage[]>([]);
  const pendingActionRef = useRef<PopoAction | null>(null);
  const transcriptRef = useRef("");
  const settingsRef = useRef(settings);
  const tasksRef = useRef(tasks);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  settingsRef.current = settings;
  tasksRef.current = tasks;

  // ── mount / unmount ───────────────────────────────────────────────────────

  useEffect(() => {
    const greeting = randomGreeting(userName);
    speakText(greeting);
    return () => {
      isMountedRef.current = false;
      clearSilenceTimer();
      Speech.stop();
      if (isListeningRef.current) {
        ExpoSpeechRecognitionModule.abort();
        isListeningRef.current = false;
      }
    };
  }, []);

  // ── speech recognition events ─────────────────────────────────────────────

  useSpeechRecognitionEvent("result", (evt) => {
    const text = evt.results[0]?.transcript ?? "";
    transcriptRef.current = text;
    setLiveTranscript(text);
    if (text.length > 0) startSilenceTimer(); // reset timer as speech comes in
  });

  useSpeechRecognitionEvent("end", () => {
    if (!isListeningRef.current) return;
    isListeningRef.current = false;
    clearSilenceTimer();
    setLiveTranscript("");
    const text = transcriptRef.current.trim();
    transcriptRef.current = "";

    if (!text) {
      if (isMountedRef.current) setPopoState("idle");
      return;
    }

    if (pendingActionRef.current) {
      if (isAffirmative(text)) {
        executeAction(pendingActionRef.current);
        return;
      }
      if (isNegative(text)) {
        pendingActionRef.current = null;
        setPendingAction(null);
        speakText("Okay, I won't do that.");
        return;
      }
    }

    sendToAI(text);
  });

  useSpeechRecognitionEvent("error", () => {
    isListeningRef.current = false;
    clearSilenceTimer();
    setLiveTranscript("");
    transcriptRef.current = "";
    if (isMountedRef.current) setPopoState("idle");
  });

  // ── silence timer ─────────────────────────────────────────────────────────

  function clearSilenceTimer() {
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }

  function startSilenceTimer() {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(handleSilenceTimeout, 5000);
  }

  function handleSilenceTimeout() {
    if (!isMountedRef.current) return;
    if (isListeningRef.current) {
      ExpoSpeechRecognitionModule.abort();
      isListeningRef.current = false;
    }
    const goodbyes = [
      "Alright, let me know if you need anything!",
      "Got it, talk soon!",
      "Okay, I'm here if you need me!",
    ];
    const farewell = goodbyes[Math.floor(Math.random() * goodbyes.length)];
    speakText(farewell, handleClose);
  }

  // ── core functions ────────────────────────────────────────────────────────

  function speakText(text: string, onDone?: () => void) {
    clearSilenceTimer();
    setPopoState("talking");
    setLastResponse(text);
    Speech.speak(text, {
      language: "en-US",
      onDone: () => {
        if (!isMountedRef.current) return;
        if (onDone) onDone();
        else beginListening();
      },
      onError: () => { if (isMountedRef.current) setPopoState("idle"); },
    });
  }

  function beginListening() {
    if (!isMountedRef.current) return;
    setPopoState("listening");
    transcriptRef.current = "";
    setLiveTranscript("");
    ExpoSpeechRecognitionModule.requestPermissionsAsync().then(({ granted }) => {
      if (!granted || !isMountedRef.current) {
        setPopoState("idle");
        return;
      }
      isListeningRef.current = true;
      ExpoSpeechRecognitionModule.start({ lang: "en-US", interimResults: true, continuous: false });
      startSilenceTimer();
    });
  }

  function stopListening() {
    clearSilenceTimer();
    ExpoSpeechRecognitionModule.stop();
  }

  function interruptTTS() {
    Speech.stop();
    if (isMountedRef.current) beginListening();
  }

  function handleClose() {
    clearSilenceTimer();
    Speech.stop();
    if (isListeningRef.current) {
      ExpoSpeechRecognitionModule.abort();
      isListeningRef.current = false;
    }
    router.back();
  }

  function dismissAction(speak: boolean) {
    pendingActionRef.current = null;
    setPendingAction(null);
    Speech.stop();
    if (isListeningRef.current) {
      ExpoSpeechRecognitionModule.abort();
      isListeningRef.current = false;
    }
    if (speak) speakText("Okay, I won't do that.");
  }

  // ── AI ────────────────────────────────────────────────────────────────────

  async function sendToAI(text: string) {
    setPopoState("thinking");
    historyRef.current.push({ role: "user", content: text });

    const s = settingsRef.current;
    const provider: AIProvider = s.aiProvider ?? "claude";
    const apiKey = await SecureStore.getItemAsync(secureKey(provider));

    if (!apiKey) {
      const msg =
        "I don't have an API key set up yet. Please visit Settings and add one for your chosen AI provider.";
      historyRef.current.push({ role: "assistant", content: msg });
      if (isMountedRef.current) speakText(msg);
      return;
    }

    try {
      const model = s.aiModel ?? DEFAULT_MODEL[provider];
      const systemPrompt = buildSystemPrompt(tasksRef.current, s);
      const raw = await callAI(provider, apiKey, model, systemPrompt, historyRef.current);

      if (!isMountedRef.current) return;

      const { displayText, action } = parseAction(raw);
      const responseText = displayText || raw.trim();
      historyRef.current.push({ role: "assistant", content: responseText });

      if (action) {
        pendingActionRef.current = action;
        setPendingAction(action);
      } else {
        pendingActionRef.current = null;
        setPendingAction(null);
      }

      speakText(responseText);
    } catch (e: any) {
      if (!isMountedRef.current) return;
      const msg = e?.message
        ? `Sorry, something went wrong: ${e.message}`
        : "Sorry, something went wrong. Please try again.";
      speakText(msg);
    }
  }

  async function executeAction(action: PopoAction) {
    pendingActionRef.current = null;
    setPendingAction(null);
    setPopoState("thinking");

    try {
      if (action.type === "add_task") {
        const now = new Date();
        await addTask({
          description: action.description,
          detail: action.detail,
          targetDate: action.targetDate || new Date(now.getTime() + 3_600_000).toISOString(),
          hardDeadline: action.hardDeadline || new Date(now.getTime() + 10_800_000).toISOString(),
          isImportant: action.isImportant ?? false,
        });
        speakText(`Done! I've added "${action.description}" to your tasks.`);
      } else if (action.type === "complete_task") {
        const target = resolveTask(tasksRef.current, action.description);
        if (!target) throw new Error("Task not found");
        await completeTask(target.id);
        speakText(`Done! "${target.description}" is marked complete.`);
      } else if (action.type === "delete_task") {
        const target = resolveTask(tasksRef.current, action.description);
        if (!target) throw new Error("Task not found");
        await deleteTask(target.id);
        speakText(`Deleted "${target.description}".`);
      }
    } catch {
      if (isMountedRef.current) speakText("Sorry, I couldn't complete that action. Please try again.");
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  const stateLabel =
    popoState === "listening"
      ? "Listening..."
      : popoState === "thinking"
      ? "Thinking..."
      : popoState === "talking"
      ? assistantName
      : "Tap to speak";

  const showTranscript = popoState === "listening" && liveTranscript.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={handleClose} style={styles.headerBtn} hitSlop={8}>
          <Feather name="x" size={22} color={c.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.foreground, fontFamily: "Inter_600SemiBold" }]}>
          {assistantName}
        </Text>
        <View style={styles.headerBtn} />
      </View>

      {/* Center */}
      <View style={styles.center}>
        <Text style={[styles.stateLabel, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {stateLabel}
        </Text>

        {/* Animation */}
        <View style={styles.animWrapper}>
          {popoState === "listening" && (
            <TouchableOpacity onPress={stopListening} activeOpacity={1}>
              <ListeningAnimation color={c.primary} />
            </TouchableOpacity>
          )}
          {popoState === "thinking" && <ThinkingAnimation color={c.primary} />}
          {popoState === "talking" && (
            <TouchableOpacity onPress={interruptTTS} activeOpacity={1}>
              <TalkingAnimation color={c.primary} />
            </TouchableOpacity>
          )}
          {popoState === "idle" && (
            <TouchableOpacity
              onPress={beginListening}
              activeOpacity={0.82}
              style={[styles.idleButton, { backgroundColor: c.primary }]}
            >
              <Feather name="mic" size={44} color={c.primaryForeground} />
            </TouchableOpacity>
          )}
        </View>

        {/* Transcript / response text */}
        <Text
          style={[
            styles.responseText,
            {
              color: showTranscript ? c.foreground : c.mutedForeground,
              fontFamily: "Inter_400Regular",
            },
          ]}
          numberOfLines={4}
        >
          {showTranscript ? liveTranscript : lastResponse}
        </Text>
      </View>

      {/* Pending action */}
      {pendingAction && (
        <View style={[styles.actionArea, { borderTopColor: c.border }]}>
          <Text style={[styles.actionCaption, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {actionLabel(pendingAction)}
          </Text>
          <View style={styles.actionRow}>
            <TouchableOpacity
              onPress={() => executeAction(pendingAction)}
              style={[styles.actionBtn, { backgroundColor: c.primary, borderRadius: 14 }]}
              activeOpacity={0.8}
            >
              <Feather name="check" size={16} color={c.primaryForeground} />
              <Text style={[styles.actionBtnText, { color: c.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                Yes, do it
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => dismissAction(true)}
              style={[styles.actionBtn, { backgroundColor: c.secondary, borderRadius: 14 }]}
              activeOpacity={0.8}
            >
              <Feather name="x" size={16} color={c.foreground} />
              <Text style={[styles.actionBtnText, { color: c.foreground, fontFamily: "Inter_500Medium" }]}>
                No thanks
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={{ height: insets.bottom + 20 }} />
    </View>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    letterSpacing: 0.2,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 24,
  },
  stateLabel: {
    fontSize: 15,
    letterSpacing: 0.3,
  },
  animWrapper: {
    width: 240,
    height: 240,
    alignItems: "center",
    justifyContent: "center",
  },
  idleButton: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  responseText: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
    opacity: 0.85,
  },
  actionArea: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  actionCaption: {
    fontSize: 13,
    textAlign: "center",
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  actionBtnText: {
    fontSize: 15,
  },
});
