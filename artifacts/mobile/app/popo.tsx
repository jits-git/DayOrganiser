import { Feather } from "@expo/vector-icons";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import * as SecureStore from "expo-secure-store";
import * as Speech from "expo-speech";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSettings } from "@/context/SettingsContext";
import { useTasks } from "@/context/TaskContext";
import { useColors } from "@/hooks/useColors";
import { Task } from "@/types/task";
import { AppSettings, AIProvider } from "@/types/settings";
import { callAI, ChatMessage, DEFAULT_MODEL } from "@/utils/aiProvider";

// ── types ─────────────────────────────────────────────────────────────────────

type AddTaskAction = {
  type: "add_task";
  description: string;
  targetDate: string;
  hardDeadline: string;
  isImportant?: boolean;
  detail?: string;
};
type CompleteTaskAction = { type: "complete_task"; id: string };
type DeleteTaskAction = { type: "delete_task"; id: string };
type PopoAction = AddTaskAction | CompleteTaskAction | DeleteTaskAction;

interface PopoMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  action?: PopoAction;
  actionResolved?: boolean;
}

// ── helpers ───────────────────────────────────────────────────────────────────

const ACTION_REGEX = /\[ACTION:\s*(\{[\s\S]*?\})\s*\]/;

function secureKey(provider: AIProvider): string {
  return `popo_apikey_${provider}`;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function parseAction(raw: string): { displayText: string; action: PopoAction | null } {
  const match = raw.match(ACTION_REGEX);
  if (!match) return { displayText: raw.trim(), action: null };
  try {
    const action = JSON.parse(match[1]) as PopoAction;
    return { displayText: raw.replace(ACTION_REGEX, "").trim(), action };
  } catch {
    return { displayText: raw.trim(), action: null };
  }
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

  const taskLines =
    tasks.length === 0
      ? "No tasks currently scheduled."
      : tasks
          .map((t) => {
            const target = new Date(t.targetDate).toLocaleString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            });
            const deadline = new Date(t.hardDeadline).toLocaleString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            });
            const importance = t.isImportant ? " [IMPORTANT]" : "";
            const status = t.isCompleted ? "Completed" : "Pending";
            return `• [ID:${t.id}]${importance} "${t.description}"${t.detail ? ` — ${t.detail}` : ""} | Target: ${target} | Deadline: ${deadline} | ${status}`;
          })
          .join("\n");

  return `You are ${assistant}, a warm and concise AI assistant helping ${name} manage their tasks and day.
Today is ${dateStr} at ${timeStr}.

${name}'s current tasks:
${taskLines}

Guidelines:
- Keep responses short and conversational (2–4 sentences unless detail is requested)
- Address ${name} by name occasionally
- When suggesting adding a task, end your message with this exact block on its own line:
  [ACTION: {"type":"add_task","description":"task text","targetDate":"ISO_DATE","hardDeadline":"ISO_DATE","isImportant":false}]
- When suggesting completing a task, end with:
  [ACTION: {"type":"complete_task","id":"TASK_ID_HERE"}]
- When suggesting deleting a task, end with:
  [ACTION: {"type":"delete_task","id":"TASK_ID_HERE"}]
- ISO_DATE format example: 2026-06-08T18:00:00.000Z
- Do not mention or explain the ACTION syntax to the user`;
}

function actionLabel(action: PopoAction): string {
  if (action.type === "add_task") return `Add: "${action.description}"`;
  if (action.type === "complete_task") return "Mark task complete";
  if (action.type === "delete_task") return "Delete task";
  return "Perform action";
}

// ── sub-components ────────────────────────────────────────────────────────────

function TypingIndicator({ assistantInitial, c }: { assistantInitial: string; c: any }) {
  return (
    <View style={styles.rowAssistant}>
      <View style={[styles.avatar, { backgroundColor: c.primary }]}>
        <Text style={[styles.avatarText, { color: c.primaryForeground }]}>{assistantInitial}</Text>
      </View>
      <View style={[styles.bubble, styles.bubbleAssistant, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.bubbleText, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          • • •
        </Text>
      </View>
    </View>
  );
}

interface BubbleProps {
  message: PopoMessage;
  assistantInitial: string;
  c: any;
  onYes: (msg: PopoMessage) => void;
  onNo: (msgId: string) => void;
}

function MessageBubble({ message, assistantInitial, c, onYes, onNo }: BubbleProps) {
  const isUser = message.role === "user";

  return (
    <View style={[styles.bubbleWrapper, isUser ? styles.rowUser : styles.rowAssistant]}>
      {!isUser && (
        <View style={[styles.avatar, { backgroundColor: c.primary }]}>
          <Text style={[styles.avatarText, { color: c.primaryForeground }]}>{assistantInitial}</Text>
        </View>
      )}
      <View style={styles.bubbleCol}>
        <View
          style={[
            styles.bubble,
            isUser
              ? [styles.bubbleUser, { backgroundColor: c.primary }]
              : [styles.bubbleAssistant, { backgroundColor: c.card, borderColor: c.border }],
          ]}
        >
          <Text
            style={[
              styles.bubbleText,
              {
                color: isUser ? c.primaryForeground : c.foreground,
                fontFamily: "Inter_400Regular",
              },
            ]}
          >
            {message.text}
          </Text>
        </View>

        {!isUser && message.action && !message.actionResolved && (
          <View style={styles.actionArea}>
            <Text style={[styles.actionLabel, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {actionLabel(message.action)}
            </Text>
            <View style={styles.actionBtns}>
              <TouchableOpacity
                onPress={() => onYes(message)}
                activeOpacity={0.8}
                style={[styles.actionBtn, { backgroundColor: c.primary, borderRadius: c.radius }]}
              >
                <Feather name="check" size={14} color={c.primaryForeground} />
                <Text style={[styles.actionBtnText, { color: c.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                  Yes, do it
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onNo(message.id)}
                activeOpacity={0.8}
                style={[styles.actionBtn, { backgroundColor: c.secondary, borderRadius: c.radius }]}
              >
                <Feather name="x" size={14} color={c.foreground} />
                <Text style={[styles.actionBtnText, { color: c.foreground, fontFamily: "Inter_500Medium" }]}>
                  No thanks
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

// ── screen ────────────────────────────────────────────────────────────────────

export default function PopoScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const { tasks, addTask, completeTask, deleteTask } = useTasks();

  const assistantName = settings.assistantName || "Popo";
  const userName = settings.userName || "there";
  const assistantInitial = assistantName.charAt(0).toUpperCase();

  const [messages, setMessages] = useState<PopoMessage[]>(() => [
    {
      id: "init",
      role: "assistant",
      text: `Hi${userName !== "there" ? `, ${userName}` : ""}! I'm ${assistantName}. I can help you review your tasks, add new ones, or chat about your day. What's on your mind?`,
      actionResolved: true,
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);

  const listRef = useRef<FlatList>(null);
  const transcriptRef = useRef("");
  const isListeningRef = useRef(false);

  // ── speech recognition events ──

  useSpeechRecognitionEvent("result", (event) => {
    const text = event.results?.[0]?.transcript ?? "";
    setLiveTranscript(text);
    transcriptRef.current = text;
  });

  useSpeechRecognitionEvent("end", () => {
    if (!isListeningRef.current) return;
    isListeningRef.current = false;
    setIsListening(false);
    setLiveTranscript("");
    const text = transcriptRef.current.trim();
    if (text) sendMessage(text);
    transcriptRef.current = "";
  });

  useSpeechRecognitionEvent("error", () => {
    isListeningRef.current = false;
    setIsListening(false);
    setLiveTranscript("");
    transcriptRef.current = "";
  });

  // ── scroll to bottom after new messages ──

  function scrollToEnd() {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }

  // ── voice ──

  async function startListening() {
    if (Platform.OS === "web") {
      Alert.alert("Voice input is not available on web.");
      return;
    }
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      Alert.alert(
        "Microphone permission required",
        "Please allow microphone access in Settings to use voice input."
      );
      return;
    }
    transcriptRef.current = "";
    setLiveTranscript("");
    isListeningRef.current = true;
    setIsListening(true);
    ExpoSpeechRecognitionModule.start({ lang: "en-US", interimResults: true });
  }

  function stopListening() {
    ExpoSpeechRecognitionModule.stop();
  }

  // ── send message ──

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      await Speech.stop();

      const userMsg: PopoMessage = {
        id: makeId(),
        role: "user",
        text: trimmed,
        actionResolved: true,
      };

      setMessages((prev) => {
        const next = [...prev, userMsg];
        return next;
      });
      setInputText("");
      setIsLoading(true);
      scrollToEnd();

      try {
        const provider: AIProvider = settings.aiProvider ?? "claude";
        const apiKey = await SecureStore.getItemAsync(secureKey(provider));

        if (!apiKey) {
          setMessages((prev) => [
            ...prev,
            {
              id: makeId(),
              role: "assistant",
              text: "You haven't set up an AI provider yet. Go to Settings → AI Assistant to add an API key.",
              actionResolved: true,
            },
          ]);
          scrollToEnd();
          return;
        }

        const model = settings.aiModel ?? DEFAULT_MODEL[provider];
        const systemPrompt = buildSystemPrompt(tasks, settings);

        const history: ChatMessage[] = [...messages, userMsg].map((m) => ({
          role: m.role,
          content: m.text,
        }));

        const raw = await callAI(provider, apiKey, model, systemPrompt, history);
        const { displayText, action } = parseAction(raw);

        const assistantMsg: PopoMessage = {
          id: makeId(),
          role: "assistant",
          text: displayText || raw.trim(),
          action: action ?? undefined,
          actionResolved: !action,
        };

        setMessages((prev) => [...prev, assistantMsg]);
        scrollToEnd();

        if (ttsEnabled && displayText) {
          Speech.speak(displayText, { language: "en-US" });
        }
      } catch (e: any) {
        setMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            role: "assistant",
            text: `Something went wrong: ${e?.message ?? "Please try again."}`,
            actionResolved: true,
          },
        ]);
        scrollToEnd();
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, messages, settings, tasks, ttsEnabled]
  );

  // ── action handlers ──

  async function handleYes(msg: PopoMessage) {
    if (!msg.action) return;
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, actionResolved: true } : m))
    );

    try {
      if (msg.action.type === "add_task") {
        const now = new Date();
        const targetDate =
          msg.action.targetDate || new Date(now.getTime() + 3600_000).toISOString();
        const hardDeadline =
          msg.action.hardDeadline || new Date(now.getTime() + 10_800_000).toISOString();
        await addTask({
          description: msg.action.description,
          detail: msg.action.detail,
          targetDate,
          hardDeadline,
          isImportant: msg.action.isImportant ?? false,
        });
        const confirm: PopoMessage = {
          id: makeId(),
          role: "assistant",
          text: `Done! "${msg.action.description}" has been added to your tasks.`,
          actionResolved: true,
        };
        setMessages((prev) => [...prev, confirm]);
        if (ttsEnabled) Speech.speak(confirm.text, { language: "en-US" });
      } else if (msg.action.type === "complete_task") {
        await completeTask(msg.action.id);
        const confirm: PopoMessage = {
          id: makeId(),
          role: "assistant",
          text: "Task marked as complete!",
          actionResolved: true,
        };
        setMessages((prev) => [...prev, confirm]);
        if (ttsEnabled) Speech.speak(confirm.text, { language: "en-US" });
      } else if (msg.action.type === "delete_task") {
        await deleteTask(msg.action.id);
        const confirm: PopoMessage = {
          id: makeId(),
          role: "assistant",
          text: "Task deleted.",
          actionResolved: true,
        };
        setMessages((prev) => [...prev, confirm]);
        if (ttsEnabled) Speech.speak(confirm.text, { language: "en-US" });
      }
      scrollToEnd();
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: "assistant",
          text: "Sorry, I couldn't complete that action. Please try again.",
          actionResolved: true,
        },
      ]);
      scrollToEnd();
    }
  }

  function handleNo(msgId: string) {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, actionResolved: true } : m))
    );
  }

  // ── render ──

  const topInset = Platform.OS === "ios" ? insets.top : insets.top + 8;
  const bottomInset = insets.bottom;

  const displayedMessages = [...messages, ...(isLoading ? [{ id: "__typing__" } as any] : [])];

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* Header */}
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
        <TouchableOpacity
          onPress={() => {
            Speech.stop();
            router.back();
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[styles.headerBtn, { backgroundColor: c.secondary, borderRadius: 20 }]}
        >
          <Feather name="arrow-left" size={18} color={c.foreground} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: c.foreground, fontFamily: "Inter_700Bold" }]}>
            {assistantName}
          </Text>
          <Text style={[styles.headerSub, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            AI assistant
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => {
            const next = !ttsEnabled;
            setTtsEnabled(next);
            if (!next) Speech.stop();
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[
            styles.headerBtn,
            { backgroundColor: ttsEnabled ? c.primary + "18" : c.secondary, borderRadius: 20 },
          ]}
        >
          <Feather name={ttsEnabled ? "volume-2" : "volume-x"} size={18} color={ttsEnabled ? c.primary : c.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* Message list */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={listRef}
          data={displayedMessages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: 16 }]}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToEnd}
          renderItem={({ item }) => {
            if (item.id === "__typing__") {
              return <TypingIndicator assistantInitial={assistantInitial} c={c} />;
            }
            const msg = item as PopoMessage;
            return (
              <MessageBubble
                message={msg}
                assistantInitial={assistantInitial}
                c={c}
                onYes={handleYes}
                onNo={handleNo}
              />
            );
          }}
        />

        {/* Input bar */}
        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: c.card,
              borderTopColor: c.border,
              paddingBottom: bottomInset + 8,
            },
          ]}
        >
          {isListening && liveTranscript ? (
            <Text
              style={[styles.liveTranscript, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}
              numberOfLines={2}
            >
              {liveTranscript}
            </Text>
          ) : null}

          <View style={styles.inputRow}>
            {/* Mic button */}
            <TouchableOpacity
              onPress={isListening ? stopListening : startListening}
              disabled={isLoading}
              activeOpacity={0.8}
              style={[
                styles.micBtn,
                {
                  backgroundColor: isListening ? c.destructive : c.secondary,
                  borderRadius: 20,
                  opacity: isLoading ? 0.5 : 1,
                },
              ]}
            >
              <Feather
                name={isListening ? "square" : "mic"}
                size={18}
                color={isListening ? "#fff" : c.foreground}
              />
            </TouchableOpacity>

            {/* Text input */}
            <TextInput
              style={[
                styles.input,
                {
                  color: c.foreground,
                  backgroundColor: c.secondary,
                  borderRadius: 20,
                  fontFamily: "Inter_400Regular",
                },
              ]}
              value={isListening ? liveTranscript : inputText}
              onChangeText={isListening ? undefined : setInputText}
              editable={!isListening && !isLoading}
              placeholder={isListening ? "Listening…" : "Message…"}
              placeholderTextColor={c.mutedForeground}
              returnKeyType="send"
              onSubmitEditing={() => sendMessage(inputText)}
              multiline
              maxLength={500}
            />

            {/* Send button */}
            <TouchableOpacity
              onPress={() => sendMessage(inputText)}
              disabled={!inputText.trim() || isLoading || isListening}
              activeOpacity={0.8}
              style={[
                styles.sendBtn,
                {
                  backgroundColor:
                    inputText.trim() && !isLoading && !isListening ? c.primary : c.secondary,
                  borderRadius: 20,
                },
              ]}
            >
              <Feather
                name="send"
                size={18}
                color={
                  inputText.trim() && !isLoading && !isListening
                    ? c.primaryForeground
                    : c.mutedForeground
                }
              />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

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
  headerBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerCenter: { alignItems: "center", gap: 1 },
  headerTitle: { fontSize: 17 },
  headerSub: { fontSize: 11 },
  listContent: { paddingTop: 16, paddingHorizontal: 16 },
  // bubbles
  bubbleWrapper: { marginBottom: 12 },
  rowUser: { flexDirection: "row", justifyContent: "flex-end" },
  rowAssistant: { flexDirection: "row", justifyContent: "flex-start", gap: 8 },
  bubbleCol: { flex: 1, maxWidth: "80%" },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-end",
    marginBottom: 2,
  },
  avatarText: { fontSize: 13, fontWeight: "700" },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleUser: {
    borderBottomRightRadius: 4,
    alignSelf: "flex-end",
  },
  bubbleAssistant: {
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  // action buttons
  actionArea: { marginTop: 6, gap: 6 },
  actionLabel: { fontSize: 12, paddingHorizontal: 2 },
  actionBtns: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  actionBtnText: { fontSize: 13 },
  // input bar
  inputBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingHorizontal: 12,
  },
  liveTranscript: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 6,
    paddingBottom: 6,
    fontStyle: "italic",
  },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  micBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  input: {
    flex: 1,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxHeight: 100,
  },
  sendBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
});
