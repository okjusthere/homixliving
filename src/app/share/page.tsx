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
      "Browse Homix listings, market data, local guides, developments, and articles by section, then share them with your own contact card.",
  },
  zh: {
    eyebrow: "个人营销",
    title: "分享中心",
    description:
      "按栏目查找 Homix 房源、市场数据、区域指南、新盘和文章，生成带你联系方式的专属链接，并查看访客互动。",
  },
} as const;

export default async function SharePage() {
  const session = await requireActiveAgent();
  const locale = await getLocale();
  const t = COPY[locale];
  const agentId = session.user.agentId ?? null;
  const profile = agentId
    ? await fetchPublicProfile(agentId, { revalidateSeconds: 60 })
    : null;
  const profilePhoto = profile?.profile?.photo_url;
  const hasPersonalPhoto = Boolean(
    profilePhoto && !profilePhoto.endsWith("/agent-placeholder-logo.png"),
  );
  const canShare =
    profile?.linked === true &&
    profile.profile?.visibility_status === "visible" &&
    hasPersonalPhoto;
  const shareIdentity = profile?.profile
    ? {
        name: profile.profile.name || session.user.name || session.user.email || "Homix Agent",
        photoUrl: hasPersonalPhoto ? profile.profile.photo_url : null,
      }
    : null;

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
        shareIdentity={shareIdentity}
      />
    </div>
  );
}
