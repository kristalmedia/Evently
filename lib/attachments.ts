import { makeId } from "./utils";

/**
 * In-memory attachment store. Same "mock scaffold" philosophy as
 * lib/store.ts — files live in a globalThis-anchored Map so HMR and
 * per-route module reloads don't wipe uploads mid-session. Resets on
 * server restart, exactly like the rest of the app's data.
 *
 * Bytes are stored as Buffers inline. Not appropriate for real production
 * — the plan since the earliest scoping conversation has been to swap
 * this for S3 / Azure Blob when a persistent DB lands. Called out again
 * on the /attachments upload UI so users don't assume files persist.
 */

export interface AttachmentMeta {
  id: string;
  eventId: string;
  filename: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  uploadedByUserId: string;
  uploadedByName: string;
}

interface AttachmentRecord extends AttachmentMeta {
  bytes: Buffer;
}

const g = globalThis as unknown as {
  __kristal_attachments?: Map<string, AttachmentRecord>;
};
const store: Map<string, AttachmentRecord> =
  g.__kristal_attachments ?? (g.__kristal_attachments = new Map());

export function listAttachments(eventId: string): AttachmentMeta[] {
  return Array.from(store.values())
    .filter((a) => a.eventId === eventId)
    .sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt))
    .map(({ bytes: _bytes, ...meta }) => meta);
}

export function getAttachment(id: string): AttachmentRecord | null {
  return store.get(id) ?? null;
}

export function saveAttachment(input: {
  eventId: string;
  filename: string;
  contentType: string;
  bytes: Buffer;
  uploadedByUserId: string;
  uploadedByName: string;
}): AttachmentMeta {
  const record: AttachmentRecord = {
    id: makeId("att"),
    eventId: input.eventId,
    filename: input.filename,
    contentType: input.contentType || "application/octet-stream",
    size: input.bytes.byteLength,
    uploadedAt: new Date().toISOString(),
    uploadedByUserId: input.uploadedByUserId,
    uploadedByName: input.uploadedByName,
    bytes: input.bytes,
  };
  store.set(record.id, record);
  const { bytes: _bytes, ...meta } = record;
  return meta;
}

export function deleteAttachment(id: string): AttachmentMeta | null {
  const existing = store.get(id);
  if (!existing) return null;
  store.delete(id);
  const { bytes: _bytes, ...meta } = existing;
  return meta;
}
