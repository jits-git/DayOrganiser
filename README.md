# Day Organizer

A mobile productivity app built with React Native and Expo that helps you organize your day through smart task management, scheduled reminders, and voice input.

---

## Features

### Task Management
- **Create tasks** with a title (required) and detailed description (optional)
- **Assign a color** to each task to categorize by type or urgency
- **Set a target date and time** — your intended completion time
- **Set a hard deadline date and time** — a non-negotiable cutoff; target date cannot exceed it
- **Mark tasks as complete** at any point
- **Replan tasks** by modifying the target date and time
- When the target time passes, the app prompts you to mark complete or replan
- When the hard deadline passes, the app prompts you to mark complete or replan

### Views
- **Today** — default landing view showing all tasks due today
- **Week** — calendar view of tasks for the current week
- **This Month** — monthly calendar view; swipe to navigate to future months
- **Upcoming** — tasks beyond the current week, visible by scrolling down from Today

### Notifications
- **Morning summary** (default 7:00 AM) — tasks with a target or hard deadline due today
- **Afternoon summary** (default 1:00 PM) — completed vs remaining tasks for today
- **Evening summary** (default 10:00 PM) — completed vs remaining tasks for today
- **1-hour alert** before each task's target completion time
- Notification times are configurable in Settings

### Voice Input
- Add tasks and set dates/times via voice command
- Parsed using natural language processing (NLP)
- **Note:** Voice input requires a native development build (see Limitations)

### Settings
- Configure morning, afternoon, and evening notification times

---

## Architecture

### Tech Stack
| Layer | Technology |
|---|---|
| Framework | React Native (Expo SDK 54) |
| Navigation | Expo Router |
| Notifications | expo-notifications |
| Voice Input | expo-speech-recognition |
| Styling | React Native StyleSheet |
| Keyboard Handling | react-native-keyboard-controller (KeyboardAwareScrollView) |
| Build System | EAS Build (Expo Application Services) |
| Package Manager | pnpm (monorepo) |

### Project Structure
```
myagent/                          # Monorepo root
├── artifacts/
│   └── mobile/                   # Main mobile app
│       ├── app/                  # Expo Router screens
│       │   ├── index.tsx         # Landing / Today view
│       │   ├── week.tsx          # Week calendar view
│       │   └── month.tsx         # Month calendar view
│       ├── components/           # Reusable UI components
│       ├── hooks/
│       │   └── useNotifications.ts  # Notification logic
│       ├── assets/               # Images, fonts
│       ├── app.json              # Expo config
│       └── eas.json              # EAS Build config
├── lib/                          # Shared libraries
├── scripts/                      # Build/utility scripts
├── package.json                  # Workspace root
└── pnpm-workspace.yaml           # Monorepo config
```

### Notification Architecture
- Notifications are scheduled locally on-device using `expo-notifications`
- Three daily digest notifications are scheduled at user-configured times
- Per-task alerts are scheduled 1 hour before each target completion time
- In Expo Go, notifications fall back gracefully due to platform restrictions

---

## Limitations

### Voice Input
- Voice input requires a **native development build** and does not work in Expo Go
- In Expo Go, the voice input button falls back to a text-based **Smart Task Input** modal with NLP parsing
- The Smart Task Input modal uses `KeyboardAwareScrollView` from `react-native-keyboard-controller` to ensure reliable rendering inside React Native modals
- To enable real voice: build with `eas build --platform android --profile development` and install the resulting APK

### Notifications
- Full notification support requires a native build
- In Expo Go, some notification features may behave inconsistently, particularly on Android

### Recurring Tasks
- The app does not currently support recurring or repeating tasks

### Sync & Cloud
- Tasks are stored locally on-device only
- No cloud sync or multi-device support

### Calendar Integration
- No integration with Google Calendar, Apple Calendar, or other external calendars

---

## Getting Started

### Prerequisites
- Node.js 18+
- pnpm (`npm install -g pnpm`)
- Expo Go app on your phone (for quick testing)
- EAS CLI for native builds (`npm install -g eas-cli`)

### Run locally (Expo Go)
```bash
# Install dependencies
pnpm install

# Start the dev server
cd artifacts/mobile
npx expo start
```
Scan the QR code with Expo Go (Android) or Camera app (iOS).

### Native build (required for voice input)
```bash
# Login to EAS
eas login

# Build for Android
eas build --platform android --profile development

# Start with dev client
npx expo start --dev-client
```

---

---

## Data Architecture

### Authentication & Storage Strategy
The app uses **Firebase** as the primary backend:

- **Google Login** via Firebase Authentication — no new passwords for the user
- **Firestore** as the cloud database — stores tasks, settings, and user profile in real time
- **Google Drive** (optional) — manual export/import of tasks as a JSON backup file

```
Phone App
    ↓ Google Login (OAuth)
Firebase Auth  →  confirms identity
    ↓
Firestore DB   →  stores tasks, settings, user profile
    ↓
Google Drive   →  optional manual export/backup as JSON
```

### Why not Google Drive as primary storage?
Google Drive is designed for files, not structured app data. Reading and writing a whole JSON file on every change is slow and error-prone at scale. Firestore is purpose-built for this and is free within generous limits (50k reads / 20k writes per day).

### Why Firebase over Supabase?
Firebase offers Google login and Firestore in one integrated package with minimal setup. Supabase is a strong open-source alternative (SQL-based, no vendor lock-in) and can be considered if Google ecosystem dependency becomes a concern.

---

## Roadmap
- [ ] **Important task flagging** — star icon to mark high-priority tasks; starred tasks get an extra notification 1 hour before hard deadline in addition to the target time alert
- [ ] **Important tasks in summaries** — morning/afternoon/evening announcements explicitly mention starred tasks by name with their completion times
- [ ] **Today tab redesign** — continuous scrollable timeline transitioning from Today → Tomorrow → This Week → Later, replacing the need for a separate Week tab
- [ ] **Remove Week tab** — replaced by the scrollable Today timeline; Month tab moves to the center position
- [ ] **Summarize button** — new bottom-right tab that triggers an immediate voice summary of: important tasks missed, tasks completed today, important tasks still ahead, and total incomplete count for the day
- [x] **Login & cloud backup** — Google login via Firebase Authentication + Firestore sync so tasks are backed up and restorable across devices and reinstalls; optional Google Drive JSON export
- [ ] Recurring tasks
- [ ] Google Calendar integration
- [ ] Widget for home screen
- [ ] iOS support and App Store release
- [ ] Android Play Store release
- [ ] Natural voice announcements via cloud TTS (Google Cloud TTS or ElevenLabs) to replace Android's robotic built-in TTS engine
