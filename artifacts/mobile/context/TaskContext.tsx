import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { Task } from "@/types/task";
import {
  cancelTaskNotification,
  scheduleTaskNotification,
} from "@/hooks/useNotifications";

const STORAGE_KEY = "@dayorganizer/tasks";

interface TaskContextType {
  tasks: Task[];
  loading: boolean;
  addTask: (
    task: Omit<Task, "id" | "isCompleted" | "notificationId">
  ) => Promise<void>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
  completeTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
}

const TaskContext = createContext<TaskContextType | null>(null);

export function TaskProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        setTasks(JSON.parse(stored));
      }
    } catch (e) {
    } finally {
      setLoading(false);
    }
  }

  async function persistTasks(updated: Task[]) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setTasks(updated);
  }

  const addTask = useCallback(
    async (data: Omit<Task, "id" | "isCompleted" | "notificationId">) => {
      const id =
        Date.now().toString() + Math.random().toString(36).substr(2, 9);
      const task: Task = { ...data, id, isCompleted: false };
      const notificationId = await scheduleTaskNotification(task);
      if (notificationId) task.notificationId = notificationId;
      const updated = [...tasks, task];
      await persistTasks(updated);
    },
    [tasks]
  );

  const updateTask = useCallback(
    async (id: string, updates: Partial<Task>) => {
      const existing = tasks.find((t) => t.id === id);
      if (!existing) return;

      if (existing.notificationId) {
        await cancelTaskNotification(existing.notificationId);
      }

      const updated = tasks.map((t) => (t.id === id ? { ...t, ...updates } : t));
      const taskUpdated = updated.find((t) => t.id === id)!;

      if (!taskUpdated.isCompleted) {
        const notificationId = await scheduleTaskNotification(taskUpdated);
        const finalUpdated = updated.map((t) =>
          t.id === id ? { ...t, notificationId: notificationId ?? undefined } : t
        );
        await persistTasks(finalUpdated);
      } else {
        await persistTasks(updated);
      }
    },
    [tasks]
  );

  const completeTask = useCallback(
    async (id: string) => {
      const task = tasks.find((t) => t.id === id);
      if (!task) return;
      if (task.notificationId) {
        await cancelTaskNotification(task.notificationId);
      }
      const updated = tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              isCompleted: true,
              completedAt: new Date().toISOString(),
              notificationId: undefined,
            }
          : t
      );
      await persistTasks(updated);
    },
    [tasks]
  );

  const deleteTask = useCallback(
    async (id: string) => {
      const task = tasks.find((t) => t.id === id);
      if (task?.notificationId) {
        await cancelTaskNotification(task.notificationId);
      }
      const updated = tasks.filter((t) => t.id !== id);
      await persistTasks(updated);
    },
    [tasks]
  );

  return (
    <TaskContext.Provider
      value={{ tasks, loading, addTask, updateTask, completeTask, deleteTask }}
    >
      {children}
    </TaskContext.Provider>
  );
}

export function useTasks() {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error("useTasks must be used within TaskProvider");
  return ctx;
}
