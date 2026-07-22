import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentPaymentProfiles, agentPayouts, agents } from "@/db/schema";
import { requireActiveAgent } from "@/lib/auth-guards";
import { PageHeader } from "@/components/homix/page-kit";
import { getLocale } from "@/lib/i18n";
import { ProfileClient } from "./profile-client";

export const metadata: Metadata = { title: "My Profile · Homix Deals" };

const M = {
  en: {
    eyebrow: "Self service",
    title: "My profile",
    description:
      "Your contact info, payout account, and W-9 — so commissions reach you without back-and-forth.",
  },
  zh: {
    eyebrow: "个人中心",
    title: "我的档案",
    description: "联系方式、收款账户与 W-9——资料齐了，佣金发放才不用来回追问。",
  },
} as const;

export default async function ProfilePage() {
  const session = await requireActiveAgent();
  const agentId = session.user.agentId;
  const t = M[await getLocale()];

  const [agent] = agentId
    ? await db.select().from(agents).where(eq(agents.id, agentId)).limit(1)
    : [];
  const [profile] = agentId
    ? await db
        .select()
        .from(agentPaymentProfiles)
        .where(eq(agentPaymentProfiles.agentId, agentId))
        .limit(1)
    : [];
  const payouts = agentId
    ? await db
        .select()
        .from(agentPayouts)
        .where(eq(agentPayouts.agentId, agentId))
        .orderBy(desc(agentPayouts.paidAt), desc(agentPayouts.id))
    : [];

  // Strip bank digits before props cross to the client — anything passed here
  // is serialized into the page payload. The UI only needs masked state.
  const safeProfile = profile
    ? {
        payeeType: profile.payeeType,
        payeeName: profile.payeeName,
        bankName: profile.bankName,
        accountType: profile.accountType,
        accountLast4: profile.accountNumber ? profile.accountNumber.slice(-4) : null,
        hasAch: Boolean(profile.routingNumber && profile.accountNumber),
        hasW9: Boolean(profile.w9ObjectKey),
        w9FileName: profile.w9FileName,
        w9UploadedAt: profile.w9UploadedAt,
      }
    : null;

  return (
    <div className="space-y-7">
      <PageHeader eyebrow={t.eyebrow} title={t.title} description={t.description} />
      <ProfileClient agent={agent ?? null} profile={safeProfile} payouts={payouts} />
    </div>
  );
}
