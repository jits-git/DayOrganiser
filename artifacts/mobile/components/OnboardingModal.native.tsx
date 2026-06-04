import { Feather } from "@expo/vector-icons";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import React, { useRef, useState } from "react";
import {
  Keyboard,
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
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
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
  const [isListening, setIsListening] = useState(false);
  const isListeningRef = useRef(false);

  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  function startRingAnimation() {
    ringOpacity.value = withTiming(0.35);
    ringScale.value = withRepeat(
      withSequence(
        withTiming(1.8, { duration: 900, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 900, easing: Easing.in(Easing.quad) })
      ),
      -1,
      false
    );
  }

  function stopRingAnimation() {
    ringOpacity.value = withTiming(0);
    ringScale.value = withTiming(1);
  }

  useSpeechRecognitionEvent("result", (event) => {
    const text = event.results?.[0]?.transcript ?? "";
    if (text) setNameText(text);
  });

  useSpeechRecognitionEvent("end", () => {
    if (!isListeningRef.current) return;
    isListeningRef.current = false;
    setIsListening(false);
    stopRingAnimation();
  });

  useSpeechRecognitionEvent("error", () => {
    isListeningRef.current = false;
    setIsListening(false);
    stopRingAnimation();
  });

  async function handleMicPress() {
    Keyboard.dismiss();
    if (isListening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) return;
    isListeningRef.current = true;
    setIsListening(true);
    startRingAnimation();
    ExpoSpeechRecognitionModule.start({ lang: "en-US", interimResults: true });
  }

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
      presentationStyle="fullScreen"
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

          <View style={styles.micRow}>
            <TouchableOpacity onPress={handleMicPress} activeOpacity={0.85}>
              <View style={styles.micWrapper}>
                <Animated.View
                  style={[
                    styles.micRing,
                    { backgroundColor: isListening ? c.destructive : c.primary },
                    ringStyle,
                  ]}
                />
                <View
                  style={[
                    styles.micButton,
                    {
                      backgroundColor: isListening ? c.destructive : c.primary,
                      borderRadius: 36,
                      elevation: 4,
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.15,
                      shadowRadius: 8,
                    },
                  ]}
                >
                  <Feather
                    name={isListening ? "mic-off" : "mic"}
                    size={26}
                    color="#fff"
                  />
                </View>
              </View>
            </TouchableOpacity>
            <Text
              style={[
                styles.micLabel,
                { color: c.mutedForeground, fontFamily: "Inter_400Regular" },
              ]}
            >
              {isListening ? "Listening… tap to stop" : "or tap to speak your name"}
            </Text>
          </View>
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
  micRow: {
    alignItems: "center",
    gap: 12,
    marginTop: 4,
  },
  micWrapper: {
    width: 80,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  micRing: {
    position: "absolute",
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  micButton: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  micLabel: {
    fontSize: 14,
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
