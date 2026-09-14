/**
 * Shapes mirroring the Sales team's external Google Sheet — NOT part of
 * KEMS's own domain model (see lib/types.ts). Kept separate deliberately:
 * these are someone else's spreadsheet columns, not our schema, and they
 * can change without warning since the Sheet is manually maintained by
 * the Sales team.
 *
 * Field lists match the header rows as given by the Sales Manager
 * (2026-09-14). If they add/rename/reorder columns, parseSheetRows() in
 * lib/google-sheets.ts reads the live header row every fetch and maps by
 * name — reordering is safe; renaming a column KEMS reads (Category,
 * ClientID, ClientName, etc.) is NOT, and will need a matching update here.
 */

export interface SheetServiceBooking {
  BookingID: string;
  ClientID: string;
  ServiceID: string;
  CustomPackageID: string;
  ServiceName: string;
  Category: string;
  Price: string;
  StartDate: string;
  EndDate: string;
  Status: string;
  Notes: string;
  CreatedBy: string;
  CreatedAt: string;
  UpdatedAt: string;
  DaysOfWeek: string;
  QuotationNumber: string;
  ConfirmationStatus: string;
  AgentEmail: string;
  ContactPersonName: string;
  ContactPersonEmail: string;
  OwnerEmail: string;
  Quantity: string;
}

export interface SheetClient {
  ClientID: string;
  ClientName: string;
  CompanyName: string;
  ContactPerson: string;
  Email: string;
  Phone: string;
  Industry: string;
  Notes: string;
  Status: string;
  CreatedBy: string;
  CreatedAt: string;
  UpdatedAt: string;
  ContactsJSON: string;
}

/** A KOTG service booking joined with its Clients-sheet record. */
export interface KotgBookingWithClient {
  booking: SheetServiceBooking;
  /** Null when the booking's ClientID doesn't match any row in Clients —
   *  surfaced rather than silently dropped, since that's a data-quality
   *  issue worth showing, not hiding. */
  client: SheetClient | null;
}
