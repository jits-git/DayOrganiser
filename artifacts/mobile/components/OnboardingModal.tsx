import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";

interface OnboardingModalProps {
  visible: boolean;
}

export function OnboardingModal({ visible }: OnboardingModalProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useSettings();

  const [nameText, setNameText] = useState("");

  async function handleContinue() {
    const name = nameText.trim();
    if (!name) return;
    await updateSettings({ userName: name, onboardingComplete: true });
  }

  const assistantName = settings.assistantName || "Kate";
  const canContinue = nameText.trim().length > 0;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={() => {}}
    >
      <KeyboardAvoidingView
        style={[styles.flex, { backgroundColor: c.background }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 48, paddingBottom: 16 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.avatar,
              { backgroundColor: c.primary + "18", borderRadius: 52 },
            ]}
          >
            <Feather name="message-circle" size={52} color={c.primary} />
          </View>

          <Text
            style={[styles.hiText, { color: c.foreground, fontFamily: "Inter_700Bold" }]}
          >
            Hi There!
          </Text>

          <Text
            style={[
              styles.introText,
              { color: c.mutedForeground, fontFamily: "Inter_400Regular" },
            ]}
          >
            I am{" "}
            <Text style={{ color: c.primary, fontFamily: "Inter_600SemiBold" }}>
              {assistantName}
            </Text>
            , your personal assistant!
          </Text>

          <Text
            style={[
              styles.questionText,
              { color: c.foreground, fontFamily: "Inter_600SemiBold" },
            ]}
          >
            What's your name?
          </Text>

          <TextInput
            style={[
              styles.nameInput,
              {
                backgroundColor: c.card,
                borderColor: nameText.trim() ? c.primary : c.border,
                color: c.foreground,
                borderRadius: c.radius,
                fontFamily: "Inter_400Regular",
              },
            ]}
            placeholder="Type your name..."
            placeholderTextColor={c.mutedForeground}
            value={nameText}
            onChangeText={setNameText}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={canContinue ? handleContinue : undefined}
          />
        </ScrollView>

        <TouchableOpacity
          onPress={handleContinue}
          disabled={!canContinue}
          activeOpacity={0.85}
          style={[
            styles.continueBtn,
            {
              backgroundColor: canContinue ? c.primary : c.secondary,
              borderRadius: c.radius,
              marginHorizontal: 28,
              marginBottom: insets.bottom + 24,
            },
          ]}
        >
          <Text
            style={[
              styles.continueBtnText,
              {
                color: canContinue ? c.primaryForeground : c.mutedForeground,
                fontFamily: "Inter_600SemiBold",
              },
            ]}
          >
            Let's go
          </Text>
          <Feather
            name="arrow-right"
            size={18}
            color={canContinue ? c.primaryForeground : c.mutedForeground}
          />
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 20,
  },
  avatar: {
    width: 104,
    height: 104,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  hiText: {
    fontSize: 38,
    textAlign: "center",
  },
  introText: {
    fontSize: 18,
    textAlign: "center",
    lineHeight: 26,
    marginTop: -4,
  },
  questionText: {
    fontSize: 22,
    textAlign: "center",
    marginBottom: 4,
  },
  nameInput: {
    width: "100%",
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    textAlign: "center",
  },
  continueBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    marginTop: 8,
  },
  continueBtnText: {
    fontSize: 17,
  },
});
