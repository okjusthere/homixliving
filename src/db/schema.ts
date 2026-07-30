// Postgres (Supabase) schema. All portal tables live in the dedicated
// "portal" Postgres schema so they can share one database with the marketing
// site's public.* tables (agents, inquiries) without name collisions.
//
// Porting notes from the original SQLite schema:
// - integer-boolean columns became real booleans
// - autoincrement ids became BY DEFAULT identities (imports may set ids)
// - date/time columns are real timestamptz/date and money columns are exact
//   numeric — but the app still sees STRINGS for temporal values (drizzle's
//   node-postgres session reads those OIDs as raw text) and NUMBERS for
//   money. Parse temporal strings through src/lib/db-time.ts, never with a
//   bare `new Date(value)` (Safari rejects Postgres's text format).
import {
  pgSchema,
  pgTable,
  text,
  integer,
  boolean,
  jsonb,
  index,
  primaryKey,
  uniqueIndex,
  timestamp,
  date,
  numeric,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { AgentPlan, AgentPractice } from "@/lib/agent-plans";

export const portal = pgSchema("portal");

// Column shorthands. Temporal defaults write ISO strings — Postgres casts
// them on assignment, and they are also valid for any not-yet-migrated TEXT
// column, which is what makes deploy-before-migrate safe.
const timestamptz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "string" });
const dateCol = (name: string) => date(name, { mode: "string" });
/** Dollars with cents, exact. Reads back as a JS number. */
const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });
/** Percentage that may be fractional (e.g. a 33.333 three-way split). */
const fractionalPct = (name: string) => numeric(name, { precision: 6, scale: 3, mode: "number" });

export const buildings = portal.table("buildings", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  region: text("region").notNull(), // RI, 中城, NJ, 费城, etc.
  name: text("name").notNull(), // CRM 系统楼名
  managementCompany: text("management_company"), // Greystar, Bozzuto, NPR, etc.
  submissionType: text("submission_type").notNull(), // email, system_upload, both
  submissionNotes: text("submission_notes"), // 提交方式的详细说明
  invoiceNumberFormat: text("invoice_number_format"), // e.g. Unit-OCTAGON-2026
  billToCompany: text("bill_to_company"), // 大楼 Bill to 的公司名
  billToAddress: text("bill_to_address"),
  contactEmail: text("contact_email"), // 大楼/管理公司收件邮箱
  specialNotes: text("special_notes"), // 特殊要求备注
  isOutOfState: boolean("is_out_of_state").default(false),
  createdAt: timestamptz("created_at").$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamptz("updated_at").$defaultFn(() => new Date().toISOString()),
});

export const invoices = portal.table("invoices", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  buildingId: integer("building_id").references(() => buildings.id),
  dealId: integer("rental_deal_id").references((): AnyPgColumn => rentalDeals.id, {
    onDelete: "set null",
  }),
  invoiceNumber: text("invoice_number").notNull(), // Unit-楼名-年份
  fileName: text("file_name").notNull(), // Unit-楼名-Invoice-持证公司
  emailSubject: text("email_subject"), // Unit-楼名-OP Invoice-持证公司
  unit: text("unit").notNull(),
  tenantName: text("tenant_name").notNull(),
  agentEmail: text("agent_email"), // 经纪人邮箱 (Reply-To)
  agentName: text("agent_name"),
  agentPhone: text("agent_phone"), // 经纪人电话
  apartmentAddress: text("apartment_address"), // 客人入住的完整公寓地址
  moveInDate: dateCol("move_in_date"), // 入住日期
  licensedCompany: text("licensed_company").notNull(), // 持证公司
  year: integer("year").notNull().default(2026),
  lineItems: jsonb("line_items").$type<LineItem[]>(),
  totalAmount: money("total_amount").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("draft"), // draft, sent, paid, failed
  sentAt: timestamptz("sent_at"),
  paidAt: timestamptz("paid_at"), // when payment received
  paidAmount: money("paid_amount"), // actual amount received (defaults to totalAmount)
  pdfData: text("pdf_data"), // base64 encoded PDF for storage
  createdAt: timestamptz("created_at").$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamptz("updated_at").$defaultFn(() => new Date().toISOString()),
});

export const settings = portal.table("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const teams = portal.table("teams", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  name: text("name").notNull(),
  leaderAgentId: integer("leader_agent_id").references((): AnyPgColumn => agents.id),
  notes: text("notes"),
});

export type AgentAccountStatus = "pending" | "active" | "inactive";

export const agents = portal.table("agents", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  licenseNumber: text("license_number"),
  // NY licenses expire every 2 years — the reminder cron watches this date.
  licenseExpiresAt: dateCol("license_expires_at"),
  licensedCompany: text("licensed_company"),
  splitPct: integer("split_pct").notNull().default(80),
  teamId: integer("team_id").references((): AnyPgColumn => teams.id, { onDelete: "set null" }),
  isAdmin: boolean("is_admin").notNull().default(false),
  accountStatus: text("account_status")
    .$type<AgentAccountStatus>()
    .notNull()
    .default("pending"),
  joinedAt: dateCol("joined_at"),
  notes: text("notes"),
  /** Name on the licence / tax forms, when it differs from the display name. */
  legalName: text("legal_name"),
  /** Commission plan — see lib/agent-plans.ts (standard 80 / growth 92 / elite 100). */
  plan: text("plan").$type<AgentPlan>().notNull().default("standard"),
  /** rental | sales | both. Null when not yet specified. */
  practice: text("practice").$type<AgentPractice>(),
  /** Which existing agent recruited this one — set by an admin, never inferred. */
  referredByAgentId: integer("referred_by_agent_id").references(
    (): AnyPgColumn => agents.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamptz("created_at").$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamptz("updated_at").$defaultFn(() => new Date().toISOString()),
});

export const rentalDeals = portal.table("rental_deals", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  buildingId: integer("building_id")
    .notNull()
    .references(() => buildings.id),
  unit: text("unit").notNull(),
  tenantName: text("tenant_name").notNull(),
  tenantEmail: text("tenant_email"),
  tenantPhone: text("tenant_phone"),
  apartmentAddress: text("apartment_address"),
  moveInDate: dateCol("move_in_date"),
  leaseStartDate: dateCol("lease_start_date"),
  leaseEndDate: dateCol("lease_end_date"),
  rentAmount: money("rent_amount"),
  leaseLengthMonths: integer("lease_length_months"),
  totalCommission: money("total_commission").notNull(),
  licensedCompany: text("licensed_company").notNull(),
  referrerName: text("referrer_name"), // free-text referral contact name
  referrerType: text("referrer_type"),
  referrerAmount: money("referrer_amount"),
  // Payment instructions for paying the referrer once Homix gets paid by the
  // building. Free text — typical content: "Zelle 555-0102", "ACH bank XYZ
  // routing 1234 acct 5678", "Wire to ...". Sensitive but lower stakes than
  // tenant docs since it's the referrer's own info that they gave us.
  referrerPaymentInfo: text("referrer_payment_info"),
  status: text("status").notNull().default("active"),
  dealDate: dateCol("deal_date"),
  source: text("source"), // 客源来源 — see DealSource in src/lib/sources.ts
  notes: text("notes"),
  // Renewal tracking — for upcoming lease-end follow-ups
  renewalStatus: text("renewal_status"), // null | 'pending' | 'renewing' | 'moving_out' | 'renewed' | 'lost'
  renewalNotedAt: timestamptz("renewal_noted_at"),
  renewedToDealId: integer("renewed_to_rental_deal_id"), // FK to rental_deals.id once renewal closes
  // 登单人 — the signed-in account that entered this deal.
  createdByEmail: text("created_by_email"),
  createdAt: timestamptz("created_at").$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamptz("updated_at").$defaultFn(() => new Date().toISOString()),
});

export const rentalDealAgents = portal.table(
  "rental_deal_agents",
  {
    dealId: integer("rental_deal_id")
      .notNull()
      .references(() => rentalDeals.id, { onDelete: "cascade" }),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    sharePct: fractionalPct("share_pct").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamptz("created_at").$defaultFn(() => new Date().toISOString()),
  },
  (table) => [primaryKey({ columns: [table.dealId, table.agentId] })]
);

// Compatibility aliases while application code transitions from "deals" to Rental naming.
export const deals = rentalDeals;
export const dealAgents = rentalDealAgents;

export const saleDeals = portal.table("sale_deals", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  representationType: text("representation_type").notNull(), // buyer_rep | seller_rep | dual_agency | referral
  stage: text("stage").notNull().default("pre_contract"), // pre_contract | under_contract | post_contract | closed
  status: text("status").notNull().default("active"), // active | cancelled | completed
  propertyAddress: text("property_address").notNull(),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  propertyType: text("property_type"),
  mlsNumber: text("mls_number"),
  fileId: text("file_id"),
  buyerNames: text("buyer_names"),
  sellerNames: text("seller_names"),
  contractDate: dateCol("contract_date"),
  closingDate: dateCol("closing_date"),
  purchasePrice: money("purchase_price"),
  grossCommission: money("gross_commission").notNull().default(0),
  referralAmount: money("referral_amount"),
  brokerageFee: money("brokerage_fee"),
  listingAgentName: text("listing_agent_name"),
  listingAgentEmail: text("listing_agent_email"),
  listingBrokerage: text("listing_brokerage"),
  cooperatingAgentName: text("cooperating_agent_name"),
  cooperatingAgentEmail: text("cooperating_agent_email"),
  cooperatingBrokerage: text("cooperating_brokerage"),
  buyerAttorney: text("buyer_attorney"),
  sellerAttorney: text("seller_attorney"),
  titleCompany: text("title_company"),
  lenderName: text("lender_name"),
  escrowHolder: text("escrow_holder"),
  source: text("source"),
  notes: text("notes"),
  // 登单人 — the signed-in account that entered this deal.
  createdByEmail: text("created_by_email"),
  createdAt: timestamptz("created_at").$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamptz("updated_at").$defaultFn(() => new Date().toISOString()),
});

export const saleDealAgents = portal.table(
  "sale_deal_agents",
  {
    saleDealId: integer("sale_deal_id")
      .notNull()
      .references(() => saleDeals.id, { onDelete: "cascade" }),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    sharePct: fractionalPct("share_pct").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamptz("created_at").$defaultFn(() => new Date().toISOString()),
  },
  (table) => [primaryKey({ columns: [table.saleDealId, table.agentId] })]
);

// ============================================================
// Invoice send log — audit trail of every send attempt (success or failure).
// Critical for "did this invoice actually go out?" + dispute reconstruction.
// ============================================================
export const invoiceSendLog = portal.table("invoice_send_log", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  invoiceId: integer("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  // Who initiated the send. Email is snapshotted so history survives roster changes.
  sentByEmail: text("sent_by_email"),
  // Recipient snapshot (comma-separated). Not normalized — captured as sent.
  toRecipients: text("to_recipients").notNull(),
  ccRecipients: text("cc_recipients"),
  replyTo: text("reply_to"),
  subject: text("subject").notNull(),
  status: text("status").notNull(), // 'sent' | 'failed'
  errorMessage: text("error_message"),
  sentAt: timestamptz("sent_at").$defaultFn(() => new Date().toISOString()),
});

// ============================================================
// Agent training videos — Cloudflare Stream UIDs + metadata, shown in the
// gated /training section. Managed by admins; watched by all active agents.
// ============================================================
export const trainingVideos = portal.table("training_videos", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull().default("General"),
  cloudflareUid: text("cloudflare_uid").notNull(),
  durationLabel: text("duration_label"), // e.g. "8 min"
  sortOrder: integer("sort_order").notNull().default(100),
  isPublished: boolean("is_published").notNull().default(true),
  createdAt: timestamptz("created_at").$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamptz("updated_at").$defaultFn(() => new Date().toISOString()),
});

export const trainingVideoViews = portal.table(
  "training_video_views",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    videoId: integer("video_id")
      .notNull()
      .references(() => trainingVideos.id, { onDelete: "cascade" }),
    agentId: integer("agent_id").references(() => agents.id, { onDelete: "set null" }),
    agentEmail: text("agent_email").notNull(),
    firstViewedAt: timestamptz("first_viewed_at").notNull(),
    lastViewedAt: timestamptz("last_viewed_at").notNull(),
    openCount: integer("open_count").notNull().default(1),
    createdAt: timestamptz("created_at").$defaultFn(() => new Date().toISOString()),
    updatedAt: timestamptz("updated_at").$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    uniqueIndex("idx_training_video_views_unique_viewer").on(
      table.videoId,
      table.agentEmail
    ),
  ]
);

// ============================================================
// Agent resource library — links to SOPs, scripts, templates, brand assets.
// Shown in the gated /resources section; managed by admins.
// ============================================================
export const resources = portal.table("resources", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull().default("General"),
  url: text("url").notNull(),
  // Optional companion link: a filled-in sample of the same form (the blank
  // template lives in `url`). Rendered as a second button on the card.
  sampleUrl: text("sample_url"),
  sortOrder: integer("sort_order").notNull().default(100),
  isPublished: boolean("is_published").notNull().default(true),
  createdAt: timestamptz("created_at").$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamptz("updated_at").$defaultFn(() => new Date().toISOString()),
});

// Required-documents checklists (做单必交文件), grouped by deal stage — e.g.
// "new-listing-residential" → the ordered list of documents an agent must
// submit to the office at that stage. Group keys/labels live in
// src/lib/checklist-groups.ts; items are admin-managed rows.
export const checklistItems = portal.table("checklist_items", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  groupKey: text("group_key").notNull(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(100),
  createdAt: timestamptz("created_at").$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamptz("updated_at").$defaultFn(() => new Date().toISOString()),
});

export const commerceOrders = portal.table("commerce_orders", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  productKey: text("product_key").notNull(),
  productName: text("product_name").notNull(),
  billingMode: text("billing_mode").notNull(), // payment | subscription
  stripePriceId: text("stripe_price_id"),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("usd"),
  status: text("status").notNull().default("pending"),
  stripeCheckoutSessionId: text("stripe_checkout_session_id").unique(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  checkoutUrl: text("checkout_url"),
  customerName: text("customer_name"),
  customerEmail: text("customer_email"),
  requestedWorkspaceEmail: text("requested_workspace_email"),
  phone: text("phone"),
  referralHasAgent: text("referral_has_agent"),
  referralAgentName: text("referral_agent_name"),
  message: text("message"),
  workspaceStatus: text("workspace_status").notNull().default("not_required"),
  workspaceUserId: text("workspace_user_id"),
  workspaceError: text("workspace_error"),
  paidAt: timestamptz("paid_at"),
  createdAt: timestamptz("created_at").$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamptz("updated_at").$defaultFn(() => new Date().toISOString()),
});

// Every real money movement on a commerce order — one row per Stripe
// invoice (idempotent on stripe_invoice_id). Subscription renewals arrive via
// the invoice webhooks; history can be re-pulled with
// /api/admin/sync-stripe-invoices. One-time (non-invoice) payments live on
// commerce_orders only, so reconciliation reads BOTH sources.
export const commerceCharges = portal.table("commerce_charges", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  orderId: integer("commerce_order_id").references(() => commerceOrders.id, {
    onDelete: "set null",
  }),
  stripeInvoiceId: text("stripe_invoice_id").notNull().unique(),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeCustomerId: text("stripe_customer_id"),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("usd"),
  status: text("status").notNull(), // paid | failed | open | void | uncollectible
  productName: text("product_name"),
  customerEmail: text("customer_email"),
  customerName: text("customer_name"),
  periodStart: timestamptz("period_start"),
  periodEnd: timestamptz("period_end"),
  paidAt: timestamptz("paid_at"),
  createdAt: timestamptz("created_at").$defaultFn(() => new Date().toISOString()),
});

// Agent payment profile — self-service W-9 + ACH details so the office can
// cut checks / QuickBooks ACH and file 1099s. The W-9 file lives in the
// PRIVATE R2 bucket (agent-docs/ prefix); only the agent and admins can read
// it. Bank fields render masked (last 4) everywhere except the edit form.
export const agentPaymentProfiles = portal.table("agent_payment_profiles", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  agentId: integer("agent_id")
    .notNull()
    .unique()
    .references(() => agents.id, { onDelete: "cascade" }),
  // Who actually gets paid — often the agent's own LLC, not their personal
  // name. ACH account title and the 1099 recipient follow payee_name (must
  // match the W-9), so displays/exports should prefer it over the agent name.
  payeeType: text("payee_type"), // individual | business
  payeeName: text("payee_name"),
  bankName: text("bank_name"),
  accountType: text("account_type"), // checking | savings
  routingNumber: text("routing_number"),
  accountNumber: text("account_number"),
  w9ObjectKey: text("w9_object_key"),
  w9FileName: text("w9_file_name"),
  w9UploadedAt: timestamptz("w9_uploaded_at"),
  updatedAt: timestamptz("updated_at").$defaultFn(() => new Date().toISOString()),
});

// Commission disbursements to agents. The actual money moves OUTSIDE the
// system (QuickBooks ACH / paper check) — these rows are the admin's manual
// record of each payment, and the yearly per-agent sum is the 1099 figure.
// Amounts are frozen at record time, so later splitPct edits never rewrite
// tax history.
export const agentPayouts = portal.table("agent_payouts", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  agentId: integer("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  amountCents: integer("amount_cents").notNull(),
  method: text("method").notNull().default("ach"), // ach | check | quickbooks | zelle | other
  reference: text("reference"), // check # / ACH trace / QuickBooks txn id
  memo: text("memo"),
  dealType: text("deal_type"), // rental | sale (optional link)
  dealId: integer("deal_id"),
  paidAt: dateCol("paid_at").notNull(), // date the money actually moved
  createdByEmail: text("created_by_email"),
  createdAt: timestamptz("created_at").$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamptz("updated_at").$defaultFn(() => new Date().toISOString()),
});

export const stripeEvents = portal.table("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  orderId: integer("commerce_order_id").references(() => commerceOrders.id, {
    onDelete: "set null",
  }),
  receivedAt: timestamptz("received_at").$defaultFn(() => new Date().toISOString()),
});

// ============================================================
// Cross-site content sharing. These tables intentionally live in public.*
// because both the Portal database connection and Homix Web's Supabase
// service-role client need them. RLS is enabled by the migration with no
// browser-facing policies; all access remains server-side.
// ============================================================
export const shareLinks = pgTable(
  "share_links",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    code: text("code").notNull().unique(),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    contentKind: text("content_kind").notNull(),
    contentKey: text("content_key").notNull(),
    contentPath: text("content_path").notNull(),
    contentTitle: text("content_title").notNull(),
    contentSubtitle: text("content_subtitle"),
    contentImage: text("content_image"),
    locale: text("locale").notNull().default("zh"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamptz("created_at").$defaultFn(() => new Date().toISOString()),
    updatedAt: timestamptz("updated_at").$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    uniqueIndex("idx_share_links_agent_content").on(
      table.agentId,
      table.contentKind,
      table.contentKey,
      table.locale,
    ),
    index("idx_share_links_agent_created").on(table.agentId, table.createdAt),
  ],
);

export const shareVisits = pgTable(
  "share_visits",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    shareLinkId: integer("share_link_id")
      .notNull()
      .references(() => shareLinks.id, { onDelete: "cascade" }),
    sessionKey: text("session_key").notNull().unique(),
    visitorHash: text("visitor_hash").notNull(),
    referrerDomain: text("referrer_domain"),
    deviceType: text("device_type"),
    activeSeconds: integer("active_seconds").notNull().default(0),
    maxScrollDepth: integer("max_scroll_depth").notNull().default(0),
    startedAt: timestamptz("started_at").$defaultFn(() => new Date().toISOString()),
    lastSeenAt: timestamptz("last_seen_at").$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index("idx_share_visits_link_started").on(table.shareLinkId, table.startedAt),
    index("idx_share_visits_link_visitor").on(table.shareLinkId, table.visitorHash),
  ],
);

export const shareEvents = pgTable(
  "share_events",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    shareLinkId: integer("share_link_id")
      .notNull()
      .references(() => shareLinks.id, { onDelete: "cascade" }),
    visitId: integer("visit_id").references(() => shareVisits.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamptz("created_at").$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index("idx_share_events_link_created").on(table.shareLinkId, table.createdAt),
    index("idx_share_events_type_created").on(table.eventType, table.createdAt),
  ],
);

export type LineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

// ============================================================
// In-app notifications — one row per recipient. dedupe_key makes a logical
// event fire at most once per recipient (e.g. "renewal:12:60:a5"), so daily
// crons can re-scan without spamming.
// ============================================================
export const notifications = portal.table("notifications", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  recipientAgentId: integer("recipient_agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // agent_pending | agent_approved | renewal_window | invoice_paid | ...
  title: text("title").notNull(),
  body: text("body"),
  href: text("href"), // in-app path, e.g. /rental/123
  dedupeKey: text("dedupe_key").unique(),
  readAt: timestamptz("read_at"),
  createdAt: timestamptz("created_at").$defaultFn(() => new Date().toISOString()),
});

// ============================================================
// Audit log — who changed what, when. Append-only; writes are best-effort
// (a failed log write must never fail the underlying request).
// ============================================================
export const auditLog = portal.table("audit_log", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  actorEmail: text("actor_email"),
  action: text("action").notNull(), // create | update | delete | send | mark_paid | approve | ...
  entityType: text("entity_type").notNull(), // rental_deal | sale_deal | invoice | agent | team | setting | ...
  entityId: text("entity_id"),
  summary: text("summary").notNull(),
  detail: text("detail"), // optional JSON snapshot of the change
  createdAt: timestamptz("created_at").$defaultFn(() => new Date().toISOString()),
});

// ============================================================
// Deal documents — files (lease, application, guarantor docs) attached to a
// rental or sale deal. Objects live in a private Cloudflare R2 bucket and are
// reached through short-lived signed URLs after the deal visibility check.
// legacyUrl keeps the old non-null Vercel Blob column compatible without a
// destructive table rebuild; new rows store the R2 key there as a placeholder.
// ============================================================
export const dealDocuments = portal.table("deal_documents", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  dealType: text("deal_type").notNull(), // 'rental' | 'sale'
  dealId: integer("deal_id").notNull(),
  fileName: text("file_name").notNull(),
  legacyUrl: text("url").notNull().default(""),
  storageProvider: text("storage_provider").notNull().default("r2"),
  objectKey: text("object_key").notNull().default(""),
  contentType: text("content_type"),
  size: integer("size"),
  uploadedByEmail: text("uploaded_by_email"),
  // Which required-document checklist item this upload satisfies (nullable —
  // freeform uploads stay allowed). Drives the per-deal checklist progress.
  checklistItemId: integer("checklist_item_id"),
  createdAt: timestamptz("created_at").$defaultFn(() => new Date().toISOString()),
});

export type Building = typeof buildings.$inferSelect;
export type NewBuilding = typeof buildings.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type RentalDeal = typeof rentalDeals.$inferSelect;
export type NewRentalDeal = typeof rentalDeals.$inferInsert;
export type RentalDealAgent = typeof rentalDealAgents.$inferSelect;
export type NewRentalDealAgent = typeof rentalDealAgents.$inferInsert;
export type Deal = RentalDeal;
export type NewDeal = NewRentalDeal;
export type DealAgent = RentalDealAgent;
export type NewDealAgent = NewRentalDealAgent;
export type SaleDeal = typeof saleDeals.$inferSelect;
export type NewSaleDeal = typeof saleDeals.$inferInsert;
export type SaleDealAgent = typeof saleDealAgents.$inferSelect;
export type NewSaleDealAgent = typeof saleDealAgents.$inferInsert;
export type InvoiceSendLog = typeof invoiceSendLog.$inferSelect;
export type NewInvoiceSendLog = typeof invoiceSendLog.$inferInsert;
export type TrainingVideo = typeof trainingVideos.$inferSelect;
export type NewTrainingVideo = typeof trainingVideos.$inferInsert;
export type TrainingVideoView = typeof trainingVideoViews.$inferSelect;
export type NewTrainingVideoView = typeof trainingVideoViews.$inferInsert;
export type Resource = typeof resources.$inferSelect;
export type NewResource = typeof resources.$inferInsert;
export type ChecklistItem = typeof checklistItems.$inferSelect;
export type NewChecklistItem = typeof checklistItems.$inferInsert;
export type CommerceOrder = typeof commerceOrders.$inferSelect;
export type CommerceCharge = typeof commerceCharges.$inferSelect;
export type AgentPaymentProfile = typeof agentPaymentProfiles.$inferSelect;
export type AgentPayout = typeof agentPayouts.$inferSelect;
export type NewCommerceOrder = typeof commerceOrders.$inferInsert;
export type StripeEvent = typeof stripeEvents.$inferSelect;
export type NewStripeEvent = typeof stripeEvents.$inferInsert;
export type ShareLink = typeof shareLinks.$inferSelect;
export type NewShareLink = typeof shareLinks.$inferInsert;
export type ShareVisit = typeof shareVisits.$inferSelect;
export type ShareEvent = typeof shareEvents.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
export type DealDocument = typeof dealDocuments.$inferSelect;
export type NewDealDocument = typeof dealDocuments.$inferInsert;
