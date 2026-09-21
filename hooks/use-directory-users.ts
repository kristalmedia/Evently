"use client";

import { useEffect, useState } from "react";
import { apiPath } from "@/lib/api-path";

/** Lightweight shape returned by /api/users/directory. */
export interface DirectoryUser {
  id: string;
  fullName: string;
  email: string;
  department: string;
  role: string;
  secondaryRole?: string;
}

/**
 * Module-level cache — the users directory is small (dozens of rows)
 * and rarely changes during a session; fetching it once per tab is
 * plenty. Every editor that mounts subscribes to the same promise
 * instead of firing a duplicate GET.
 *
 * Not React state on purpose: this needs to survive component
 * unmount/remount cycles (opening the same booking twice, closing +
 * reopening an editor drawer) without a re-fetch.
 */
let cache: DirectoryUser[] | null = null;
let inflight: Promise<DirectoryUser[]> | null = null;

async function fetchDirectory(): Promise<DirectoryUser[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch(apiPath("/api/users/directory"), { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Directory fetch failed"))))
    .then((data: { users: DirectoryUser[] }) => {
      cache = data.users;
      inflight = null;
      return data.users;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });
  return inflight;
}

/**
 * Fetches the users directory on mount, returns `{ users, loading }`.
 * Any component in the tree hits the shared cache so we don't fan out
 * duplicate GETs when several editors render on the same page.
 */
export function useDirectoryUsers(): {
  users: DirectoryUser[];
  loading: boolean;
} {
  const [users, setUsers] = useState<DirectoryUser[]>(cache ?? []);
  const [loading, setLoading] = useState<boolean>(!cache);
  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    fetchDirectory()
      .then((u) => {
        if (!cancelled) {
          setUsers(u);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { users, loading };
}
