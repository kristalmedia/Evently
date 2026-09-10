"use client";

import { useRouter } from "next/navigation";
import { LogOut, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABEL } from "@/lib/permissions";
import { initials } from "@/lib/utils";
import { useSessionStore } from "@/stores/session-store";

export function UserMenu() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  if (!user) return null;

  async function handleSignOut() {
    const res = await fetch("/api/auth/logout", { method: "POST" });
    const { wasEntraSession } = await res.json().catch(() => ({ wasEntraSession: false }));
    useSessionStore.getState().clear();

    // Clearing our own cookies only ends KEMS's session — the browser still
    // has an active Microsoft SSO session unless we explicitly redirect
    // through Entra's own end_session_endpoint (front-channel logout).
    // Without this, "Sign in with Microsoft" next time silently re-uses the
    // still-active Microsoft session instead of prompting fresh credentials.
    if (wasEntraSession) {
      const postLogoutRedirectUri = `${window.location.origin}/login`;
      window.location.href = `https://login.microsoftonline.com/common/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(postLogoutRedirectUri)}`;
      return;
    }

    toast.success("Signed out");
    router.push("/login");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar className="h-9 w-9">
          <AvatarFallback className="bg-accent/15 text-accent">
            {initials(user.fullName)}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="normal-case tracking-normal text-sm font-normal">
          <div className="flex flex-col gap-1 py-1">
            <span className="font-semibold text-foreground truncate">
              {user.fullName}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              {user.email}
            </span>
            <div className="flex items-center gap-2 pt-1">
              <Badge variant="signal">{ROLE_LABEL[user.role]}</Badge>
              <Badge variant="outline">{user.department}</Badge>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/profile")}>
          <UserIcon className="h-4 w-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
