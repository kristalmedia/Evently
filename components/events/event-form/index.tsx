"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionNav, type SectionDef } from "./section-nav";
import { Section1 } from "./section-01-identification";
import { Section2 } from "./section-02-nature";
import { Section3 } from "./section-08-broadcast";
import { Section4 } from "./section-05-staff";
import { Section5 } from "./section-06-budget";
import { Section6 } from "./section-07-timeline";
import { Section7 } from "./section-09-risk";
import { Section8 } from "./section-11-signoff";

import {
  eventConceptSchema,
  type EventConceptForm,
} from "@/lib/validation/event-schema";
import { canViewBudget, editableSectionKeysForEvent } from "@/lib/permissions";
import { generateReferenceKey } from "@/lib/constants";
import { useSessionStore } from "@/stores/session-store";

const ALL_SECTIONS: SectionDef[] = [
  { key: "s1", index: 1, title: "General Info", subtitle: "Title, description, venue, dates", owner: "sales" },
  { key: "s2", index: 2, title: "Additional Info", subtitle: "Equipment, attachments, notes", owner: "sales" },
  { key: "s3", index: 3, title: "Broadcast", subtitle: "Schedule & platforms", owner: "sales" },
  { key: "s4", index: 4, title: "Staff", subtitle: "Roster + auto budget", owner: "manager" },
  { key: "s5", index: 5, title: "Financials", subtitle: "Budget & costs", owner: "finance" },
  { key: "s6", index: 6, title: "Project Management", subtitle: "Tasks by phase", owner: "sales" },
  { key: "s7", index: 7, title: "Risk", subtitle: "Contingencies", owner: "sales" },
  { key: "s8", index: 8, title: "Sign-off", subtitle: "Approval & submit", owner: "gm" },
];

const SECTION_COMPONENTS: Record<string, React.ComponentType> = {
  s1: Section1,
  s2: Section2,
  s3: Section3,
  s4: Section4,
  s5: Section5,
  s6: Section6,
  s7: Section7,
  s8: Section8,
};

const emptyDefaults: EventConceptForm = {
  status: "DRAFT",
  priority: "MEDIUM",
  s1: {
    eventName: "",
    eventRefNo: generateReferenceKey(),
    startDate: "",
    endDate: "",
    venue: "",
    conceptPreparedBy: "",
    conceptDate: new Date().toISOString().slice(0, 10),
  },
  s2: { types: [], classification: "COMMUNITY_CSR" },
  s3: {
    description: "",
    objectives: [],
    targetAudience: "",
    successMetrics: "",
    brandLink: "",
  },
  s4: { equipment: [] },
  s5: { staff: [] },
  s6: { costs: [] },
  s7: { tasks: [] },
  s8: {
    liveBroadcast: "TBC",
    platforms: [],
    schedule: [],
    podcastRecording: false,
    socialPlatforms: [],
    hashtags: [],
  },
  s9: { risks: [] },
  s10: {},
  s11: { entries: [] },
};

export function EventForm({
  initialEvent,
  editMode = false,
}: {
  initialEvent?: EventConceptForm & { id?: string };
  editMode?: boolean;
} = {}) {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const showBudget = canViewBudget(user);

  // Role-and-status-aware section filter.
  //   - Sales / CCM Admin never see Staff (s4) or Financial (s5) at any stage.
  //   - Manager sees Staff (s4) only when event.status === STAFFING_IN_PROGRESS.
  //   - Finance Lead sees Financial (s5) only when status === FINANCIAL_REVIEW.
  //   - Super Admin sees everything.
  // For a brand-new event there is no event yet, so we synthesize a DRAFT
  // status — matches the initial state the form saves as.
  const editableKeys = editableSectionKeysForEvent(
    user,
    initialEvent ?? { status: "DRAFT" }
  );
  const sections = useMemo(() => {
    let list =
      editableKeys === "all"
        ? ALL_SECTIONS
        : ALL_SECTIONS.filter((s) => editableKeys.includes(s.key));
    // Extra defensive: strip s5 for anyone without budget.view even if the
    // status-aware filter above would let it through.
    if (!showBudget) list = list.filter((s) => s.key !== "s5");
    return list;
  }, [showBudget, editableKeys]);

  const [active, setActive] = useState(sections[0].key);
  const [saving, setSaving] = useState(false);
  /** Progressive step-locking (spec §6A): once a section passes validation, unlock the next one. */
  // In edit mode, unlock everything — Nabeng can jump straight to any section
  // to fix problems without walking the whole form again.
  const [unlockedThrough, setUnlockedThrough] = useState<number>(editMode ? 999 : 0);

  const methods = useForm<EventConceptForm>({
    resolver: zodResolver(eventConceptSchema),
    defaultValues: initialEvent ?? emptyDefaults,
    mode: "onBlur",
  });

  // Fetch the next unique KEMS-EVT-#### ref key from the server on mount — but
  // only for brand new events. In edit mode the ref is fixed.
  useEffect(() => {
    if (editMode) return;
    let cancelled = false;
    fetch("/api/events/next-ref")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.ref) methods.setValue("s1.eventRefNo", d.ref);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeIndex = sections.findIndex((s) => s.key === active);
  const isLast = activeIndex === sections.length - 1;

  const { formState, trigger } = methods;
  const completed: Record<string, boolean> = sections.reduce((acc, s, i) => {
    const hasError = Boolean((formState.errors as Record<string, unknown>)[s.key]);
    acc[s.key] = i <= unlockedThrough && !hasError && i < activeIndex;
    return acc;
  }, {} as Record<string, boolean>);

  // Only sections up to and including unlockedThrough+1 are navigable
  function canNavigateTo(index: number): boolean {
    return index <= unlockedThrough + 1;
  }

  async function attemptAdvance() {
    const currentKey = sections[activeIndex].key as keyof EventConceptForm;
    // Trigger validation just for the current section
    const valid = await trigger(currentKey);
    if (!valid) {
      toast.error("Please fix the highlighted fields before continuing.");
      return;
    }
    setUnlockedThrough((v) => Math.max(v, activeIndex + 1));
    setActive(sections[activeIndex + 1].key);
  }

  const ActiveComponent = SECTION_COMPONENTS[active];

  // Save draft — bypasses validation so partial state can persist at any step.
  // In edit mode this PATCHes the existing event instead of creating a new one.
  async function saveDraft() {
    setSaving(true);
    try {
      const values = methods.getValues();
      const eventId = initialEvent?.id;
      const isEdit = editMode && !!eventId;
      const payload = {
        ...values,
        // Preserve the event's current status when editing (unless it was draft;
        // in that case it stays draft). Only new events default to DRAFT here.
        ...(isEdit ? {} : { status: "DRAFT" }),
        priority: values.priority ?? "MEDIUM",
      };
      const res = await fetch(isEdit ? `/api/events/${eventId}` : "/api/events", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const { event } = await res.json();
      toast.success(isEdit ? "Changes saved" : "Draft successfully saved", {
        position: "bottom-center",
        style: {
          background: "hsl(142 71% 45% / 0.95)",
          color: "white",
          border: "1px solid hsl(142 71% 35%)",
        },
      });
      router.push(`/events/${event.id}`);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormProvider {...methods}>
      {/* Sticky Save-Draft header — visible on every section */}
      <div className="sticky top-16 z-20 -mx-3 sm:-mx-4 md:-mx-8 mb-6 border-b bg-background/85 backdrop-blur px-3 sm:px-4 md:px-8 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="callsign flex items-center gap-2">
              {editMode ? (
                <span className="rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wider">
                  EDIT MODE
                </span>
              ) : (
                "Event editor"
              )}
            </div>
            <div className="text-sm font-medium truncate">
              {methods.watch("s1.eventName") || "Untitled event"}
              <span className="text-muted-foreground text-xs font-mono ml-2 hidden sm:inline">
                · {methods.watch("s1.eventRefNo")}
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="accent"
            size="sm"
            disabled={saving}
            onClick={saveDraft}
            className="gap-1.5 shrink-0"
          >
            <Save className="h-3.5 w-3.5" />
            <span className="hidden xs:inline sm:inline">
              {saving ? "Saving…" : editMode ? "Save changes" : "Save draft"}
            </span>
            <span className="sm:hidden">{saving ? "…" : "Save"}</span>
          </Button>
        </div>
      </div>

      {/* Restricted-access banner — any role narrower than SUPER_ADMIN.
          Fires on the "new event" flow too so Sales/CCM users know why their
          Staff / Financial sections are missing from the nav. */}
      {editableKeys !== "all" && editableKeys.length > 0 && (
        <div className="rounded-lg border border-signal-400/30 bg-signal-400/5 p-3 mb-4 text-xs flex items-start gap-2">
          <span className="rounded bg-signal-400/15 text-signal-400 px-1.5 py-0.5 font-mono uppercase tracking-wider text-[0.65rem] shrink-0 mt-0.5">
            Restricted
          </span>
          <div>
            Your role has edit access to a subset of sections only. Non-editable
            sections are hidden from the nav below and can still be viewed on
            the event detail page.
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="lg:sticky lg:top-36 lg:self-start">
          <Card className="p-4">
            <SectionNav
              sections={sections}
              activeKey={active}
              completed={completed}
              locked={sections.reduce((acc, s, i) => {
                acc[s.key] = !canNavigateTo(i);
                return acc;
              }, {} as Record<string, boolean>)}
              onSelect={(key) => {
                const idx = sections.findIndex((s) => s.key === key);
                if (canNavigateTo(idx)) setActive(key);
                else toast.error("Complete the current section first.");
              }}
            />
          </Card>
          <p className="mt-3 text-[0.68rem] text-muted-foreground px-1">
            Progressive step-locking is on — each section must pass validation
            before the next unlocks.
          </p>
        </aside>

        <div className="space-y-6 min-w-0">
          <Card className="p-6 lg:p-8">
            {ActiveComponent && <ActiveComponent />}
          </Card>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={activeIndex === 0}
                onClick={() => setActive(sections[activeIndex - 1].key)}
                className="gap-1"
              >
                <ArrowLeft className="h-4 w-4" /> Previous
              </Button>
              <Button
                type="button"
                variant="accent"
                disabled={isLast}
                onClick={attemptAdvance}
                className="gap-1"
              >
                Validate & continue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>

            {!isLast && (
              <p className="text-xs text-muted-foreground">
                Submit is on the final <span className="font-medium">Sign-off</span> section.
              </p>
            )}
          </div>
        </div>
      </div>
    </FormProvider>
  );
}
