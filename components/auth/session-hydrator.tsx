"use client";

import { useEffect } from "react";
import type { User } from "@/lib/types";
import { useSessionStore } from "@/stores/session-store";

/**
 * Hydrates the client-side session store with the server-resolved user
 * on mount. Keeps client state in sync with the cookie session.
 */
export function SessionHydrator({ user }: { user: User }) {
  const setUser = useSessionStore((s) => s.setUser);
  useEffect(() => {
    setUser(user);
  }, [user, setUser]);
  return null;
}
