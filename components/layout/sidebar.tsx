"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  ListChecks,
  Users2,
  BarChart3,
  Bell,
  Settings,
  UserCircle2,
  Radio,
  Sheet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { can } from "@/lib/permissions";
import { useSessionStore } from "@/stores/session-store";
import { KristalWordmark } from "./kristal-mark";
import type { Permission } from "@/lib/types";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  perm: Permission;
  section?: string;
}

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, perm: "dashboard.view" },
  { label: "Events", href: "/events", icon: ListChecks, perm: "events.view", section: "Event Management" },
  { label: "Calendar", href: "/calendar", icon: CalendarDays, perm: "calendar.view", section: "Event Management" },
  { label: "KOTG Bookings", href: "/sales/kotg-bookings", icon: Sheet, perm: "events.create", section: "Event Management" },
  { label: "Users", href: "/users", icon: Users2, perm: "users.manage", section: "Administration" },
  { label: "Reports", href: "/reports", icon: BarChart3, perm: "reports.view" },
  { label: "Notifications", href: "/notifications", icon: Bell, perm: "notifications.view" },
  { label: "Settings", href: "/settings", icon: Settings, perm: "system.settings", section: "Administration" },
  { label: "Profile", href: "/profile", icon: UserCircle2, perm: "dashboard.view" },
];

export function Sidebar() {
  const pathname = usePathname();
  const user = useSessionStore((s) => s.user);
  if (!user) return null;

  const visible = NAV.filter((n) => can(user, n.perm));
  const grouped = visible.reduce<Record<string, NavItem[]>>((acc, item) => {
    const key = item.section ?? "General";
    (acc[key] ??= []).push(item);
    return acc;
  }, {});

  return (
    <>
      <aside className="hidden md:flex h-screen w-64 shrink-0 flex-col border-r bg-card sticky top-0">
        <div className="flex items-center h-16 px-5 border-b">
          <Link href="/dashboard" className="flex items-center">
            <KristalWordmark />
          </Link>
        </div>
        <SidebarNav pathname={pathname} grouped={grouped} />
        <div className="border-t p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Radio className="h-3.5 w-3.5 text-accent" />
            <span className="callsign">KM-EMS · v0.1</span>
          </div>
        </div>
      </aside>
    </>
  );
}

/** Nav content, extracted so mobile drawer can reuse it. */
export function SidebarNav({
  pathname,
  grouped,
  onNavigate,
  dense = false,
}: {
  pathname: string;
  grouped: Record<string, NavItem[]>;
  onNavigate?: () => void;
  /** Compact spacing — used by the mobile drawer to avoid vertical scroll. */
  dense?: boolean;
}) {
  return (
    <nav
      className={cn(
        "flex-1 overflow-y-auto px-2",
        dense ? "py-2 space-y-3" : "py-4 px-3 space-y-6"
      )}
    >
      {Object.entries(grouped).map(([section, items]) => (
        <div key={section} className="space-y-0.5">
          <div
            className={cn(
              "callsign",
              dense ? "px-2 pb-1" : "px-3 pb-1.5"
            )}
          >
            {section}
          </div>
          {items.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-md text-sm transition-colors",
                  dense ? "px-2 py-1.5" : "px-3 py-2",
                  active
                    ? "bg-accent/10 text-accent font-medium"
                    : "text-foreground/75 hover:bg-secondary hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/**
 * Client-side hook exposing the same nav data as the sidebar — used by the
 * mobile drawer so the two views stay in sync.
 */
export function useSidebarData() {
  const pathname = usePathname();
  const user = useSessionStore((s) => s.user);
  const items = NAV.filter((i) => can(user, i.perm));
  const grouped: Record<string, NavItem[]> = items.reduce((acc, item) => {
    const key = item.section ?? "Main";
    (acc[key] ??= []).push(item);
    return acc;
  }, {} as Record<string, NavItem[]>);
  return { pathname, grouped };
}
