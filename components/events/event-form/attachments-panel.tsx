"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useEventFormMeta } from "./event-form-context";

interface AttachmentMeta {
  id: string;
  eventId: string;
  filename: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  uploadedByUserId: string;
  uploadedByName: string;
}

/**
 * File attachment panel for Section 2. Only functional in edit mode
 * (attachments are per-event, so we need an event id to attach to);
 * new-event flow shows a hint instead of the picker.
 *
 * Supports both click-to-pick and drag-and-drop, unlimited count and
 * size per the spec. Backed by the in-memory attachment store — see
 * lib/attachments.ts for the caveat about production storage.
 */
export function AttachmentsPanel() {
  const { eventId } = useEventFormMeta();

  if (!eventId) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center space-y-2">
        <FileText className="h-6 w-6 mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Save the event as a draft first, then re-open it to add attachments.
          Files are stored per event, so we need an event ID before uploading.
        </p>
      </div>
    );
  }

  return <AttachmentsPanelInner eventId={eventId} />;
}

function AttachmentsPanelInner({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<AttachmentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}/attachments`, { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load attachments");
      const data = (await res.json()) as { attachments: AttachmentMeta[] };
      setItems(data.attachments);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading(true);
    try {
      const form = new FormData();
      for (const f of list) form.append("files", f);
      const res = await fetch(`/api/events/${eventId}/attachments`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed");
      toast.success(`Uploaded ${list.length} file${list.length === 1 ? "" : "s"}`, {
        position: "bottom-center",
      });
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string, filename: string) {
    if (!confirm(`Delete "${filename}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/events/${eventId}/attachments/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Delete failed");
      toast.success("Attachment deleted", { position: "bottom-center" });
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-3">
      {/* Drop zone + click-to-pick */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length > 0) void upload(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
          dragging ? "border-accent bg-accent/5" : "hover:bg-secondary/40"
        }`}
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading…
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
            <div className="text-sm">
              <span className="font-medium">Click to choose files</span>
              <span className="text-muted-foreground"> or drag and drop</span>
            </div>
            <p className="text-[0.7rem] text-muted-foreground">
              Any file type. No size or count limit.
            </p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) void upload(e.target.files);
            // Reset so re-picking the same filename after a delete still fires onChange.
            e.target.value = "";
          }}
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="text-xs text-muted-foreground text-center py-4">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded-md border p-3 text-xs text-muted-foreground text-center">
          No attachments yet.
        </div>
      ) : (
        <div className="rounded-md border divide-y">
          {items.map((a) => (
            <div key={a.id} className="flex items-center gap-3 p-2">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/api/events/${eventId}/attachments/${a.id}`}
                  className="text-sm font-medium hover:underline break-all"
                >
                  {a.filename}
                </Link>
                <div className="text-[0.68rem] text-muted-foreground">
                  {formatSize(a.size)} · uploaded by {a.uploadedByName} ·{" "}
                  {new Date(a.uploadedAt).toLocaleString("en-GB")}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(a.id, a.filename)}
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <p className="text-[0.68rem] text-muted-foreground">
        Files are stored in-memory for the current server run — they don't
        persist across restarts yet (production storage bucket is a
        separate wiring task).
      </p>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
