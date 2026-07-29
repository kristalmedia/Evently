"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { RoleSwitcher } from "./role-switcher";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { NotificationBell } from "./notification-bell";
import { MobileNav } from "./mobile-nav";

export function Topbar() {
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-2 sm:gap-3 border-b bg-card/80 backdrop-blur px-3 sm:px-4 md:px-6">
      <MobileNav />
      <div className="relative w-full max-w-md hidden sm:block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search events, references, venues…"
          className="pl-9 bg-background"
        />
      </div>

      <div className="ml-auto flex items-center gap-0.5 sm:gap-2 min-w-0">
        {/* Dev role switcher — hidden on very small screens to declutter */}
        <div className="hidden sm:block">
          <RoleSwitcher />
        </div>
        <ThemeToggle />
        {/* Notification bell is duplicated inside the mobile drawer, so hide here below sm */}
        <div className="hidden sm:block">
          <NotificationBell />
        </div>
        <UserMenu />
      </div>
    </header>
  );
}
