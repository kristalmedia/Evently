"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { EventConcept } from "@/lib/types";

export function ExportPDFButton({
  event,
  variant = "outline",
  size = "sm",
  showBudget = true,
}: {
  event: EventConcept;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  showBudget?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const { exportEventPDF } = await import("@/lib/event-pdf");
      await exportEventPDF(event, { includeBudget: showBudget });
      toast.success("PDF downloaded", { position: "bottom-center" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={busy}
      onClick={run}
      className="gap-1.5"
    >
      <FileDown className="h-3.5 w-3.5" />
      <span className="hidden xs:inline sm:inline">
        {busy ? "Preparing…" : "Export PDF"}
      </span>
    </Button>
  );
}
