import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
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

export const agents = sqliteTable("agents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  licenseNumber: text("license_number"),
  licensedCompany: text("licensed_company"),
  splitPct: real("split_pct").notNull().default(50),
  teamId: integer("team_id").references((): AnySQLiteColumn => teams.id, { onDelete: "set null" }),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
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

export type LineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

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
