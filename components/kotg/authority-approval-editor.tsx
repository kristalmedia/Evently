"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  FileText,
  Gavel,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiPath } from "@/lib/api-path";
import type {
  AuthorityApproval,
  AuthorityBody,
  AuthorityDocumentRef,
} from "@/lib/shadow-events-types";

function makeTempId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Human-readable file size for the metadata-only document rows. The
 *  bytes count comes from the browser's File.size on upload; we don't
 *  store the file itself. */
function formatFileSize(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Sales-only Authority Approval editor for one booking. Shows a Yes/No
 * toggle; when Yes, lets the user build a list of "Authority body"
 * entries, each with a name and any number of document references.
 *
 * File uploads here are METADATA-ONLY — the browser's file picker gives
 * us the filename and size, and we send only those two fields plus the
 * uploader + timestamp. No bytes travel to the server. See the long-form
 * comment on AuthorityDocumentRef in lib/shadow-events-types.ts for the
 * rationale and the user-facing implications (nobody can download the
 * file back through Evently; this is a reference list, not a store).
 *
 * The parent `/events/[id]` page already gates rendering of this
 * component on hasRole(user, "SALES_ADMIN"); the API also enforces the
 * same gate independently.
 */
export function AuthorityApprovalEditor({
  bookingId,
  initial,
}: {
  bookingId: string;
  initial: AuthorityApproval;
}) {
  const router = useRouter();
  const [required, setRequired] = useState<boolean>(initial.required);
  const [bodies, setBodies] = useState<AuthorityBody[]>(initial.bodies);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  // Mark the form dirty on any user mutation so the Save button lights
  // up only when there's something to save. Reset on successful save.
  function markDirty() {
    setDirty(true);
  }

  function setRequiredWithGuard(next: boolean) {
    if (!next && bodies.length > 0) {
      // Switching Yes → No doesn't drop the bodies array — Sales can
      // flip back without losing their work. The server also keeps the
      // bodies when required=false (same reasoning), so this is purely
      // a UI nicety.
    }
    setRequired(next);
    markDirty();
  }

  function addBody() {
    setBodies((prev) => [
      ...prev,
      { id: makeTempId("auth"), name: "", documents: [] },
    ]);
    markDirty();
  }

  function removeBody(bodyId: string) {
    setBodies((prev) => prev.filter((b) => b.id !== bodyId));
    markDirty();
  }

  function updateBodyName(bodyId: string, name: string) {
    setBodies((prev) =>
      prev.map((b) => (b.id === bodyId ? { ...b, name } : b)),
    );
    markDirty();
  }

  function addDocumentsFromFileList(bodyId: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    const now = new Date().toISOString();
    // We don't know uploadedByUserId client-side (and shouldn't trust it
    // anyway); server stamps the real value on save. Blank string here is
    // a client placeholder that round-trips harmlessly.
    const newDocs: AuthorityDocumentRef[] = Array.from(files).map((f) => ({
      id: makeTempId("doc"),
      filename: f.name,
      sizeBytes: f.size,
      uploadedAt: now,
      uploadedByUserId: "",
    }));
    setBodies((prev) =>
      prev.map((b) =>
        b.id === bodyId
          ? { ...b, documents: [...b.documents, ...newDocs] }
          : b,
      ),
    );
    markDirty();
  }

  function removeDocument(bodyId: string, docId: string) {
    setBodies((prev) =>
      prev.map((b) =>
        b.id === bodyId
          ? { ...b, documents: b.documents.filter((d) => d.id !== docId) }
          : b,
      ),
    );
    markDirty();
  }

  async function save() {
    // Lightweight client-side validation. If required=true, every body
    // needs at least a name — an empty-name body on save would otherwise
    // persist as a blank row.
    if (required) {
      const anyBlank = bodies.some((b) => !b.name.trim());
      if (anyBlank) {
        toast.error("Every authority body needs a name");
        return;
      }
    }
    setBusy(true);
    try {
      const res = await fetch(
        apiPath(`/api/kotg/${bookingId}/authority-approval`),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ required, bodies }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to save");
      }
      const { authorityApproval } = (await res.json()) as {
        authorityApproval: AuthorityApproval;
      };
      // Re-seed local state from the server's canonical response so new
      // server-stamped doc ids/uploadedAt values replace the temp ones.
      setBodies(authorityApproval.bodies);
      setRequired(authorityApproval.required);
      setDirty(false);
      toast.success("Authority approval saved", { position: "bottom-center" });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Gavel className="h-4 w-4 text-accent" />
          Authority Approval
          <span className="ml-auto text-[0.65rem] font-mono uppercase tracking-widest text-muted-foreground">
            Sales
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Yes/No toggle. Two outline buttons so the active choice is
            visually unambiguous — Radix RadioGroup would also work, but
            the two-button paradigm matches the one used elsewhere in
            the app for binary decisions. */}
        <div className="space-y-2">
          <Label className="text-sm">Require me authoritative approval?</Label>
          <div className="inline-flex rounded-md border overflow-hidden">
            <Button
              type="button"
              variant={!required ? "accent" : "ghost"}
              size="sm"
              className="rounded-none h-8 px-4"
              onClick={() => setRequiredWithGuard(false)}
              disabled={busy}
            >
              No
            </Button>
            <Button
              type="button"
              variant={required ? "accent" : "ghost"}
              size="sm"
              className="rounded-none h-8 px-4 border-l"
              onClick={() => setRequiredWithGuard(true)}
              disabled={busy}
            >
              Yes
            </Button>
          </div>
          {!required && (
            <p className="text-xs text-muted-foreground">
              No authority approval required for this booking.
            </p>
          )}
        </div>

        {required && (
          <>
            <p className="text-xs text-muted-foreground">
              Add one entry per authorising body. Document uploads record the
              filename and size for reference; the file itself isn&apos;t
              stored in Evently — keep the original wherever your team
              normally does.
            </p>

            {bodies.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No authority bodies added yet. Click Add More to start.
              </div>
            ) : (
              <div className="space-y-3">
                {bodies.map((body, idx) => (
                  <div key={body.id} className="rounded-md border p-3 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                        Authority body {idx + 1}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeBody(body.id)}
                        aria-label={`Remove authority body ${idx + 1}`}
                        disabled={busy}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                      </Button>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={`auth-name-${body.id}`} className="text-xs">
                        Authority name
                      </Label>
                      <Input
                        id={`auth-name-${body.id}`}
                        value={body.name}
                        onChange={(e) => updateBodyName(body.id, e.target.value)}
                        placeholder="e.g. MOCYS — Ministry of Culture, Youth & Sports"
                        disabled={busy}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Documents</Label>
                      {body.documents.length === 0 ? (
                        <div className="rounded-md border border-dashed p-3 text-center text-[0.7rem] text-muted-foreground">
                          No documents attached.
                        </div>
                      ) : (
                        <ul className="divide-y rounded-md border">
                          {body.documents.map((doc) => (
                            <li
                              key={doc.id}
                              className="flex items-center gap-2 px-2 py-1.5 text-xs"
                            >
                              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="flex-1 min-w-0 truncate" title={doc.filename}>
                                {doc.filename}
                              </span>
                              <span className="shrink-0 font-mono text-muted-foreground">
                                {formatFileSize(doc.sizeBytes)}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeDocument(body.id, doc.id)}
                                aria-label={`Remove ${doc.filename}`}
                                disabled={busy}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {/* Hidden <input type="file"> fronted by a styled
                          Button — same pattern Radix / shadcn use. Multiple
                          files per click are allowed; the picker clears
                          itself after each selection so re-picking the
                          same file re-fires the change event. */}
                      <div>
                        <input
                          ref={(el) => {
                            fileInputs.current[body.id] = el;
                          }}
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            addDocumentsFromFileList(body.id, e.target.files);
                            // Reset so the same filename can be re-picked.
                            e.target.value = "";
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => fileInputs.current[body.id]?.click()}
                          disabled={busy}
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Upload documents
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={addBody}
                disabled={busy}
              >
                <Plus className="h-3.5 w-3.5" />
                Add More
              </Button>
            </div>
          </>
        )}

        <div className="flex items-center gap-2 pt-2 border-t">
          {initial.updatedAt && (
            <span className="text-[0.65rem] font-mono text-muted-foreground inline-flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              Last saved {new Date(initial.updatedAt).toLocaleString("en-GB")}
            </span>
          )}
          <div className="ml-auto">
            <Button
              type="button"
              variant="accent"
              size="sm"
              className="gap-1.5"
              onClick={save}
              disabled={busy || !dirty}
            >
              <Save className="h-3.5 w-3.5" />
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
