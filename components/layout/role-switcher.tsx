"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, UsersRound } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABEL } from "@/lib/permissions";
import type { User } from "@/lib/types";
import { useSessionStore } from "@/stores/session-store";

/**
 * Development-only role switcher.
 * Not for production — remove or gate behind an env flag before shipping to real users.
 */
export function RoleSwitcher() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const currentUser = useSessionStore((s) => s.user);

  // Hydrate from the unauthenticated dev endpoint so the switcher works for every role.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/dev/seed-users")
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then(({ users }) => !cancelled && setUsers(users ?? []))
      .catch(() => !cancelled && setUsers([]));
    return () => {
      cancelled = true;
    };
  }, []);

  async function switchTo(userId: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error("Failed");
      const { session } = await res.json();
      useSessionStore.getState().setUser(session.user);
      toast.success(`Signed in as ${session.user.fullName}`, {
        description: ROLE_LABEL[session.user.role as keyof typeof ROLE_LABEL],
      });
      router.refresh();
    } catch {
      toast.error("Could not switch user");
    } finally {
      setLoading(false);
    }
  }

  const byRole = users.reduce<Record<string, User[]>>((acc, u) => {
    (acc[u.role] ??= []).push(u);
    return acc;
  }, {});

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={loading}
          title="Switch user (dev)"
        >
          {loading ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <UsersRound className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">Switch user</span>
          <Badge variant="outline" className="text-[0.62rem] py-0 px-1.5 font-mono">
            DEV
          </Badge>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 max-h-[70vh] overflow-y-auto">
        <DropdownMenuLabel>Test as another user</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(["SUPER_ADMIN", "BROADCAST_ADMIN", "MANAGER", "FINANCIAL_ADMIN", "HR", "VIEWER"] as const).map(
          (role) =>
            (byRole[role]?.length ?? 0) > 0 && (
              <div key={role}>
                <DropdownMenuLabel className="text-[0.62rem]">
                  {ROLE_LABEL[role]}
                </DropdownMenuLabel>
                {byRole[role].map((u) => (
                  <DropdownMenuItem
                    key={u.id}
                    onClick={() => switchTo(u.id)}
                    className="flex flex-col items-start gap-0.5"
                  >
                    <div className="flex items-center gap-2 w-full">
                      <span className="truncate font-medium">{u.fullName}</span>
                      {currentUser?.id === u.id && (
                        <Badge variant="signal" className="text-[0.6rem] ml-auto">
                          Current
                        </Badge>
                      )}
                    </div>
                    <span className="text-[0.7rem] text-muted-foreground truncate">
                      {u.department} · {u.email}
                    </span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
              </div>
            )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
