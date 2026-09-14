"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormContext } from "react-hook-form";
import { AlertTriangle, Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldRow } from "./section-shell";
import type { EventConceptForm } from "@/lib/validation/event-schema";
import type { SheetClient } from "@/lib/google-sheets-types";

/**
 * Commercial-event client details: name, contact, agreed fee, scope.
 * Renders only when Section 2 classification === "COMMERCIAL". The
 * client-name field is a combobox that searches the Sales team's Google
 * Sheet — picking an entry autofills contact person from either the
 * plain ContactPerson field or the first entry of ContactsJSON.
 *
 * If the Sheet fetch fails (no connectivity, missing creds, etc.) the
 * combobox falls back to a plain text input silently — Sales users
 * shouldn't be blocked from creating commercial events by a Sheets
 * outage, and the field can always be typed manually.
 */
export function CommercialClientFields() {
  const { register, setValue, watch } = useFormContext<EventConceptForm>();
  const clientName = watch("s2.clientName");

  return (
    <div className="rounded-lg border p-4 space-y-4 bg-signal-500/[0.03]">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-signal-500" />
        <div className="text-sm font-medium">Commercial client details</div>
      </div>

      <Field label="Client" hint='Start typing to search the Sales team’s client list.' required>
        <ClientCombobox
          value={clientName ?? ""}
          onSelect={(client) => {
            setValue("s2.clientName", client.ClientName, { shouldValidate: true });
            // Fallback chain for contact: explicit ContactPerson column
            // first, then the first entry parsed from ContactsJSON. The
            // JSON is authored manually so it can be malformed — parse
            // safely and ignore on failure.
            const contact = client.ContactPerson || firstContactFromJson(client.ContactsJSON) || "";
            if (contact) {
              setValue("s2.clientContact", contact, { shouldValidate: true });
            }
          }}
          onFreeText={(name) => setValue("s2.clientName", name, { shouldValidate: true })}
        />
      </Field>

      <FieldRow>
        <Field label="Client contact">
          <Input placeholder="Contact name + email / phone" {...register("s2.clientContact")} />
        </Field>
        <Field label="Agreed fee (BND)">
          <Input type="number" min={0} step="0.01" {...register("s2.agreedFeeBND")} />
        </Field>
      </FieldRow>

      <Field label="Scope of services">
        <Textarea rows={3} placeholder="What are we delivering?" {...register("s2.scopeOfServices")} />
      </Field>

      <Field label="Invoice reference (optional)">
        <Input {...register("s2.invoiceRef")} />
      </Field>
    </div>
  );
}

function firstContactFromJson(raw: string): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Array<{ Name?: string; Email?: string }>;
    const first = parsed[0];
    if (!first) return null;
    if (first.Name && first.Email) return `${first.Name} (${first.Email})`;
    return first.Name || first.Email || null;
  } catch {
    return null;
  }
}

/**
 * Type-to-search combobox backed by /api/integrations/clients. Debounced
 * fetch on first focus / open, then in-memory filter as the user types.
 * Selecting an item invokes onSelect with the full SheetClient row;
 * blurring without a selection commits the current text via onFreeText,
 * so partial matches or brand-new clients aren't lost.
 */
function ClientCombobox({
  value,
  onSelect,
  onFreeText,
}: {
  value: string;
  onSelect: (client: SheetClient) => void;
  onFreeText: (raw: string) => void;
}) {
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<SheetClient[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Keep the input in sync when the parent form resets the value
  // (e.g. after a save or classification toggle).
  useEffect(() => setQ(value), [value]);

  // Lazy-load the Sheet clients on first open. Cached client-side; the
  // server endpoint has its own 30s cache too. Failures don't block the
  // user — they can still type free-text.
  async function ensureLoaded() {
    if (clients !== null || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/clients");
      if (!res.ok) throw new Error("Client list unavailable");
      const { clients: list } = (await res.json()) as { clients: SheetClient[] };
      setClients(list);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
      setClients([]); // don't retry on every keypress
    } finally {
      setLoading(false);
    }
  }

  // Close on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const matches = useMemo(() => {
    if (!clients) return [];
    const term = q.trim().toLowerCase();
    const active = clients.filter((c) => c.Status !== "Inactive");
    if (!term) return active.slice(0, 12);
    return active
      .filter(
        (c) =>
          c.ClientName.toLowerCase().includes(term) ||
          c.CompanyName.toLowerCase().includes(term) ||
          c.Email.toLowerCase().includes(term) ||
          c.Industry.toLowerCase().includes(term)
      )
      .slice(0, 12);
  }, [clients, q]);

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          placeholder="Client name (start typing to search…)"
          className="pl-9"
          onFocus={() => {
            setOpen(true);
            void ensureLoaded();
          }}
          onChange={(e) => {
            setQ(e.target.value);
            onFreeText(e.target.value);
            setOpen(true);
            void ensureLoaded();
          }}
        />
      </div>
      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-[280px] overflow-y-auto rounded-md border bg-popover shadow-md">
          {loading && (
            <div className="p-3 text-xs text-muted-foreground text-center">
              Loading clients from Sheet…
            </div>
          )}
          {loadError && (
            <div className="p-3 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                {loadError} — you can still type a client name manually below.
              </span>
            </div>
          )}
          {!loading && !loadError && matches.length === 0 && (
            <div className="p-3 text-xs text-muted-foreground text-center">
              No matches — the client name you typed will be saved as-is.
            </div>
          )}
          {matches.map((c) => (
            <button
              key={c.ClientID}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-secondary flex flex-col gap-0.5 border-b last:border-0"
              onClick={() => {
                setQ(c.ClientName);
                onSelect(c);
                setOpen(false);
              }}
            >
              <span className="font-medium">{c.ClientName}</span>
              <span className="text-[0.7rem] text-muted-foreground">
                {[c.CompanyName, c.Industry, c.Email].filter(Boolean).join(" · ")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
