import type { CatalogItem, InventoryDept } from "./inventory-types";

/**
 * The pre-populated master item list per inventory department. Matches
 * the source spreadsheet the Ops team already uses — item text is kept
 * verbatim so anyone comparing the app to the printed checklist can spot
 * a mismatch immediately.
 *
 * IDs are deterministic (`inv_<deptslug>_<index>`) rather than random so
 * that a booking's tick record can safely reference them across process
 * restarts (the in-memory store rebuilds from these same seeds on boot,
 * so the same id lands on the same item every time).
 */

const SEED: Record<InventoryDept, string[]> = {
  EVENTS: [
    "Backdrop",
    "Stand banner",
    "Healing chairs",
    "Healing tables",
    "Folding tables",
    "Bean bags",
    "T-shirt rack",
    "T-shirt Hangers",
    "Display stands & foam boards",
    "Tents",
    "Meal allowance",
    "Labour Pick Up Payment",
    "Garbage Bags",
    "Water Bottles",
    "Wet wipes",
    "Internet data (RX)",
    "Internet data (Live Stream)",
    "Internet data (Sales)",
  ],
  SALES: [
    "Official Receipt",
    "Company Chop",
    "Payment Display",
    "KAOB Folder",
    "Tablet for DJ",
    "Portable WiFi",
    "DJ phone",
    "KRISTAL Shopping Bags",
    "Merch",
    "Sales cash float",
  ],
  TECH_OPS: [
    "Setup",
    "DJ desk cover cloth",
    "Trailer cover cloth",
    "Codec",
    "Indoor DJ Table",
    "Power Extension Roll",
    "Box Storage",
    "DJ Calendar",
    "Toolbox",
    "GWM Bag",
    "RCA to XLR/Stereo jack",
    "Seamless display panels",
    "AIO Desktop",
    "TV",
    "Baby Kruiser",
    "Speaker",
    "Apart FM Tuner",
    "FM Antenna",
    "Antenna cable",
    "Bridge IT",
    "Alanheat Mixer",
    "Roving reporter Units",
  ],
  CCM_TECH_OPS: [
    "Graphical assets for display panels",
  ],
  IT: [
    "4G Routers",
    "Cameras and stands",
    "Camera cables",
    "Laptop",
    "Network cables",
    "Network tools",
  ],
  OTHERS: [
    "Dj Standees",
  ],
};

const DEPT_SLUG: Record<InventoryDept, string> = {
  EVENTS: "events",
  SALES: "sales",
  TECH_OPS: "techops",
  CCM_TECH_OPS: "ccmtechops",
  IT: "it",
  OTHERS: "others",
};

/** Deterministic id — see the module doc comment for why not random. */
export function seedItemId(dept: InventoryDept, index: number): string {
  return `inv_${DEPT_SLUG[dept]}_${String(index + 1).padStart(2, "0")}`;
}

/** Build the initial catalog. Called once by the store when it lazy-inits. */
export function buildSeedCatalog(): CatalogItem[] {
  const now = new Date().toISOString();
  const rows: CatalogItem[] = [];
  for (const dept of Object.keys(SEED) as InventoryDept[]) {
    SEED[dept].forEach((name, idx) => {
      rows.push({
        id: seedItemId(dept, idx),
        dept,
        name,
        isSeed: true,
        createdAt: now,
        updatedAt: now,
      });
    });
  }
  return rows;
}
