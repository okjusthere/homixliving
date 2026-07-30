import type { Metadata } from "next";
import { PageHeader } from "@/components/homix/page-kit";
import { ShareCenter } from "@/components/share/share-center";
import { requireActiveAgent } from "@/lib/auth-guards";
import { fetchPublicProfile } from "@/lib/homixweb";
import { getLocale } from "@/lib/i18n";

export const metadata: Metadata = { title: "Share Center · Homix" };

const COPY = {
  en: {
    eyebrow: "Personal marketing",
    title: "Share center",
    description:
      "Share live Homix listings and editorial content with your own contact card, then see what visitors engage with.",
  },
  zh: {
    eyebrow: "个人营销",
    title: "分享中心",
    description:
      "选择 Homix 网站上的实时房源、区域、新盘和文章，生成带你联系方式的专属链接，并查看访客互动。",
  },
} as const;

export default async function SharePage() {
  const session = await requireActiveAgent();
  const locale = await getLocale();
  const t = COPY[locale];
  const agentId = session.user.agentId ?? null;
  const profile = agentId ? await fetchPublicProfile(agentId) : null;
  const canShare =
    profile?.linked === true &&
    profile.profile?.visibility_status === "visible";

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
      />
      <ShareCenter
        locale={locale}
        isAdmin={Boolean(session.user.isAdmin)}
        canShare={canShare}
        agentId={agentId}
      />
    </div>
  );
}
