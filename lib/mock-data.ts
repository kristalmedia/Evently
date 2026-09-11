import type { EventConcept, EventVenue, User } from "./types";

const NOW = new Date().toISOString();

// Helper — build a User with sensible defaults for seeded (already verified) accounts
function u(input: Omit<User, "status" | "createdAt" | "verificationStatus" | "verifiedAt">): User {
  return {
    ...input,
    status: "active",
    verificationStatus: "VERIFIED",
    verifiedAt: NOW,
    createdAt: NOW,
  };
}

export const SEED_USERS: User[] = [
  // ─── IT — IT Administrator (unrestricted bypass) ─────────────────────────
  u({ id: "u_it01", fullName: "Zaki Imani", email: "zaki.imani@kristal.media", department: "IT", role: "SUPER_ADMIN" }),
  u({ id: "u_it02", fullName: "Rashid Karim", email: "rashid.karim@kristal.media", department: "IT", role: "SUPER_ADMIN" }),
  u({ id: "u_it03", fullName: "Haziq Eddrusse", email: "Haziq.edd@kristal.media", department: "IT", role: "SUPER_ADMIN" }),
  u({ id: "u_it04", fullName: "System Administrator", email: "it.admin@kristal.media", department: "IT", jobTitle: "System Admin", role: "SUPER_ADMIN" }),

  // ─── General Manager — Event Administrator / Sign-Off Authority ──────────
  u({ id: "u_gm01", fullName: "Jenny Malai Ali", email: "jenny.malaiali@kristal.media", department: "General Manager", jobTitle: "General Manager", role: "MANAGER" }),

  // ─── Sales — Can create events & view budgets ────────────────────────────
  u({ id: "u_s01", fullName: "Wafi Sufri", email: "wafi.sufri@kristal.media", department: "Sales", role: "SALES_ADMIN" }),
  u({ id: "u_s02", fullName: "Nabil Hakeem", email: "nabilhakeem@kristal.media", department: "Sales", role: "SALES_ADMIN" }),
  u({ id: "u_s03", fullName: "Nabil Mahrub", email: "nabil.mahrub@kristal.media", department: "Sales", role: "SALES_ADMIN" }),
  u({ id: "u_s04", fullName: "Didi Razak", email: "didi.razak@kristal.media", department: "Sales", role: "SALES_ADMIN" }),
  u({ id: "u_s05", fullName: "Hazwan Hassan", email: "hazwan.hassan@kristal.media", department: "Sales", role: "SALES_ADMIN" }),

  // ─── Finance ─────────────────────────────────────────────────────────────
  u({ id: "u_f01", fullName: "Khairuddin Rosli", email: "khairuddin.rosli@kristal.media", department: "Finance", jobTitle: "Sign-Off Authority", role: "FINANCIAL_ADMIN" }),
  u({ id: "u_f02", fullName: "Choon Ling", email: "choon.ling@kristal.media", department: "Finance", role: "FINANCIAL_ADMIN" }),
  u({ id: "u_f03", fullName: "Jariyah Johan", email: "jariyah.johan@kristal.media", department: "Finance", role: "FINANCIAL_ADMIN" }),
  u({ id: "u_f04", fullName: "Suriati Hidup", email: "surie.hidup@kristal.media", department: "Finance", role: "FINANCIAL_ADMIN" }),

  // ─── CCM — Viewer ────────────────────────────────────────────────────────
  u({ id: "u_c01", fullName: "Dinny Gapar", email: "dinny-gapar@kristal.media", department: "CCM", role: "VIEWER" }),
  u({ id: "u_c02", fullName: "Faadhil Aiman", email: "faadhil.aiman@kristal.media", department: "CCM", role: "VIEWER" }),
  u({ id: "u_c03", fullName: "Isma Faiq Ismail", email: "ismafaiq.ismail@kristal.media", department: "CCM", role: "VIEWER" }),
  u({ id: "u_c04", fullName: "Azim Mohamad", email: "azim.mohamad@kristal.media", department: "CCM", role: "VIEWER" }),
  u({ id: "u_c05", fullName: "Faiq Ali", email: "faiq.ali@kristal.media", department: "CCM", role: "VIEWER" }),
  u({ id: "u_c06", fullName: "Yaya Halim", email: "yaya.halim@kristal.media", department: "CCM", role: "VIEWER" }),

  // ─── Technical — Viewer ──────────────────────────────────────────────────
  u({ id: "u_t01", fullName: "Aiman Bahar", email: "aiman.bahar@kristal.media", department: "Technical", role: "VIEWER" }),
  u({ id: "u_t02", fullName: "Eddy Busu", email: "eddy.busu@kristal.media", department: "Technical", role: "VIEWER" }),
  u({ id: "u_t03", fullName: "Faris Adnan", email: "faris.adnan@kristal.media", department: "Technical", role: "VIEWER" }),
  u({ id: "u_t04", fullName: "Hafiz Salim", email: "hafiz.salim@kristal.media", department: "Technical", role: "VIEWER" }),
  u({ id: "u_t05", fullName: "Hj Zikry Anafiah", email: "zikri.anafiah@kristal.media", department: "Technical", role: "VIEWER" }),
  u({ id: "u_t06", fullName: "Shaming Hj Kalong", email: "shaming.hjkalong@kristal.media", department: "Technical", role: "VIEWER" }),
  u({ id: "u_t07", fullName: "Izz Yakop", email: "Izz.Yakop@kristal.media", department: "Technical", role: "VIEWER" }),
  u({ id: "u_t08", fullName: "Rafaiee Omar", email: "rafaiee.omar@kristal.media", department: "Technical", role: "VIEWER" }),
  u({ id: "u_t09", fullName: "Qawi Zainal Ariffin", email: "qawi.zainalariffin@kristal.media", department: "Technical", role: "VIEWER" }),

  // ─── HR — Viewer ─────────────────────────────────────────────────────────
  // Putri — Finance Lead. Exclusive editor of Section 5 (Financial) during
  // the FINANCIAL_REVIEW stage; global read across every event.
  u({ id: "u_h01", fullName: "Putri Sarabani", email: "putri.sarabani@kristal.media", department: "HR", jobTitle: "Finance Lead", role: "FINANCE_LEAD" }),

  // ─── CCM Admin — mirror of Sales Admin, scoped to CCM department ─────────
  u({ id: "u_cadm01", fullName: "Faadhil Aiman", email: "faadhil.aiman.admin@kristal.media", department: "CCM", jobTitle: "CCM Admin", role: "CCM_ADMIN" }),
];

export const SEED_VENUES: EventVenue[] = [
  { id: "ven_kfmstudio", name: "KristalFM Studio", address: "Kristal Media HQ, Bandar Seri Begawan", capacity: 50 },
  { id: "ven_mall", name: "The Mall Gadong — Atrium", address: "Gadong, BSB", capacity: 2000 },
  { id: "ven_icc", name: "ICC Berakas", address: "Berakas, Brunei-Muara", capacity: 5000 },
  { id: "ven_taman", name: "Taman Haji Sir Muda Omar 'Ali Saifuddien", address: "Bandar Seri Begawan", capacity: 3000 },
  { id: "ven_hua_ho", name: "Hua Ho Manggis Complex", address: "Manggis, BSB", capacity: 800 },
];

// Demo events so the dashboard doesn't feel empty
export const SEED_EVENTS: EventConcept[] = [
  {
    id: "evt_kotg_mall",
    status: "UPCOMING",
    priority: "MEDIUM",
    category: "kotg - indoor",
    createdBy: "u_gm01",
    createdAt: NOW,
    updatedAt: NOW,
    s1: {
      eventName: "KOTG @ The Mall Gadong",
      edition: "2026",
      eventRefNo: "KEMS-EVT-0007",
      startDate: new Date(Date.now() + 5 * 24 * 3600e3).toISOString(),
      endDate: new Date(Date.now() + 5 * 24 * 3600e3 + 4 * 3600e3).toISOString(),
      venue: "The Mall Gadong — Atrium",
      expectedDurationHours: 4,
      expectedAttendance: 1200,
      conceptPreparedBy: "Jenny Malai Ali",
      conceptDate: NOW,
    },
    s2: { types: ["KOTG"], classification: "COMMUNITY_CSR", vogPillars: ["COMMUNITY_ENGAGEMENT"] },
    s3: {
      description: "Live outside broadcast from The Mall Gadong with on-air interviews, games, and community engagement.",
      objectives: ["Grow weekend listenership", "Strengthen community presence", "Support local retailers"],
      targetAudience: "Weekend mall-goers, families 25–45",
      successMetrics: "≥ 1,000 attendance; 500k social reach; 3+ retail partner signups",
      brandLink: "Core KristalFM weekend engagement strategy",
    },
    s4: { equipment: [] },
    s5: { staff: [] },
    s6: { costs: [] },
    s7: { tasks: [] },
    s8: { liveBroadcast: "YES", platforms: ["FM Radio", "Web Livestream"], schedule: [], podcastRecording: false, socialPlatforms: ["Instagram", "TikTok"], hashtags: ["#KOTG", "#KristalFM"] },
    s9: { risks: [] },
    s10: {},
    s11: { entries: [] },
  },
  {
    id: "evt_launch_hua",
    status: "PENDING_APPROVAL",
    priority: "HIGH",
    category: "live announcement",
    createdBy: "u_gm01",
    createdAt: NOW,
    updatedAt: NOW,
    s1: {
      eventName: "Hua Ho Product Launch — Live Broadcast",
      eventRefNo: "KEMS-EVT-0008",
      startDate: new Date(Date.now() + 12 * 24 * 3600e3).toISOString(),
      endDate: new Date(Date.now() + 12 * 24 * 3600e3 + 3 * 3600e3).toISOString(),
      venue: "Hua Ho Manggis Complex",
      expectedDurationHours: 3,
      expectedAttendance: 400,
      conceptPreparedBy: "Jenny Malai Ali",
      conceptDate: NOW,
    },
    s2: { types: ["PRODUCT_LAUNCH", "INDOOR_REMOTE_BROADCAST"], classification: "COMMERCIAL", clientName: "Hua Ho Sdn Bhd", agreedFeeBND: 8500, scopeOfServices: "Full broadcast production + emcee + social coverage" },
    s3: {
      description: "Product launch event with live broadcast from retail floor, sponsor spots and giveaways.",
      objectives: ["Deliver client brand message", "Drive foot traffic", "Sponsor content integration"],
      targetAudience: "Retail shoppers, brand followers",
      successMetrics: "Client sign-off; 100k reach; 3 on-air sponsor spots",
      brandLink: "Commercial partnership stream",
    },
    s4: { equipment: [] },
    s5: { staff: [] },
    s6: { costs: [] },
    s7: { tasks: [] },
    s8: { liveBroadcast: "YES", platforms: ["FM Radio"], schedule: [], podcastRecording: true, socialPlatforms: ["Instagram", "Facebook"], hashtags: ["#HuaHoLaunch"] },
    s9: { risks: [] },
    s10: {},
    s11: { entries: [] },
  },
  {
    id: "evt_kotg_taman",
    status: "ONGOING",
    priority: "MEDIUM",
    category: "kotg - outdoor",
    createdBy: "u_gm01",
    createdAt: NOW,
    updatedAt: NOW,
    s1: {
      eventName: "Taman SOAS — Weekend Broadcast",
      eventRefNo: "KEMS-EVT-0006",
      startDate: new Date(Date.now() - 1 * 3600e3).toISOString(),
      endDate: new Date(Date.now() + 3 * 3600e3).toISOString(),
      venue: "Taman Haji Sir Muda Omar 'Ali Saifuddien",
      expectedAttendance: 800,
      conceptPreparedBy: "Jenny Malai Ali",
      conceptDate: NOW,
    },
    s2: { types: ["KOTG"], classification: "COMMUNITY_CSR", vogPillars: ["CHAMPION_COMMUNITY"] },
    s3: {
      description: "Weekend park broadcast celebrating local community initiatives.",
      objectives: ["Amplify community stories", "Grow park-going audience engagement"],
      targetAudience: "Families, park visitors",
      successMetrics: "≥ 500 attendees, positive listener feedback",
      brandLink: "Voice of Good — Champion the Community pillar",
    },
    s4: { equipment: [] },
    s5: { staff: [] },
    s6: { costs: [] },
    s7: { tasks: [] },
    s8: { liveBroadcast: "YES", platforms: ["FM Radio", "Web Livestream"], schedule: [], podcastRecording: false, socialPlatforms: ["Instagram"], hashtags: ["#KOTG"] },
    s9: { risks: [] },
    s10: {},
    s11: { entries: [] },
  },
  {
    id: "evt_school_roadshow",
    status: "COMPLETED",
    priority: "LOW",
    category: "panel",
    createdBy: "u_gm01",
    createdAt: NOW,
    updatedAt: NOW,
    s1: {
      eventName: "School Roadshow — Sixth Form Centre",
      eventRefNo: "KEMS-EVT-0004",
      startDate: new Date(Date.now() - 14 * 24 * 3600e3).toISOString(),
      endDate: new Date(Date.now() - 14 * 24 * 3600e3 + 3 * 3600e3).toISOString(),
      venue: "Sixth Form Centre",
      expectedAttendance: 300,
      conceptPreparedBy: "Jenny Malai Ali",
      conceptDate: NOW,
    },
    s2: { types: ["SCHOOL_INSTITUTION", "ROAD_SHOW"], classification: "COMMUNITY_CSR", vogPillars: ["CAPACITY_BUILDING"] },
    s3: { description: "Career and creative-media talks for sixth form students.", objectives: ["Build media careers pipeline"], targetAudience: "Students 16–18", successMetrics: "Talk delivered; positive teacher feedback", brandLink: "VoG — Capacity Building" },
    s4: { equipment: [] },
    s5: { staff: [] },
    s6: { costs: [] },
    s7: { tasks: [] },
    s8: { liveBroadcast: "NO", platforms: [], schedule: [], podcastRecording: true, socialPlatforms: [], hashtags: [] },
    s9: { risks: [] },
    s10: { actualAttendance: 340, overallRating: 4, whatWentWell: "Strong Q&A engagement.", improvements: "Bring more collateral." },
    s11: { entries: [] },
  },
];
