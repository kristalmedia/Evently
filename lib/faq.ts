/**
 * Help & FAQ content. Placeholder entries — grounded in the app's actual
 * features (roles, approval chain, KOTG bookings, sign-in, etc.) so the
 * page is immediately useful. Swap in your real Q&A when authoring.
 *
 * Sections group related questions on the /help page; entries within a
 * section render as an accordion.
 */

export interface FaqEntry {
  q: string;
  a: string;
}

export interface FaqSection {
  title: string;
  entries: FaqEntry[];
}

export const FAQ_SECTIONS: FaqSection[] = [
  {
    title: "Getting started",
    entries: [
      {
        q: "How do I sign in?",
        a: "Two options at /login. In production, click 'Sign in with Microsoft' and use your @kristal.media Microsoft account — the org's Entra ID handles auth, no separate password. For local demos or evaluation there's a 'Test environment' block that lets you pick any seeded user without a password. If Sign in with Microsoft fails with an AADSTS error, IT needs to check the Azure app registration.",
      },
      {
        q: "The dashboard is empty when I first sign in. What now?",
        a: "You're seeing seed data based on your role's view permissions. Sales Admins see events they can create. Viewers see approved / published events. If it's genuinely empty and you expected content, ask whoever exported the Sales sheet or seeded the org to confirm your role has 'events.view' permission (visible on your Profile page).",
      },
      {
        q: "What's the 'onboarding tutorial' popup?",
        a: "The welcome tour that fires on your first login. Click 'Don't show again' if you want it permanently dismissed — the preference is saved to your account, not to your browser, so it survives sign-outs and device changes.",
      },
    ],
  },
  {
    title: "Roles & permissions",
    entries: [
      {
        q: "What roles are there?",
        a: "Super Admin (IT admins — full bypass), Sales Admin (creates events, no Staff or Financial editing), CCM Admin (mirror of Sales Admin, scoped to CCM department), Manager (owns the Staff section, unlocks after approval), Finance Lead (Putri — exclusive Financial editor), Financial Admin (Rudy — 2nd approver in the chain), HR + Viewer (read-only). Every user has a primary role and optionally a secondary role — permission checks union the two.",
      },
      {
        q: "Why can't I see the Staff section on the new-event form?",
        a: "Sales and CCM Admin roles never see Staff (or Financial) in the section nav — Managers fill Staff after Jenny approves, and the Finance Lead fills Financial. You'll still see the section on the event's detail page once someone fills it.",
      },
      {
        q: "How do I add someone with two roles?",
        a: "Super Admins can. Open /users, click the edit pencil on the target user, and the row shows two dropdowns: primary role (required) and secondary role (optional, '+ Secondary role'). Permission checks OR the two roles — more permissive wins.",
      },
    ],
  },
  {
    title: "Approval workflow",
    entries: [
      {
        q: "How does the approval chain work for a free (community) event?",
        a: "Draft → Nabeng (First Approver) submits → Rudy (Second Approver) approves → Jenny (Final Approver) approves. Jenny's approval fires the org-wide 'new event approved' email + in-app broadcast, transitions the event to STAFFING_IN_PROGRESS (Managers get notified to fill roster), then FINANCIAL_REVIEW (Putri fills budget), then PUBLISHED.",
      },
      {
        q: "How does a paid (commercial) event work?",
        a: "It skips the approval chain entirely. Anyone with events.create submits it directly — the event lands in STAFFING_IN_PROGRESS immediately, org-wide announcement fires immediately, then the same Manager → Finance Lead post-approval flow applies. Set the classification in Section 2 to 'Commercial / Paid' to enable this.",
      },
      {
        q: "Why did my Deny button fail before?",
        a: "There was a state-machine bug where denying an event that wasn't currently at PENDING_APPROVAL or PENDING_FINAL_APPROVAL threw a 500. Fixed in an earlier commit — you now get a clear 409 with the current status if you try to deny at the wrong stage.",
      },
    ],
  },
  {
    title: "KOTG bookings integration",
    entries: [
      {
        q: "What's the KOTG Bookings page under Event Management?",
        a: "Live sync from the Sales team's external Google Sheet (ServiceBookings + Clients + CustomPackages tabs). Filters rows where Category = 'KRISTAL On The Go' and joins each booking to its client + custom package. Read-only, refreshes on load (30s cache) or via the Refresh button.",
      },
      {
        q: "Why do some rows show 'Unmatched' in amber?",
        a: "That booking's ClientID (or CustomPackageID) doesn't exist in the corresponding sheet. It's a data-quality signal — the sales team probably deleted or renamed a client record that a booking still references. Surface it, don't hide it.",
      },
      {
        q: "How do I refresh the Sheet data manually?",
        a: "Refresh button on /sales/kotg-bookings bypasses the 30-second cache and fetches directly from Google. If it still looks stale, the Sheet itself is the source of truth — check whether the Sales team actually saved their changes.",
      },
    ],
  },
  {
    title: "Notifications & emails",
    entries: [
      {
        q: "Where do notifications go?",
        a: "In-app: /notifications, with an unread count on the bell in the top bar. Toast: fired live via the poller while you're using the app. Email: when SMTP is configured in .env.local, real emails go out for the 'event approved' announcement + user invitations. If SMTP isn't configured, the send is honestly reported as simulated (see /settings for status).",
      },
      {
        q: "Why isn't email working?",
        a: "SMTP env vars aren't configured, or the server hasn't been restarted since they were added. Check /settings — if the panel says 'Simulated', the transport is not live. IT needs to set EMAIL_SMTP_HOST / PORT / USER / PASS / FROM in .env.local and restart.",
      },
    ],
  },
  {
    title: "Calendar & search",
    entries: [
      {
        q: "How do I filter the calendar to just one category?",
        a: "Click the category chip above the calendar. Multi-select — click more to widen the filter, click 'Clear' when you want to reset.",
      },
      {
        q: "What happens when I hover / click an event on the calendar?",
        a: "Hover: mini popover with title, dates, venue, description snippet, and a 'Show more' link. Click a day cell: modal listing every event on that day. Click an event's 'Show more' or 'Open event' to jump to the full detail page.",
      },
    ],
  },
];
