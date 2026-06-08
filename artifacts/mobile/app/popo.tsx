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
import { submitFeedback } from "@/utils/feedback";

// ── types ─────────────────────────────────────────────────────────────────────

type PopoState = "idle" | "listening" | "thinking" | "talking";
type FeedbackPhase = "none" | "asking" | "confirming";

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
type UpdateTaskDetailsAction = { type: "update_task_details"; description: string; details: string };
type MarkImportantAction = { type: "mark_important"; description: string; important?: boolean };
type PopoAction = AddTaskAction | CompleteTaskAction | DeleteTaskAction | UpdateTaskDetailsAction | MarkImportantAction;

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
  // Strip trailing punctuation so STT output like "yes." or "yeah!" still matches.
  const normalized = t.trim().replace(/[.,!?]+$/, "");
  // Any utterance starting with "yes" or "yeah" counts — covers "yes do it",
  // "yes please", "yes go ahead", "yeah add it", etc.
  if (/^(yes|yeah)\b/i.test(normalized)) return true;
  return /^(yep|yep do it|yup|sure|ok|okay|do it|just do it|send it|go ahead|go for it|sounds good|perfect|great|absolutely|definitely|of course|please|correct|right|that'?s right|that'?s correct|add it|add that|create it|create that|make it|confirm)$/i.test(
    normalized
  );
}

function isNegative(t: string) {
  return /^(no|nope|nah|cancel|skip|stop|don'?t|never|forget it|never ?mind)$/i.test(t.trim());
}

function isClosingRemark(text: string): boolean {
  const t = text.toLowerCase().trim().replace(/[.,!?]+$/, "");
  const phrases = [
    "that's all", "thats all", "nothing more", "thank you", "thanks",
    "bye", "goodbye", "that's it", "thats it", "all done",
    "that should be all", "no more", "i'm done", "im done",
  ];
  return phrases.some((p) => t === p || t.startsWith(p + " ") || t.endsWith(" " + p));
}

function actionLabel(action: PopoAction): string {
  if (action.type === "add_task") return `Add task: ${action.description}`;
  if (action.type === "complete_task") return `Complete: ${action.description}`;
  if (action.type === "delete_task") return `Delete: ${action.description}`;
  if (action.type === "update_task_details") return `Update details: ${action.description}`;
  if (action.type === "mark_important") return `Mark as important: ${action.description}`;
  return "Perform action";
}

function fallbackActionText(action: PopoAction): string {
  if (action.type === "add_task") return `I'll add "${action.description}" to your tasks.`;
  if (action.type === "complete_task") return `I'll mark "${action.description}" as complete.`;
  if (action.type === "delete_task") return `I'll delete "${action.description}".`;
  if (action.type === "update_task_details") return `I'll update the details for "${action.description}".`;
  if (action.type === "mark_important") return `I'll mark "${action.description}" as important.`;
  return "Got it.";
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

function localDateKey(date: Date): string {
  // Returns "YYYY-MM-DD" in the device's local timezone for day-boundary comparisons.
  return date.toLocaleDateString("en-CA"); // en-CA gives ISO-style YYYY-MM-DD
}

function buildSystemPrompt(tasks: Task[], settings: AppSettings): string {
  const now = new Date();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
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

  // Local-timezone day boundaries
  const todayKey = localDateKey(now);
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowKey = localDateKey(tomorrowDate);
  const weekLimitDate = new Date(now);
  weekLimitDate.setDate(weekLimitDate.getDate() + 7);
  weekLimitDate.setHours(23, 59, 59, 999);

  const pending = tasks.filter((t) => !t.isCompleted);
  const completed = tasks.filter((t) => t.isCompleted);

  function taskBucket(t: Task): "today" | "tomorrow" | "thisWeek" | "later" {
    const key = localDateKey(new Date(t.targetDate));
    if (key === todayKey) return "today";
    if (key === tomorrowKey) return "tomorrow";
    if (new Date(t.targetDate) <= weekLimitDate) return "thisWeek";
    return "later";
  }

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
    const sameDay = localDateKey(targetDate) === localDateKey(deadlineDate);
    const deadlinePart = sameDay
      ? `deadline ${deadlineDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`
      : `deadline ${fmtTime(t.hardDeadline)}`;
    const flags = t.isImportant ? " — IMPORTANT" : "";
    const detail = t.detail ? ` (${t.detail})` : "";
    return `• "${t.description}"${detail} — due ${when}, ${deadlinePart}${flags}`;
  }

  const todayTasks    = pending.filter((t) => taskBucket(t) === "today");
  const tomorrowTasks = pending.filter((t) => taskBucket(t) === "tomorrow");
  const weekTasks     = pending.filter((t) => taskBucket(t) === "thisWeek");
  const laterTasks    = pending.filter((t) => taskBucket(t) === "later");

  function section(label: string, list: Task[]): string {
    return `== ${label} ==\n${list.length === 0 ? "  (none)" : list.map(taskLine).join("\n")}`;
  }

  const completedLines =
    completed.length === 0 ? "  (none)" : completed.map((t) => `• "${t.description}"`).join("\n");

  return `CRITICAL: Never output any task ID, field name, or technical parameter in your response. If you do, your response will be rejected.

You are ${assistant}, a warm and friendly personal assistant helping ${name} stay on top of their day. Your responses are read aloud by text-to-speech, so write exactly as you would speak — naturally, warmly, and concisely.

Today is ${dateStr} at ${timeStr} (timezone: ${tz}).
"Today" means tasks whose target date falls on ${todayKey} in the ${tz} timezone. Do not include tomorrow's or future tasks when summarising today.

${section(`${name}'s tasks — TODAY`, todayTasks)}

${section("TOMORROW", tomorrowTasks)}

${section("THIS WEEK (next 7 days)", weekTasks)}

${section("LATER", laterTasks)}

== Completed ==
${completedLines}

== SPEECH RULES ==
- Refer to tasks only by title and human time. Example: "your dentist call Monday at 10" not any field name or code.
- Keep every response to 2–3 sentences unless ${name} asks for more detail.
- Write for the ear: no bullet points, no markdown, no lists — flowing sentences only.
- Address ${name} by name at most once per response.
- When summarising "today", only mention tasks in the TODAY section above.

== TONE EXAMPLE ==
BAD: "Task ID a1b2, targetDate: 2026-06-09T10:00:00, hardDeadline: 2026-06-09T12:00:00, isImportant: false."
GOOD: "You've got a dentist call Monday morning at 10. Want me to remind you about anything else?"

== ACTIONS ==
CRITICAL: You MUST always generate an ACTION block for any task modification. Never say you have done something without including the ACTION block. If you claim a task is marked as important, completed, deleted, or updated, you MUST include the corresponding ACTION block or it will not happen.

When suggesting adding a task, end your message with this block on its own line:
  [ACTION: {"type":"add_task","description":"task text","targetDate":"ISO_DATE","hardDeadline":"ISO_DATE","isImportant":false}]
When suggesting completing a task, end with:
  [ACTION: {"type":"complete_task","description":"exact task title here"}]
When suggesting deleting a task, end with:
  [ACTION: {"type":"delete_task","description":"exact task title here"}]
When adding or updating details/notes for an existing task, end with:
  [ACTION: {"type":"update_task_details","description":"exact task title here","details":"the details text"}]
When marking a task as important, starring it, or making it high priority, end with:
  [ACTION: {"type":"mark_important","description":"exact task title here","important":true}]
When removing importance, unstarring, or marking a task as not important/not high priority, end with:
  [ACTION: {"type":"mark_important","description":"exact task title here","important":false}]
ISO_DATE format: 2026-06-08T18:00:00.000Z
Never show ACTION blocks to ${name} and never put an ID anywhere in your response.

== ACTION EXAMPLES ==
${name} says "Mark buy newspaper as important"
→ Say: "Done! I've starred buy newspaper for you."
→ Include: [ACTION: {"type":"mark_important","description":"buy newspaper","important":true}]

${name} says "Mark visit doctor as not important"
→ Say: "Done, I've removed the star from visit doctor."
→ Include: [ACTION: {"type":"mark_important","description":"visit doctor","important":false}]

${name} says "Add a note to my dentist appointment — it's on Oak Street"
→ Say: "Got it, I've added that note to your dentist appointment."
→ Include: [ACTION: {"type":"update_task_details","description":"dentist appointment","details":"it's on Oak Street"}]

${name} says "Add milk, eggs, and bread to my grocery run"
→ Say: "Added your grocery list to that task."
→ Include: [ACTION: {"type":"update_task_details","description":"grocery run","details":"milk, eggs, bread"}]`;
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
  const { tasks, addTask, completeTask, deleteTask, updateTask } = useTasks();

  const assistantName = settings.assistantName || "Popo";
  const userName = settings.userName || "";

  const [popoState, setPopoState] = useState<PopoState>("idle");
  const [lastResponse, setLastResponse] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [pendingAction, setPendingAction] = useState<PopoAction | null>(null);
  const [feedbackPhase, setFeedbackPhase] = useState<FeedbackPhase>("none");
  const [pendingFeedbackText, setPendingFeedbackText] = useState("");

  const isMountedRef = useRef(true);
  const isListeningRef = useRef(false);
  const historyRef = useRef<ChatMessage[]>([]);
  const pendingActionRef = useRef<PopoAction | null>(null);
  const transcriptRef = useRef("");
  const settingsRef = useRef(settings);
  const tasksRef = useRef(tasks);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackPhaseRef = useRef<FeedbackPhase>("none");
  const pendingFeedbackRef = useRef("");

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
    if (text.length > 0) {
      if (isClosingRemark(text)) {
        clearSilenceTimer();
        if (isListeningRef.current) {
          ExpoSpeechRecognitionModule.abort();
          isListeningRef.current = false;
        }
        transcriptRef.current = "";
        setLiveTranscript("");
        console.log("FEEDBACK: checking if should ask");
        if (feedbackPhaseRef.current === "none") {
          feedbackPhaseRef.current = "asking";
          setFeedbackPhase("asking");
          const questions = [
            "Before you go, any thoughts on how I can improve?",
            "Got a moment? I'd love your feedback on the app.",
          ];
          speakText(questions[Math.floor(Math.random() * questions.length)]);
        } else {
          const goodbyes = [
            "Goodbye! Talk to you soon.",
            "Take care! Let me know if you need anything.",
            "Goodbye! Have a great day.",
          ];
          speakText(goodbyes[Math.floor(Math.random() * goodbyes.length)], handleClose);
        }
      } else if (!pendingActionRef.current) {
        startSilenceTimer(); // reset timer as speech comes in
      }
    }
  });

  useSpeechRecognitionEvent("end", () => {
    if (!isListeningRef.current) return;
    isListeningRef.current = false;
    clearSilenceTimer();
    setLiveTranscript("");
    const text = transcriptRef.current.trim();
    transcriptRef.current = "";

    if (!text) {
      const phase = feedbackPhaseRef.current;
      if (phase === "none" && historyRef.current.length >= 2) {
        // Real conversation ended silently — ask for feedback
        console.log("FEEDBACK CHECK: silent end — asking for feedback");
        feedbackPhaseRef.current = "asking";
        setFeedbackPhase("asking");
        const questions = [
          "Before you go, any thoughts on how I can improve?",
          "Got a moment? I'd love your feedback on the app.",
        ];
        speakText(questions[Math.floor(Math.random() * questions.length)]);
      } else if (phase === "asking" || phase === "confirming") {
        // Silent during the feedback/confirmation question — close gracefully,
        // no recursive feedback request
        console.log("FEEDBACK CHECK: silent during", phase, "— closing");
        feedbackPhaseRef.current = "none";
        setFeedbackPhase("none");
        speakText("Alright, goodbye!", handleClose);
      } else {
        // No conversation yet (greeting only) or unknown state — stay idle
        if (isMountedRef.current) setPopoState("idle");
      }
      return;
    }

    if (feedbackPhaseRef.current === "asking") {
      if (!text || isClosingRemark(text) || isNegative(text)) {
        feedbackPhaseRef.current = "none";
        setFeedbackPhase("none");
        speakText("No problem! Goodbye.", handleClose);
      } else {
        feedbackPhaseRef.current = "confirming";
        setFeedbackPhase("confirming");
        pendingFeedbackRef.current = text;
        setPendingFeedbackText(text);
        speakText(`So you're saying ${text} — shall I send that as feedback?`);
      }
      return;
    }

    if (feedbackPhaseRef.current === "confirming") {
      if (isAffirmative(text)) {
        console.log("[popo] voice confirmation detected:", text, "| state: feedback confirming");
        handleSendFeedback();
      } else {
        feedbackPhaseRef.current = "none";
        setFeedbackPhase("none");
        speakText("No problem! Goodbye.", handleClose);
      }
      return;
    }

    console.log("[popo] handleYes called | pendingAction:", JSON.stringify(pendingActionRef.current));
    if (pendingActionRef.current) {
      const affirmative = isAffirmative(text);
      console.log("[popo] isAffirmative result:", affirmative, "| text:", text);
      if (affirmative) {
        console.log("[popo] voice confirmation detected:", text, "| state: action pending —", pendingActionRef.current.type);
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
    if (feedbackPhaseRef.current === "none" && historyRef.current.length >= 2) {
      console.log("FEEDBACK: checking if should ask — asking");
      feedbackPhaseRef.current = "asking";
      setFeedbackPhase("asking");
      const questions = [
        "Before you go, any thoughts on how I can improve?",
        "Got a moment? I'd love your feedback on the app.",
      ];
      speakText(questions[Math.floor(Math.random() * questions.length)]);
    } else {
      // No conversation yet, or already in a feedback phase — just close
      feedbackPhaseRef.current = "none";
      setFeedbackPhase("none");
      speakText("Alright, goodbye!", handleClose);
    }
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
        const feedbackEligible =
          !onDone &&
          feedbackPhaseRef.current === "none" &&
          historyRef.current.length >= 2;
        console.log(
          "FEEDBACK CHECK: TTS done | phase:", feedbackPhaseRef.current,
          "| history:", historyRef.current.length,
          "| eligible:", feedbackEligible
        );
        if (onDone) {
          onDone();
        } else if (pendingActionRef.current) {
          // Stop any lingering audio then wait 300ms before the confirmation cue
          // to guarantee clean separation between the main response and this prompt.
          Speech.stop();
          setTimeout(() => {
            if (!isMountedRef.current) return;
            Speech.speak("Just say yes to confirm.", {
              language: "en-US",
              onDone:  () => { if (isMountedRef.current) beginListening(); },
              onError: () => { if (isMountedRef.current) beginListening(); },
            });
          }, 300);
        } else {
          beginListening();
        }
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
      if (pendingActionRef.current) {
        console.log("[popo] silence timer skipped — waiting for action confirmation");
      } else {
        startSilenceTimer();
      }
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

  // ── feedback ──────────────────────────────────────────────────────────────

  async function handleSendFeedback() {
    feedbackPhaseRef.current = "none";
    setFeedbackPhase("none");
    const email = settingsRef.current.googleUserEmail || "Not signed in";
    const accessToken = settingsRef.current.googleAccessToken;
    console.log("[popo] submitting feedback:", pendingFeedbackRef.current, "| email:", email, "| hasToken:", !!accessToken);

    if (!accessToken) {
      console.warn("[popo] no access token — cannot write to Sheets");
      if (isMountedRef.current) speakText("Thanks! Unfortunately I couldn't save your feedback — please sign in to Google Drive first.", handleClose);
      return;
    }

    try {
      await submitFeedback(pendingFeedbackRef.current, email, accessToken);
    } catch (e) {
      console.error("[popo] feedback submission error:", e);
    }
    if (isMountedRef.current) speakText("Thanks! Your feedback has been sent.", handleClose);
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
      const responseText = displayText || (action ? fallbackActionText(action) : raw.trim());
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
    console.log("[popo] executeAction called | action:", JSON.stringify(action));
    pendingActionRef.current = null;
    setPendingAction(null);
    setPopoState("thinking");

    try {
      if (action.type === "add_task") {
        const now = new Date();
        const newTask = {
          description: action.description,
          detail: action.detail,
          targetDate: action.targetDate || new Date(now.getTime() + 3_600_000).toISOString(),
          hardDeadline: action.hardDeadline || new Date(now.getTime() + 10_800_000).toISOString(),
          isImportant: action.isImportant ?? false,
        };
        console.log("[popo] addTask called | task:", JSON.stringify(newTask));
        await addTask(newTask);
        console.log("[popo] add_task completed:", action.description);
        speakText(`Done! I've added "${action.description}" to your tasks.`);
      } else if (action.type === "complete_task") {
        const target = resolveTask(tasksRef.current, action.description);
        if (!target) throw new Error(`Task not found: "${action.description}"`);
        await completeTask(target.id);
        console.log("[popo] complete_task completed:", target.description);
        speakText(`Done! "${target.description}" is marked complete.`);
      } else if (action.type === "delete_task") {
        const target = resolveTask(tasksRef.current, action.description);
        if (!target) throw new Error(`Task not found: "${action.description}"`);
        await deleteTask(target.id);
        console.log("[popo] delete_task completed:", target.description);
        speakText(`Deleted "${target.description}".`);
      } else if (action.type === "update_task_details") {
        const target = resolveTask(tasksRef.current, action.description);
        if (!target) throw new Error(`Task not found: "${action.description}"`);
        await updateTask(target.id, { detail: action.details });
        console.log("[popo] update_task_details completed:", target.description);
        speakText(`Done! I've added the details to "${target.description}".`);
      } else if (action.type === "mark_important") {
        const important = action.important !== false;
        console.log(`[popo] updating importance: ${action.description} → ${important}`);
        const target = resolveTask(tasksRef.current, action.description);
        if (!target) throw new Error(`Task not found: "${action.description}"`);
        await updateTask(target.id, { isImportant: important });
        console.log("[popo] mark_important completed:", target.description, "→", important);
        speakText(important
          ? `Done! "${target.description}" is now marked as important.`
          : `Done! I've removed the star from "${target.description}".`
        );
      }
    } catch (e) {
      console.error("[popo] executeAction error:", e);
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

      {/* Feedback confirmation */}
      {feedbackPhase === "confirming" && (
        <View style={[styles.actionArea, { borderTopColor: c.border }]}>
          <Text style={[styles.actionCaption, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Send this feedback?
          </Text>
          <Text
            style={[styles.feedbackQuote, { color: c.foreground, fontFamily: "Inter_400Regular" }]}
            numberOfLines={3}
          >
            "{pendingFeedbackText}"
          </Text>
          <View style={styles.actionRow}>
            <TouchableOpacity
              onPress={handleSendFeedback}
              style={[styles.actionBtn, { backgroundColor: c.primary, borderRadius: 14 }]}
              activeOpacity={0.8}
            >
              <Feather name="send" size={16} color={c.primaryForeground} />
              <Text style={[styles.actionBtnText, { color: c.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                Yes, send it
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                feedbackPhaseRef.current = "none";
                setFeedbackPhase("none");
                speakText("No problem! Goodbye.", handleClose);
              }}
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
  feedbackQuote: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    fontStyle: "italic",
    opacity: 0.8,
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
