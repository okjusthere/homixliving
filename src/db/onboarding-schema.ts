import {
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  agents,
  commerceOrders,
  portal,
  type LimitedCapability,
} from "./schema";

const time = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "string" });
const agentRef = (name: string) =>
  integer(name)
    .notNull()
    .references(() => agents.id, { onDelete: "restrict" });

export const onboardingContracts = portal.table(
  "onboarding_contracts",
  {
    id: uuid("id").primaryKey(),
    agentId: agentRef("agent_id"),
    source: text("source").$type<"paper" | "historic">().notNull(),
    company: text("company").notNull(),
    title: text("title").notNull(),
    version: text("version").notNull(),
    purpose: text("purpose").notNull(),
    objectKey: text("object_key").notNull().unique(),
    fileName: text("file_name").notNull(),
    sha256: text("sha256").notNull(),
    byteSize: integer("byte_size").notNull(),
    agentSignedAt: time("agent_signed_at").notNull(),
    companySignedAt: time("company_signed_at"),
    replacesId: uuid("replaces_id"),
    status: text("status")
      .$type<"uploaded" | "accepted" | "returned" | "revoked" | "superseded">()
      .notNull()
      .default("uploaded"),
    uploadedBy: agentRef("uploaded_by"),
    reviewedBy: integer("reviewed_by").references(() => agents.id, {
      onDelete: "restrict",
    }),
    reviewedAt: time("reviewed_at"),
    reviewReason: text("review_reason"),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_onboarding_contracts_agent").on(t.agentId, t.createdAt)],
);

export const onboardingReceipts = portal.table(
  "onboarding_receipts",
  {
    id: uuid("id").primaryKey(),
    agentId: agentRef("agent_id"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    requestHash: text("request_hash").notNull(),
    referenceKey: text("reference_key").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    method: text("method").notNull(),
    reference: text("reference").notNull(),
    receivedAt: time("received_at").notNull(),
    recordedBy: agentRef("recorded_by"),
    status: text("status")
      .$type<"unmatched" | "matched" | "voided">()
      .notNull()
      .default("unmatched"),
    orderId: integer("order_id").references(() => commerceOrders.id, {
      onDelete: "restrict",
    }),
    reason: text("reason"),
    matchedAt: time("matched_at"),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_onboarding_receipts_agent").on(t.agentId, t.status),
    uniqueIndex("uq_onboarding_receipts_reference")
      .on(t.referenceKey)
      .where(sql`${t.status} <> 'voided'`),
  ],
);

export const onboardingAccessGrants = portal.table(
  "onboarding_access_grants",
  {
    id: uuid("id").primaryKey(),
    agentId: agentRef("agent_id"),
    capabilities: jsonb("capabilities").$type<LimitedCapability[]>().notNull(),
    reason: text("reason").notNull(),
    outstandingRequirements: text("outstanding_requirements").notNull(),
    responsibleAgentId: agentRef("responsible_agent_id"),
    expiresAt: time("expires_at").notNull(),
    status: text("status")
      .$type<"open" | "revoked" | "completed">()
      .notNull()
      .default("open"),
    grantedBy: agentRef("granted_by"),
    endedBy: integer("ended_by").references(() => agents.id, {
      onDelete: "restrict",
    }),
    endedAt: time("ended_at"),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_onboarding_grants_agent").on(t.agentId, t.status)],
);

export const onboardingExistingStaff = portal.table(
  "onboarding_existing_staff",
  {
    id: uuid("id").primaryKey(),
    agentId: agentRef("agent_id"),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => onboardingContracts.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    billingBasis: text("billing_basis")
      .$type<"not_applicable" | "historically_verified" | "current_payment">()
      .notNull(),
    billingEvidence: text("billing_evidence").notNull(),
    recognizedBy: agentRef("recognized_by"),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_onboarding_existing_staff_agent").on(t.agentId)],
);

export type OnboardingContract = typeof onboardingContracts.$inferSelect;
export type OnboardingReceipt = typeof onboardingReceipts.$inferSelect;
export type OnboardingAccessGrant = typeof onboardingAccessGrants.$inferSelect;
