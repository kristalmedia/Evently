# Kristal Event Management System

Internal event concept, approval, and lifecycle management for **Kristal Media Sdn Bhd**.
Built from the KM-EVT-CONCEPT-v1 template — from concept to broadcast, in one workflow.

> **Scaffold status:** starter scaffold. Auth is mocked (cookie-based), data lives
> in an in-memory store, and the 11-section event form is fully wired against Zod
> + React Hook Form. Real Microsoft Entra ID sign-in and a persistent database
> are marked as clear swap-in points below.

---

## Quick start

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Open http://localhost:3000. You'll be redirected to `/login`. Pick a seeded user
and sign in.

Once inside, the dev **Switch user** button in the top bar lets you jump between
roles to test RBAC without signing out. Remove this control (and the endpoint
at `/api/dev/seed-users`) before production.

Requires **Node 18.17+**. Uses Next.js 15 App Router with React 18.

---

## Stack

| Concern              | Choice                                                        |
| -------------------- | ------------------------------------------------------------- |
| Framework            | Next.js 15 (App Router) + React 18 + TypeScript (strict)      |
| Styling / UI         | Tailwind CSS + shadcn/ui primitives + Lucide icons            |
| Fonts                | Geist Sans + Geist Mono                                       |
| Forms                | React Hook Form + Zod                                         |
| Client state         | Zustand (session cache)                                       |
| Server state         | TanStack Query (installed, ready for API-driven pages)        |
| Calendar             | FullCalendar (month / week / day)                             |
| Notifications        | Sonner + persistent notification store                        |
| Theme                | `next-themes` (system / light / dark)                         |
| Exports              | jsPDF + jspdf-autotable (PDF), native (CSV)                   |
| Data                 | In-memory `Map` on `globalThis` (HMR-safe)                    |
| Auth                 | Mock cookie session + invitation token flow                   |

---

## Roles & permissions

| Role             | Description                                                 |
| ---------------- | ----------------------------------------------------------- |
| **IT_ADMIN**     | ⚡ **Unrestricted bypass** — sees and does everything      |
| **EVENT_ADMIN**  | GM Jenny — full event management + sign-off authority       |
| **SALES**        | Can create events + view budgets                            |
| **FINANCE**      | Can view events, budgets, and reports                       |
| **EVENT_STAFF**  | Can create + edit events (no budget access)                 |
| **VIEWER**       | Read-only (dashboard, events, calendar, notifications)      |

### Budget visibility (spec §2C)

Budget fields and financial metrics are **hidden entirely** for anyone outside
of IT Admin, GM Jenny, and Sales. Enforced through the `budget.view` permission
in `lib/permissions.ts` and applied in:

- **Event form** — Section 6 (Budget) is filtered out of the section
  navigation for users without `budget.view`
- **Event detail** — the "Budget summary" card and the commercial "Agreed fee"
  field are conditionally rendered
- **Reports** — server-side row projection omits `estCostBND`, `revenueBND`,
  `netBND` entirely; the client can't render what it doesn't receive

### Sign-off authority (spec §3.11)

Section 11 has **three approver blocks**, and each designated approver can only
see and sign their own — strict approval isolation:

- **Event Lead** — Nabeng (`nabil.mahrub@kristal.media`)
- **Finance Manager** — Rudy (`khairuddin.rosli@kristal.media`)
- **General Manager** — Jenny (`jenny.malaiali@kristal.media`)

IT Admins see all three (override). Non-approvers see all three read-only.
The "Submit / Publish" button also lives inside Section 11 only and requires
one of the three approver identities.

See `canSignOff()` and `approverRoleForUser()` in `lib/permissions.ts`.

### Overtime & meal-allowance formulas (spec §2)

`lib/roster-calc.ts` defines the pure calculation utilities:

- **Overtime**: anything over the standard 8-hour shift is paid at 1.5×
- **Meal allowance eligibility** (min 4h worked):
  - **Weekday**: dinner only, if the shift starts at or after **17:15**
  - **Weekend**: lunch if the shift covers **12:30**, dinner if the shift
    starts at 17:15 or covers 18:00 — both possible

Constants (`STANDARD_SHIFT_HOURS`, `OVERTIME_RATE_MULTIPLIER`,
`MEAL_ALLOWANCE_LUNCH_BND`, `MEAL_ALLOWANCE_DINNER_BND`,
`MEAL_MIN_WORK_HOURS`, `WEEKDAY_DINNER_MIN_HOUR`) are all exported from
`roster-calc.ts` and easy to tune.

Section 5 shows an **Estimated Staffing Budget** widget at the top that
recalculates live from the roster: base pay + overtime + meal allowance. The
same figures flow into Section 6 as read-only auto values.

---

## Seeded users

Sign in via the dropdown on `/login`.

| Department        | User                        | Email                              | Role         |
| ----------------- | --------------------------- | ---------------------------------- | ------------ |
| IT                | Zaki Imani                  | zaki.imani@kristal.media           | IT_ADMIN     |
| IT                | Rashid Karim                | rashid.karim@kristal.media         | IT_ADMIN     |
| IT                | Haziq Eddrusse              | Haziq.edd@kristal.media            | IT_ADMIN     |
| IT                | System Administrator        | it.admin@kristal.media             | IT_ADMIN     |
| General Manager   | Jenny Malai Ali             | jenny.malaiali@kristal.media       | EVENT_ADMIN  |
| Sales             | Wafi Sufri                  | wafi.sufri@kristal.media           | SALES        |
| Sales             | Nabil Hakeem                | nabilhakeem@kristal.media          | SALES        |
| Sales             | Nabil Mahrub                | nabil.mahrub@kristal.media         | SALES        |
| Sales             | Didi Razak                  | didi.razak@kristal.media           | SALES        |
| Sales             | Hazwan Hassan               | hazwan.hassan@kristal.media        | SALES        |
| Finance           | Khairuddin Rosli (Rudy)     | khairuddin.rosli@kristal.media     | FINANCE ★    |
| Finance           | Choon Ling                  | choon.ling@kristal.media           | FINANCE      |
| Finance           | Jariyah Johan               | jariyah.johan@kristal.media        | FINANCE      |
| Finance           | Suriati Hidup               | surie.hidup@kristal.media          | FINANCE      |
| CCM               | 6 members (Dinny, Faadhil…) | see `lib/mock-data.ts`             | VIEWER       |
| Technical         | 9 members (Aiman, Eddy…)    | see `lib/mock-data.ts`             | VIEWER       |
| HR                | Putri Sarabani              | putri.sarabani@kristal.media       | VIEWER       |

★ = sign-off authority

---

## User onboarding pipeline

Every user has a `verificationStatus`:

- **`INVITED`** — created by IT Admin, hasn't set a password yet. Shown with an
  amber "Invited" badge and a "Resend" action in the Users table
- **`VERIFIED`** — has completed `/set-password` with a valid token. Shown with
  an emerald "Verified User" badge

### Flow

1. IT Admin opens **Users** → clicks **Add new user** → fills the form
2. The API creates the user in `INVITED` state with a unique `invitationToken`
3. An invitation URL dialog appears —
   `http://localhost:3000/set-password?token=…` — copy and share it
4. The user visits the link, sets a password (min 8 chars), and is moved to
   `VERIFIED`
5. They can now sign in normally

The set-password page is at `app/(auth)/set-password/`; the API is at
`app/api/auth/set-password/route.ts`.

In production, replace the trivial `Buffer.from(password).toString('base64')`
"hash" with **bcrypt** or **argon2**, and email the invitation link instead of
displaying it in a dialog.

---

## The 11-section event form

Directly mirrors **KM-EVT-CONCEPT-v1**.

| #  | Section                             | Notes                                                       |
| -- | ----------------------------------- | ----------------------------------------------------------- |
| 1  | Event Identification                | Name, ref no, dates, venue, preparer                        |
| 2  | Nature of Event                     | Types (12), Commercial vs Community/CSR, VoG pillars        |
| 3  | Event Concept & Objectives          | Description unlimited length (multi-paragraph)              |
| 4  | Resources & Equipment               | Owned + Hired lines, prefillable from KM standard checklist |
| 5  | Staff & People Required             | Roster slots per shift, live staffing-budget widget         |
| 6  | Financials & Budget                 | 🔒 Overtime + Meal Allowance groups, no revenue field       |
| 7  | Project Management                  | Concept & Approval checklist, +Add Task per phase           |
| 8  | Broadcast & Content Plan            | Web/Mobile Livestream, FM Radio, IG, TikTok + multi-slot    |
| 9  | Risk & Contingency                  | Predefined risk categories multi-select                     |
| 10 | Post-Event Debrief & Evaluation     | Actuals, reach, ratings                                     |
| 11 | Final Approval & Sign-Off           | 🔒 3 isolated approver blocks + Submit button               |

**Submit placement** — the "Submit for approval" button is inside Section 11
only. Save Draft is available in the footer on every section.

**Prefill from templates** — Sections 4, 5, 6, 7, and 9 have "Prefill from KM
template" buttons that seed the standard items from `lib/constants.ts`.

---

## Automatic notifications

When an event is created (`POST /api/events`), a notification is broadcast to
**every active user** — see `broadcastNotification()` in `lib/store.ts`.

Two triggers currently wired:

- `EVENT_CREATED` — when an event is saved as `DRAFT`
- `EVENT_UPDATED` — when an event is submitted (moved to `PENDING_APPROVAL`)

Both notification kinds link back to the event and appear on the
`/notifications` page with unread state. The link and unread indicator update
on next page navigation (no live SSE / socket yet).

---

## Reports & exports

Reports live at `/reports`, gated on `reports.view` (IT Admin, GM, Finance).

- **CSV export** — native browser download, UTF-8 BOM for Excel
- **PDF export** — jsPDF + jspdf-autotable, landscape A4, brand colours

Financial columns (Est. cost, Revenue, Net) are omitted server-side for users
without `budget.view` — they never reach the client, so exports can't leak
them.

---

## Architecture

```
kristal-ems/
├── app/
│   ├── (auth)/
│   │   ├── login/                  ← sign-in with seeded-user dropdown
│   │   └── set-password/           ← invitation-token verification
│   ├── (main)/                     ← protected shell (sidebar + topbar)
│   │   ├── dashboard/
│   │   ├── events/                 ← list, new (11-section form), [id] detail
│   │   ├── calendar/               ← FullCalendar
│   │   ├── users/                  ← IT-only, Add User dialog, Invited badges
│   │   ├── reports/                ← CSV + PDF export
│   │   ├── notifications/
│   │   ├── settings/               ← IT-only stub
│   │   └── profile/
│   ├── api/
│   │   ├── auth/{session,login,logout,set-password}
│   │   ├── users                   ← IT-only, invite flow
│   │   ├── users/invite/resend     ← IT-only, resend token
│   │   ├── events                  ← create broadcasts notification
│   │   └── dev/seed-users          ← ⚠ dev-only, drop before production
│   └── globals.css                 ← Kristal palette + .callsign + .on-air-pill
│
├── components/
│   ├── ui/                         ← shadcn primitives
│   ├── layout/                     ← sidebar, topbar, role-switcher, user-menu
│   ├── shared/                     ← status-badge, priority-badge, on-air pill, callsign
│   ├── dashboard/stat-card.tsx
│   ├── events/                     ← table, calendar, 11-section form
│   ├── users/user-management-table.tsx
│   └── reports/reports-view.tsx    ← CSV + PDF export
│
├── lib/
│   ├── types.ts                    ← all types incl. verification pipeline
│   ├── auth.ts                     ← ⚡ SWAP POINT for real Entra ID
│   ├── permissions.ts              ← IT bypass, canViewBudget, canSignOff
│   ├── store.ts                    ← invite/verify/broadcast helpers
│   ├── mock-data.ts                ← updated user directory
│   ├── constants.ts
│   ├── utils.ts
│   └── validation/event-schema.ts  ← description unlimited length
│
└── stores/session-store.ts
```

---

## Swapping mock auth for Microsoft Entra ID

The whole app depends on **three functions** in `lib/auth.ts`:

```ts
getSession(): Promise<Session | null>
requireSession(): Promise<Session>
signInAsUserId(userId: string): Promise<Session | null>
signOut(): Promise<void>
```

To integrate real Entra ID:

1. Install `next-auth` (v5) and the Azure AD provider, or use MSAL directly.
2. Rewrite the internals of `lib/auth.ts` — return the same `Session` shape.
3. In `getSession`, resolve the signed-in email against `getUserByEmail` in
   `lib/store.ts` — or swap that helper for a real database call.
4. Delete `POST /api/auth/login`, delete `RoleSwitcher` + `/api/dev/seed-users`.
5. Replace the invitation flow with your provider's user-provisioning API, or
   keep it for local password fallback.
6. Update `.env.local` with `AZURE_AD_CLIENT_ID`, `AZURE_AD_TENANT_ID`,
   `AZURE_AD_CLIENT_SECRET`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`.

The rest of the app — pages, permissions, form, API routes — needs zero changes.

---

## Scripts

```bash
npm run dev        # dev server (http://localhost:3000)
npm run build      # production build
npm start          # run production build
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
```
