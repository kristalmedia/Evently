import { cn } from "@/lib/utils";

/**
 * Owner of a form section — drives the color coding so users can see at a
 * glance which department a section belongs to.
 *
 *   sales   → Sales Admin + CCM Admin (General, Additional, Broadcast, PM, Risk)
 *   manager → Managers (Staff)
 *   finance → Finance Lead / Putri (Financial)
 *   gm      → General Manager / Jenny (Sign-off)
 */
export type SectionOwner = "sales" | "manager" | "finance" | "gm";

export const OWNER_META: Record<
  SectionOwner,
  { label: string; badgeBg: string; badgeText: string; leftBorder: string; dot: string; tint: string }
> = {
  sales: {
    label: "Sales",
    badgeBg: "bg-signal-500",
    badgeText: "text-white",
    leftBorder: "border-l-4 border-l-signal-500",
    dot: "bg-signal-500",
    tint: "bg-signal-500/[0.03]",
  },
  manager: {
    label: "Managers",
    badgeBg: "bg-emerald-600",
    badgeText: "text-white",
    leftBorder: "border-l-4 border-l-emerald-600",
    dot: "bg-emerald-600",
    tint: "bg-emerald-500/[0.04]",
  },
  finance: {
    label: "Finance Lead",
    badgeBg: "bg-amber-500",
    badgeText: "text-white",
    leftBorder: "border-l-4 border-l-amber-500",
    dot: "bg-amber-500",
    tint: "bg-amber-500/[0.04]",
  },
  gm: {
    label: "GM · Jenny",
    badgeBg: "bg-violet-600",
    badgeText: "text-white",
    leftBorder: "border-l-4 border-l-violet-600",
    dot: "bg-violet-600",
    tint: "bg-violet-500/[0.04]",
  },
};

export function SectionShell({
  index,
  title,
  description,
  owner = "sales",
  children,
  className,
}: {
  index: number;
  title: string;
  description?: string;
  owner?: SectionOwner;
  children: React.ReactNode;
  className?: string;
}) {
  const meta = OWNER_META[owner];
  return (
    <section
      className={cn(
        "space-y-6 rounded-r-lg pl-4 -ml-4 py-2",
        meta.leftBorder,
        meta.tint,
        className
      )}
    >
      <header className="space-y-1 pb-2 border-b">
        <div className="flex items-center gap-2">
          <div className="callsign">Section {String(index).padStart(2, "0")}</div>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.6rem] font-mono font-semibold uppercase tracking-wider",
              meta.badgeBg,
              meta.badgeText
            )}
            title={`Owned by ${meta.label}`}
          >
            {meta.label}
          </span>
        </div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground max-w-2xl">{description}</p>
        )}
      </header>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

export function FieldRow({
  children,
  className,
  cols = 2,
}: {
  children: React.ReactNode;
  className?: string;
  cols?: 1 | 2 | 3;
}) {
  const grid = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  }[cols];
  return <div className={cn("grid gap-4", grid, className)}>{children}</div>;
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium flex items-center gap-1">
        {label}
        {required && <span className="text-destructive">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
