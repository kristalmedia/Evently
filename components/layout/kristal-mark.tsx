import { cn } from "@/lib/utils";

export function KristalMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("h-6 w-6 text-accent", className)}
      fill="none"
      aria-hidden="true"
    >
      {/* signal tower */}
      <path
        d="M16 6v22"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
      />
      <path
        d="M12 28h8M13 26h6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="square"
      />
      {/* concentric transmission arcs */}
      <path
        d="M9 12a10 10 0 0 1 14 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M6 9a14 14 0 0 1 20 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M12 15a6 6 0 0 1 8 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="16" cy="17" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function KristalWordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <KristalMark />
      <div className="leading-none">
        <div className="text-[0.6rem] font-mono uppercase tracking-[0.22em] text-muted-foreground">
          Kristal Media
        </div>
        <div className="text-sm font-semibold tracking-tight">
          Event Management
        </div>
      </div>
    </div>
  );
}
