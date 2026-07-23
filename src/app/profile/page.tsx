import type { Metadata } from "next";
import Link from "next/link";
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
      <Link
        href="/profile/public"
        className="flex items-center justify-between gap-4 rounded-xl px-5 py-4 transition-colors hover:bg-[#FAF7F0]"
        style={{ background: "#FCFAF5", border: "1px solid #E4DED2" }}
      >
        <div>
          <div className="font-serif" style={{ fontSize: 17, color: "#1A1814" }}>
            对外主页 · Public profile
          </div>
          <div className="mt-0.5 text-[12.5px]" style={{ color: "#7A756C" }}>
            编辑访客在 www.homixny.com 上看到的照片、简介、评价——直接同步,无需管理员链接。
          </div>
        </div>
        <span aria-hidden style={{ color: "#5C6B3A", fontSize: 18 }}>
          →
        </span>
      </Link>
      <ProfileClient agent={agent ?? null} profile={safeProfile} payouts={payouts} />
    </div>
  );
}
