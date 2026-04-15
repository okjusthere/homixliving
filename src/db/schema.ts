import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

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
  invoiceNumber: text("invoice_number").notNull(), // Unit-楼名-年份
  fileName: text("file_name").notNull(), // Unit-楼名-Invoice-持证公司
  emailSubject: text("email_subject"), // Unit-楼名-OP Invoice-持证公司
  unit: text("unit").notNull(),
  tenantName: text("tenant_name").notNull(),
  agentEmail: text("agent_email"), // 经纪人邮箱 (Reply-To)
  agentName: text("agent_name"),
  licensedCompany: text("licensed_company").notNull(), // 持证公司
  year: integer("year").notNull().default(2026),
  lineItems: text("line_items", { mode: "json" }).$type<LineItem[]>(),
  totalAmount: real("total_amount").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("draft"), // draft, sent, failed
  sentAt: text("sent_at"),
  pdfData: text("pdf_data"), // base64 encoded PDF for storage
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
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
