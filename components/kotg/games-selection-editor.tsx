"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Gamepad2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiPath } from "@/lib/api-path";
import {
  AVAILABLE_GAMES,
  type GameName,
  type GamesSelection,
} from "@/lib/shadow-events-types";

/**
 * Two render modes, picked by the parent via the `canEdit` prop:
 *   - canEdit=true  (SALES_ADMIN)   → full editor: checkboxes, Save
 *                                     Changes button, Delete button.
 *                                     Always rendered, even when no games
 *                                     are selected yet.
 *   - canEdit=false (everyone else) → read-only badge list of currently
 *                                     selected games. The parent
 *                                     (/events/[id]) hides the whole card
 *                                     for non-Sales viewers when nothing
 *                                     is selected, so this path only
 *                                     actually renders with content.
 *
 * Save Changes is only enabled when the local selection differs from
 * the server state. Delete clears the entire selection in one call
 * (equivalent to un-ticking everything then clicking Save).
 */
export function GamesSelectionEditor({
  bookingId,
  initial,
  canEdit,
}: {
  bookingId: string;
  initial: GamesSelection;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<GameName>>(
    () => new Set(initial.selectedGames),
  );
  const [busy, setBusy] = useState(false);

  function toggle(game: GameName) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(game)) next.delete(game);
      else next.add(game);
      return next;
    });
  }

  // Dirty = local set differs from server. Comparing sorted arrays
  // because Set equality in JS is a shallow identity check, not value
  // equality. The AVAILABLE_GAMES-ordered filter guarantees stable
  // comparison regardless of insertion order.
  const serverGames = new Set(initial.selectedGames);
  const dirty =
    selected.size !== serverGames.size ||
    AVAILABLE_GAMES.some((g) => selected.has(g) !== serverGames.has(g));

  async function save() {
    setBusy(true);
    try {
      const selectedGames = AVAILABLE_GAMES.filter((g) => selected.has(g));
      const res = await fetch(apiPath(`/api/kotg/${bookingId}/games`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedGames }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to save");
      }
      const { games } = (await res.json()) as { games: GamesSelection };
      setSelected(new Set(games.selectedGames));
      toast.success(
        selectedGames.length === 0
          ? "Games selection saved (none ticked)"
          : `Saved ${selectedGames.length} game${selectedGames.length === 1 ? "" : "s"}`,
        { position: "bottom-center" },
      );
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (
      initial.selectedGames.length > 0 &&
      !confirm("Clear every selected game for this booking?")
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(apiPath(`/api/kotg/${bookingId}/games`), {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to clear");
      }
      setSelected(new Set());
      toast.success("Games selection cleared", { position: "bottom-center" });
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
          <Gamepad2 className="h-4 w-4 text-accent" />
          Optional Games
          <span className="ml-auto text-[0.65rem] font-mono uppercase tracking-widest text-muted-foreground">
            Sales
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {canEdit ? (
          <>
            <p className="text-xs text-muted-foreground">
              Pick any games planned for this booking. Entirely optional —
              save the page with none ticked if there are no games.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              {AVAILABLE_GAMES.map((game) => {
                const isSelected = selected.has(game);
                return (
                  <label
                    key={game}
                    htmlFor={`game-${game}`}
                    className="flex items-center gap-2 cursor-pointer text-sm py-1"
                  >
                    <Checkbox
                      id={`game-${game}`}
                      checked={isSelected}
                      onCheckedChange={() => toggle(game)}
                      disabled={busy}
                    />
                    <span>{game}</span>
                  </label>
                );
              })}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t">
              {initial.updatedAt && (
                <span className="text-[0.65rem] font-mono text-muted-foreground inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  Last saved {new Date(initial.updatedAt).toLocaleString("en-GB")}
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={clearAll}
                  disabled={busy || selected.size === 0}
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                  Delete
                </Button>
                <Button
                  type="button"
                  variant="accent"
                  size="sm"
                  className="gap-1.5"
                  onClick={save}
                  disabled={busy || !dirty}
                >
                  <Save className="h-3.5 w-3.5" />
                  {busy ? "Saving…" : dirty ? "Save Changes" : "Saved"}
                </Button>
              </div>
            </div>
          </>
        ) : (
          // Read-only view for non-Sales viewers. Parent only renders this
          // component in read-only mode when at least one game is selected,
          // so the empty-list branch here is defensive only.
          <>
            {initial.selectedGames.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No games selected for this booking.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {initial.selectedGames.map((game) => (
                  <span
                    key={game}
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs bg-background"
                  >
                    <Gamepad2 className="h-3 w-3 text-accent" />
                    {game}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
