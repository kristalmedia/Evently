"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Menu, X, Radio, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KristalWordmark } from "./kristal-mark";
import { SidebarNav, useSidebarData } from "./sidebar";
import { useSessionStore } from "@/stores/session-store";
import { ROLE_LABEL } from "@/lib/permissions";

/** Drop /profile and /notifications from the drawer nav — they're already surfaced as top shortcuts. */
function filterDuplicateShortcuts<T extends { href: string }>(
  grouped: Record<string, T[]>
): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const [section, items] of Object.entries(grouped)) {
    const kept = items.filter(
      (i) => i.href !== "/profile" && i.href !== "/notifications"
    );
    if (kept.length > 0) out[section] = kept;
  }
  return out;
}

/**
 * Mobile & tablet hamburger + slide-out drawer that mirrors the desktop sidebar.
 * Visible below the md breakpoint (below 768px).
 *
 * Includes:
 *   - Body scroll lock while open
 *   - Backdrop tap-to-close
 *   - Auto-close on route change
 *   - Escape key to close
 *   - User profile shortcut with notification count inside the drawer
 *   - 44px minimum touch targets throughout
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { pathname, grouped } = useSidebarData();
  const user = useSessionStore((s) => s.user);
  const [unread, setUnread] = useState(0);
  const { resolvedTheme } = useTheme();
  const drawerBg = resolvedTheme === "dark" ? "#0d1520" : "#ffffff";

  useEffect(() => setMounted(true), []);

  // Close whenever the user navigates (pathname changes).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Prevent body scroll while open + Escape key handler.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Poll unread count so the drawer profile badge stays fresh.
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch("/api/notifications/count", { cache: "no-store" });
        if (!res.ok) return;
        const d = (await res.json()) as { count?: number };
        if (!cancelled) setUnread(d.count ?? 0);
      } catch {
        /* silent */
      }
    }
    tick();
    const interval = setInterval(tick, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const drawer = open ? (
    <div className="md:hidden">
      {/* Backdrop — fixed to the viewport directly */}
      <button
        aria-label="Close menu"
        onClick={() => setOpen(false)}
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      />
      {/* Drawer — fixed to the viewport with explicit h-screen. Rendered via portal so no ancestor (Topbar's backdrop-blur, transforms, etc.) can shrink its containing block. */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        style={{ backgroundColor: drawerBg }}
        className="fixed top-0 left-0 z-[70] h-screen w-[88vw] max-w-[320px] border-r border-border flex flex-col shadow-2xl animate-in slide-in-from-left duration-200"
      >
        <div className="flex items-center justify-between h-14 px-4 border-b shrink-0">
          <Link
            href="/dashboard"
            className="flex items-center min-w-0"
            onClick={() => setOpen(false)}
          >
            <KristalWordmark />
          </Link>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close"
            className="h-10 w-10 shrink-0"
            onClick={() => setOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* User profile shortcut */}
        {user && (
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-2.5 border-b hover:bg-secondary/60 active:bg-secondary transition-colors"
          >
            <div className="h-9 w-9 rounded-full bg-accent/15 grid place-items-center text-xs font-medium text-accent shrink-0">
              {user.fullName
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{user.fullName}</div>
              <div className="text-[0.7rem] text-muted-foreground truncate">
                {ROLE_LABEL[user.role]}
              </div>
            </div>
          </Link>
        )}

        {/* Notifications shortcut with count badge */}
        <Link
          href="/notifications"
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 px-4 py-2.5 border-b hover:bg-secondary/60 active:bg-secondary transition-colors"
        >
          <div className="relative shrink-0">
            <Bell className="h-4 w-4 text-foreground/75" />
            {unread > 0 && (
              <span
                aria-hidden="true"
                className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-onair text-white text-[0.6rem] font-mono font-bold leading-4 text-center"
              >
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </div>
          <div className="flex-1 flex items-center justify-between gap-2 min-w-0">
            <span className="text-sm font-medium truncate">Notifications</span>
            {unread > 0 && (
              <span className="text-xs text-onair font-medium shrink-0">
                {unread} unread
              </span>
            )}
          </div>
        </Link>

        <SidebarNav
          pathname={pathname}
          grouped={filterDuplicateShortcuts(grouped)}
          onNavigate={() => setOpen(false)}
          dense
        />

        <div className="border-t px-4 py-2.5 shrink-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Radio className="h-3.5 w-3.5 text-accent" />
            <span className="callsign">KM-EMS · v0.1</span>
          </div>
        </div>
      </aside>
    </div>
  ) : null;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden h-10 w-10 -ml-1 shrink-0"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>
      {mounted && drawer ? createPortal(drawer, document.body) : null}
    </>
  );
}
