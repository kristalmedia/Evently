"use client";

import { createContext, useContext } from "react";

/**
 * Provides fixed metadata about the event being edited (id, whether we're
 * in edit vs. new mode) down through the section components — react-hook-
 * form only tracks the form values themselves, not these outer knobs.
 *
 * `eventId` is null when creating a new event (no id has been assigned yet).
 * Consumers that need a saved event to work against — attachments,
 * anything hitting an event-scoped endpoint — should skip / render an
 * empty state when it's null.
 */
export interface EventFormMeta {
  eventId: string | null;
  editMode: boolean;
}

const Ctx = createContext<EventFormMeta>({ eventId: null, editMode: false });

export const EventFormMetaProvider = Ctx.Provider;

export function useEventFormMeta(): EventFormMeta {
  return useContext(Ctx);
}
