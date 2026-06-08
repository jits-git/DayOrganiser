import { Feather } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import React, { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PRO_MODE_ENABLED } from "@/constants/buildConfig";
import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";

interface IntroductionModalProps {
  visible: boolean;
  onClose: () => void;
}

interface Screen {
  icon: string;
  title: string;
  getText: (name: string) => string;
  proOnly?: boolean;
}

const ALL_SCREENS: Screen[] = [
  {
    icon: "sun",
    title: "Welcome!",
    getText: (name) =>
      `Welcome to your very own Day Organizer! I am your personal planning assistant. You can call me ${name} for now, but feel free to change my name in the Settings tab.`,
  },
  {
    icon: "plus-circle",
    title: "Adding Tasks",
    getText: () =>
      "Tap the plus button to add a task. Give it a title and an optional description. Set a target completion time — this is when you aim to finish.",
  },
  {
    icon: "alert-circle",
    title: "Hard Deadlines",
    getText: () =>
      "You can also set a hard deadline — the absolute latest a task must be done. A default hard deadline is set automatically, but you can change it anytime. You can set your preferred default in Settings.",
  },
  {
    icon: "droplet",
    title: "Colours and Categories",
    getText: () =>
      "Use the colour palette when creating a task to group similar tasks together — work, personal, errands. It is optional but makes your task list much easier to scan at a glance.",
  },
  {
    icon: "star",
    title: "Marking Important Tasks",
    getText: () =>
      "Tap the star on any task to mark it as important. Important tasks get extra reminders and are always highlighted in your daily summaries.",
  },
  {
    icon: "calendar",
    title: "Your Daily View",
    getText: () =>
      "Your home screen shows today's tasks at the top. Scroll down to see tomorrow, this week, and beyond. Everything is organized chronologically so you always know what is coming up.",
  },
  {
    icon: "bell",
    title: "Daily Summaries",
    getText: (name) =>
      `Every morning, afternoon and evening ${name} will remind you what is on your plate. Tap the Summarize tab anytime for an instant spoken update.`,
  },
  {
    icon: "mic",
    title: "Voice Input",
    getText: () =>
      "Tap the microphone to add tasks by voice. Just say something like Call dentist tomorrow at 3pm and I will take care of the rest.",
  },
  {
    icon: "user",
    title: "Your Assistant",
    getText: (name) =>
      `Your assistant is here to help you stay organized. You can call me ${name} for now, but feel free to rename me in Settings to whatever feels natural to you.`,
  },
  {
    icon: "shield",
    title: "Backup and Sync",
    getText: () =>
      "Sign in with your Gmail account to back up all your tasks to your own private Google Drive. No one else can access it. Backups happen every 4 hours between 5am and midnight. We recommend syncing manually after adding important tasks.",
  },
  {
    icon: "zap",
    title: "Pro Mode Coming Soon",
    getText: () =>
      "A Pro Mode is currently being developed with exciting new features. Stay tuned for more details soon.",
    proOnly: true,
  },
  {
    icon: "heart",
    title: "Made with Love",
    getText: () =>
      "This app was made with a lot of love. We hope it makes your day a little easier. Please share your feedback regularly in the Settings tab — it helps us improve. You can revisit this guide anytime from Settings.",
  },
];

export function IntroductionModal({ visible, onClose }: IntroductionModalProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();

  const name = settings.assistantName || "Kate";
  const screens = ALL_SCREENS.filter((s) => !s.proOnly || PRO_MODE_ENABLED);

  const [index, setIndex] = useState(0);

  // Speak the current screen's text whenever the screen changes or modal opens
  useEffect(() => {
    if (!visible) {
      Speech.stop();
      return;
    }
    Speech.stop();
    const timeout = setTimeout(() => {
      Speech.speak(screens[index].getText(name), { language: "en-US" });
    }, 150);
    return () => {
      clearTimeout(timeout);
    };
  }, [visible, index]);

  function handleNext() {
    if (index < screens.length - 1) {
      setIndex((i) => i + 1);
    } else {
      handleClose();
    }
  }

  function handleBack() {
    if (index > 0) setIndex((i) => i - 1);
  }

  function handleClose() {
    Speech.stop();
    setIndex(0);
    onClose();
  }

  const screen = screens[index];
  const isLast = index === screens.length - 1;
  const isFirst = index === 0;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <View
        style={[
          styles.container,
          {
            backgroundColor: c.background,
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <Text
            style={[
              styles.screenCounter,
              { color: c.mutedForeground, fontFamily: "Inter_400Regular" },
            ]}
          >
            {index + 1} / {screens.length}
          </Text>
          <TouchableOpacity
            onPress={handleClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={[styles.skipBtn, { backgroundColor: c.secondary, borderRadius: 20 }]}
          >
            <Text
              style={[
                styles.skipText,
                { color: c.mutedForeground, fontFamily: "Inter_500Medium" },
              ]}
            >
              Skip
            </Text>
          </TouchableOpacity>
        </View>

        {/* Scrollable content area */}
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: c.primary + "18", borderRadius: 52 },
            ]}
          >
            <Feather name={screen.icon as any} size={52} color={c.primary} />
          </View>

          <Text
            style={[
              styles.title,
              { color: c.foreground, fontFamily: "Inter_700Bold" },
            ]}
          >
            {screen.title}
          </Text>

          <Text
            style={[
              styles.body,
              { color: c.mutedForeground, fontFamily: "Inter_400Regular" },
            ]}
          >
            {screen.getText(name)}
          </Text>
        </ScrollView>

        {/* Progress dots */}
        <View style={styles.dots}>
          {screens.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === index ? c.primary : c.border,
                  width: i === index ? 20 : 8,
                },
              ]}
            />
          ))}
        </View>

        {/* Navigation row */}
        <View style={styles.navRow}>
          <TouchableOpacity
            onPress={handleBack}
            disabled={isFirst}
            activeOpacity={0.7}
            style={[
              styles.backBtn,
              {
                borderColor: c.border,
                borderRadius: c.radius,
                opacity: isFirst ? 0 : 1,
              },
            ]}
          >
            <Feather name="arrow-left" size={18} color={c.foreground} />
            <Text
              style={[
                styles.backText,
                { color: c.foreground, fontFamily: "Inter_500Medium" },
              ]}
            >
              Back
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleNext}
            activeOpacity={0.85}
            style={[
              styles.nextBtn,
              { backgroundColor: c.primary, borderRadius: c.radius },
            ]}
          >
            <Text
              style={[
                styles.nextText,
                { color: c.primaryForeground, fontFamily: "Inter_600SemiBold" },
              ]}
            >
              {isLast ? "Get Started" : "Next"}
            </Text>
            {!isLast && (
              <Feather name="arrow-right" size={18} color={c.primaryForeground} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  screenCounter: {
    fontSize: 14,
  },
  skipBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  skipText: {
    fontSize: 14,
  },
  content: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    gap: 20,
  },
  iconCircle: {
    width: 104,
    height: 104,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 30,
    textAlign: "center",
    lineHeight: 36,
  },
  body: {
    fontSize: 17,
    textAlign: "center",
    lineHeight: 26,
    maxWidth: 360,
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 16,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 4,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderWidth: 1,
  },
  backText: {
    fontSize: 16,
  },
  nextBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  nextText: {
    fontSize: 17,
  },
});
