import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentPaymentProfiles, agentPayouts, agents } from "@/db/schema";
import { requireActiveAgent } from "@/lib/auth-guards";
import { PageHeader } from "@/components/homix/page-kit";
import { getLocale } from "@/lib/i18n";
import { PayoutsClient } from "./payouts-client";

export const metadata: Metadata = { title: "Payouts · Homix Deals" };

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

  const [agentRows, payoutRows, profileRows] = await Promise.all([
    db.select().from(agents).where(eq(agents.isActive, true)).orderBy(asc(agents.name)),
    db.select().from(agentPayouts).orderBy(desc(agentPayouts.paidAt), desc(agentPayouts.id)),
    db.select().from(agentPaymentProfiles),
  ]);

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
      <PayoutsClient agents={agentRows} payouts={payoutRows} profiles={readiness} />
    </div>
  );
}
