import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  agentPaymentProfiles,
  agentPayouts,
  agents,
  compensationObligations,
  dealCompensationSnapshots,
  sponsorPlanRewards,
} from "@/db/schema";
import { requireActiveAgent } from "@/lib/auth-guards";
import { PageHeader } from "@/components/homix/page-kit";
import { getLocale } from "@/lib/i18n";
import { PayoutsClient } from "./payouts-client";

export const metadata: Metadata = { title: "Payouts · Homix" };

const M = {
  en: {
    eyebrow: "Money out",
    title: "Commission payouts",
    description:
      "Money moves in QuickBooks or by check — record each disbursement here so agents see it and year-end 1099 totals add up.",
  },
  zh: {
    eyebrow: "资金流出",
    title: "佣金发放",
    description:
      "实际打款走 QuickBooks 或支票——在这里登记每一笔，经纪人实时可见，年末 1099 合计自动汇总。",
  },
} as const;

export default async function PayoutsPage() {
  const session = await requireActiveAgent();
  if (!session.user.isAdmin) redirect("/");
  const t = M[await getLocale()];

  const [agentRows, payoutRows, profileRows, dealObligationRows, planRewardRows] = await Promise.all([
    db.select().from(agents).where(eq(agents.accountStatus, "active")).orderBy(asc(agents.name)),
    db.select().from(agentPayouts).orderBy(desc(agentPayouts.paidAt), desc(agentPayouts.id)),
    db.select().from(agentPaymentProfiles),
    db
      .select({
        id: compensationObligations.id,
        recipientAgentId: compensationObligations.recipientAgentId,
        sourceAgentId: compensationObligations.sourceAgentId,
        kind: compensationObligations.kind,
        amountCents: compensationObligations.amountCents,
        paidCents: compensationObligations.paidCents,
        status: compensationObligations.status,
        dealType: dealCompensationSnapshots.dealType,
        dealId: dealCompensationSnapshots.dealId,
      })
      .from(compensationObligations)
      .innerJoin(
        dealCompensationSnapshots,
        eq(dealCompensationSnapshots.id, compensationObligations.snapshotId),
      )
      .where(inArray(compensationObligations.status, ["pending_receipt", "payable", "partially_paid"]))
      .orderBy(asc(compensationObligations.availableAt), asc(compensationObligations.id)),
    db
      .select()
      .from(sponsorPlanRewards)
      .where(inArray(sponsorPlanRewards.status, ["accrued", "partially_paid"]))
      .orderBy(asc(sponsorPlanRewards.availableAt), asc(sponsorPlanRewards.id)),
  ]);
  const obligationRows = [
    ...dealObligationRows,
    ...planRewardRows.map((row) => ({
      id: -row.id,
      recipientAgentId: row.sponsorAgentId,
      sourceAgentId: row.referredAgentId,
      kind: "sponsor_reward" as const,
      amountCents: row.amountCents,
      paidCents: row.paidCents,
      status: row.status === "accrued" ? "payable" as const : "partially_paid" as const,
      dealType: "plan_fee",
      dealId: row.orderId || 0,
    })),
  ];

  // Readiness needs on-file yes/no + last-4 only; full bank digits stay
  // server-side (admins who need them can pull the W-9 / audit the record).
  const readiness = profileRows.map((profile) => ({
    agentId: profile.agentId,
    hasW9: Boolean(profile.w9ObjectKey),
    hasAch: Boolean(profile.routingNumber && profile.accountNumber),
    accountLast4: profile.accountNumber ? profile.accountNumber.slice(-4) : null,
    payeeType: profile.payeeType,
    payeeName: profile.payeeName,
  }));

  return (
    <div className="space-y-7">
      <PageHeader eyebrow={t.eyebrow} title={t.title} description={t.description} />
      <PayoutsClient
        agents={agentRows}
        payouts={payoutRows}
        profiles={readiness}
        obligations={obligationRows}
      />
    </div>
  );
}
