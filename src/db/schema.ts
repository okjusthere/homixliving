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
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

export const invoices = sqliteTable("invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  buildingId: integer("building_id").references(() => buildings.id),
  dealId: integer("deal_id").references((): AnySQLiteColumn => deals.id, {
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
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
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
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

export const agents = sqliteTable("agents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").references((): AnySQLiteColumn => users.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  licenseNumber: text("license_number"),
  licensedCompany: text("licensed_company"),
  splitPct: real("split_pct").notNull().default(50),
  teamId: integer("team_id").references((): AnySQLiteColumn => teams.id),
  isActive: integer("is_active", { mode: "boolean" }).default(false), // false = pending approval
  isAdmin: integer("is_admin", { mode: "boolean" }).default(false),
  joinedAt: text("joined_at"),
  notes: text("notes"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

// ============================================================
// Auth.js (NextAuth) tables — required by @auth/drizzle-adapter
// ============================================================
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: integer("emailVerified", { mode: "timestamp_ms" }),
  image: text("image"),
});

export const accounts = sqliteTable("accounts", {
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("providerAccountId").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
}, (account) => [primaryKey({ columns: [account.provider, account.providerAccountId] })]);

export const sessions = sqliteTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});

export const verificationTokens = sqliteTable("verificationTokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
}, (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]);

export type User = typeof users.$inferSelect;

export const referrers = sqliteTable("referrers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  defaultReferralType: text("default_referral_type"),
  defaultReferralAmount: real("default_referral_amount"),
  notes: text("notes"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

export const deals = sqliteTable("deals", {
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
  primaryAgentId: integer("primary_agent_id")
    .notNull()
    .references(() => agents.id),
  primaryAgentSharePct: real("primary_agent_share_pct").notNull().default(100),
  coAgentId: integer("co_agent_id").references(() => agents.id),
  coAgentSharePct: real("co_agent_share_pct"),
  referrerId: integer("referrer_id").references(() => referrers.id),
  referrerType: text("referrer_type"),
  referrerAmount: real("referrer_amount"),
  status: text("status").notNull().default("active"),
  dealDate: text("deal_date"),
  source: text("source"), // 客源来源 — xiaohongshu | wechat | school_listserv | existing_client | website | other
  notes: text("notes"),
  // Renewal tracking — for upcoming lease-end follow-ups
  renewalStatus: text("renewal_status"), // null | 'pending' | 'renewing' | 'moving_out' | 'renewed' | 'lost'
  renewalNotedAt: text("renewal_noted_at"),
  renewedToDealId: integer("renewed_to_deal_id"), // FK to deals.id once renewal closes
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

export const dealInvoices = sqliteTable(
  "deal_invoices",
  {
    dealId: integer("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  },
  (table) => [primaryKey({ columns: [table.dealId, table.invoiceId] })]
);

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
export type Referrer = typeof referrers.$inferSelect;
export type NewReferrer = typeof referrers.$inferInsert;
export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;
export type DealInvoice = typeof dealInvoices.$inferSelect;
export type NewDealInvoice = typeof dealInvoices.$inferInsert;
