import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

export const buildings = sqliteTable("buildings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
  isOutOfState: integer("is_out_of_state", { mode: "boolean" }).default(false),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").$defaultFn(() => new Date().toISOString()),
});

export const invoices = sqliteTable("invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  buildingId: integer("building_id").references(() => buildings.id),
  dealId: integer("rental_deal_id").references((): AnySQLiteColumn => rentalDeals.id, {
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
  moveInDate: text("move_in_date"), // 入住日期
  licensedCompany: text("licensed_company").notNull(), // 持证公司
  year: integer("year").notNull().default(2026),
  lineItems: text("line_items", { mode: "json" }).$type<LineItem[]>(),
  totalAmount: real("total_amount").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("draft"), // draft, sent, paid, failed
  sentAt: text("sent_at"),
  paidAt: text("paid_at"), // when payment received
  paidAmount: real("paid_amount"), // actual amount received (defaults to totalAmount)
  pdfData: text("pdf_data"), // base64 encoded PDF for storage
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").$defaultFn(() => new Date().toISOString()),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const teams = sqliteTable("teams", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  leaderAgentId: integer("leader_agent_id").references((): AnySQLiteColumn => agents.id),
  notes: text("notes"),
});

export type AgentApprovalStatus = "pending" | "approved" | "ignored" | "revoked";

export const agents = sqliteTable("agents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  licenseNumber: text("license_number"),
  licensedCompany: text("licensed_company"),
  splitPct: real("split_pct").notNull().default(80),
  teamId: integer("team_id").references((): AnySQLiteColumn => teams.id, { onDelete: "set null" }),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
  approvalStatus: text("approval_status")
    .$type<AgentApprovalStatus>()
    .notNull()
    .default("pending"),
  joinedAt: text("joined_at"),
  notes: text("notes"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").$defaultFn(() => new Date().toISOString()),
});

export const rentalDeals = sqliteTable("rental_deals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  buildingId: integer("building_id")
    .notNull()
    .references(() => buildings.id),
  unit: text("unit").notNull(),
  tenantName: text("tenant_name").notNull(),
  tenantEmail: text("tenant_email"),
  tenantPhone: text("tenant_phone"),
  apartmentAddress: text("apartment_address"),
  moveInDate: text("move_in_date"),
  leaseStartDate: text("lease_start_date"),
  leaseEndDate: text("lease_end_date"),
  rentAmount: real("rent_amount"),
  leaseLengthMonths: integer("lease_length_months"),
  totalCommission: real("total_commission").notNull(),
  licensedCompany: text("licensed_company").notNull(),
  referrerName: text("referrer_name"), // free-text referral contact name
  referrerType: text("referrer_type"),
  referrerAmount: real("referrer_amount"),
  // Payment instructions for paying the referrer once Homix gets paid by the
  // building. Free text — typical content: "Zelle 555-0102", "ACH bank XYZ
  // routing 1234 acct 5678", "Wire to ...". Sensitive but lower stakes than
  // tenant docs since it's the referrer's own info that they gave us.
  referrerPaymentInfo: text("referrer_payment_info"),
  status: text("status").notNull().default("active"),
  dealDate: text("deal_date"),
  source: text("source"), // 客源来源 — see DealSource in src/lib/sources.ts (xiaohongshu | tiktok | wechat_group | wechat_content | school_alumni | existing_client | cobroker | website | other)
  notes: text("notes"),
  // Renewal tracking — for upcoming lease-end follow-ups
  renewalStatus: text("renewal_status"), // null | 'pending' | 'renewing' | 'moving_out' | 'renewed' | 'lost'
  renewalNotedAt: text("renewal_noted_at"),
  renewedToDealId: integer("renewed_to_rental_deal_id"), // FK to rental_deals.id once renewal closes
  // 登单人 — the signed-in account that entered this deal.
  createdByEmail: text("created_by_email"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").$defaultFn(() => new Date().toISOString()),
});

export const rentalDealAgents = sqliteTable(
  "rental_deal_agents",
  {
    dealId: integer("rental_deal_id")
      .notNull()
      .references(() => rentalDeals.id, { onDelete: "cascade" }),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    sharePct: real("share_pct").notNull(),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
  },
  (table) => [primaryKey({ columns: [table.dealId, table.agentId] })]
);

// Compatibility aliases while application code transitions from "deals" to Rental naming.
export const deals = rentalDeals;
export const dealAgents = rentalDealAgents;

export const saleDeals = sqliteTable("sale_deals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
  contractDate: text("contract_date"),
  closingDate: text("closing_date"),
  purchasePrice: real("purchase_price"),
  grossCommission: real("gross_commission").notNull().default(0),
  referralAmount: real("referral_amount"),
  brokerageFee: real("brokerage_fee"),
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
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").$defaultFn(() => new Date().toISOString()),
});

export const saleDealAgents = sqliteTable(
  "sale_deal_agents",
  {
    saleDealId: integer("sale_deal_id")
      .notNull()
      .references(() => saleDeals.id, { onDelete: "cascade" }),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    sharePct: real("share_pct").notNull(),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
  },
  (table) => [primaryKey({ columns: [table.saleDealId, table.agentId] })]
);

// ============================================================
// Invoice send log — audit trail of every send attempt (success or failure).
// Critical for "did this invoice actually go out?" + dispute reconstruction.
// ============================================================
export const invoiceSendLog = sqliteTable("invoice_send_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
  sentAt: text("sent_at").$defaultFn(() => new Date().toISOString()),
});

// ============================================================
// Agent training videos — Cloudflare Stream UIDs + metadata, shown in the
// gated /training section. Managed by admins; watched by all active agents.
// ============================================================
export const trainingVideos = sqliteTable("training_videos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull().default("General"),
  cloudflareUid: text("cloudflare_uid").notNull(),
  durationLabel: text("duration_label"), // e.g. "8 min"
  sortOrder: integer("sort_order").notNull().default(100),
  isPublished: integer("is_published", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").$defaultFn(() => new Date().toISOString()),
});

export const trainingVideoViews = sqliteTable(
  "training_video_views",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    videoId: integer("video_id")
      .notNull()
      .references(() => trainingVideos.id, { onDelete: "cascade" }),
    agentId: integer("agent_id").references(() => agents.id, { onDelete: "set null" }),
    agentEmail: text("agent_email").notNull(),
    firstViewedAt: text("first_viewed_at").notNull(),
    lastViewedAt: text("last_viewed_at").notNull(),
    openCount: integer("open_count").notNull().default(1),
    createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at").$defaultFn(() => new Date().toISOString()),
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
export const resources = sqliteTable("resources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull().default("General"),
  url: text("url").notNull(),
  // Optional companion link: a filled-in sample of the same form (the blank
  // template lives in `url`). Rendered as a second button on the card.
  sampleUrl: text("sample_url"),
  sortOrder: integer("sort_order").notNull().default(100),
  isPublished: integer("is_published", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").$defaultFn(() => new Date().toISOString()),
});

// Required-documents checklists (做单必交文件), grouped by deal stage — e.g.
// "new-listing-residential" → the ordered list of documents an agent must
// submit to the office at that stage. Group keys/labels live in
// src/lib/checklist-groups.ts; items are admin-managed rows.
export const checklistItems = sqliteTable("checklist_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  groupKey: text("group_key").notNull(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(100),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").$defaultFn(() => new Date().toISOString()),
});

export const commerceOrders = sqliteTable("commerce_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
  paidAt: text("paid_at"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").$defaultFn(() => new Date().toISOString()),
});

// Every real money movement on a commerce order — one row per Stripe
// invoice (idempotent on stripe_invoice_id). Subscription renewals arrive via
// the invoice webhooks; history can be re-pulled with
// /api/admin/sync-stripe-invoices. One-time (non-invoice) payments live on
// commerce_orders only, so reconciliation reads BOTH sources.
export const commerceCharges = sqliteTable("commerce_charges", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
  periodStart: text("period_start"),
  periodEnd: text("period_end"),
  paidAt: text("paid_at"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

export const stripeEvents = sqliteTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  orderId: integer("commerce_order_id").references(() => commerceOrders.id, {
    onDelete: "set null",
  }),
  receivedAt: text("received_at").$defaultFn(() => new Date().toISOString()),
});

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
export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recipientAgentId: integer("recipient_agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // agent_pending | agent_approved | renewal_window | invoice_paid | ...
  title: text("title").notNull(),
  body: text("body"),
  href: text("href"), // in-app path, e.g. /rental/123
  dedupeKey: text("dedupe_key").unique(),
  readAt: text("read_at"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ============================================================
// Audit log — who changed what, when. Append-only; writes are best-effort
// (a failed log write must never fail the underlying request).
// ============================================================
export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorEmail: text("actor_email"),
  action: text("action").notNull(), // create | update | delete | send | mark_paid | approve | ...
  entityType: text("entity_type").notNull(), // rental_deal | sale_deal | invoice | agent | team | setting | ...
  entityId: text("entity_id"),
  summary: text("summary").notNull(),
  detail: text("detail"), // optional JSON snapshot of the change
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ============================================================
// Deal documents — files (lease, application, guarantor docs) attached to a
// rental or sale deal. Blobs live in Vercel Blob storage; this table is the
// index. url is the full blob URL; deletion removes both.
// ============================================================
export const dealDocuments = sqliteTable("deal_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  dealType: text("deal_type").notNull(), // 'rental' | 'sale'
  dealId: integer("deal_id").notNull(),
  fileName: text("file_name").notNull(),
  url: text("url").notNull(),
  contentType: text("content_type"),
  size: integer("size"),
  uploadedByEmail: text("uploaded_by_email"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
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
export type NewCommerceOrder = typeof commerceOrders.$inferInsert;
export type StripeEvent = typeof stripeEvents.$inferSelect;
export type NewStripeEvent = typeof stripeEvents.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
export type DealDocument = typeof dealDocuments.$inferSelect;
export type NewDealDocument = typeof dealDocuments.$inferInsert;
