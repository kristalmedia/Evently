"use client";

import { create } from "zustand";
import type { User } from "@/lib/types";

interface SessionState {
  user: User | null;
  setUser: (user: User | null) => void;
  clear: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  clear: () => set({ user: null }),
}));
