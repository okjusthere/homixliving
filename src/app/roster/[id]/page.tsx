import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActiveAgent } from "@/lib/auth-guards";
import { fetchPublicProfileById } from "@/lib/homixweb";
import { PageHeader } from "@/components/homix/page-kit";
import { tone } from "@/components/homix/tokens";
import { PublicProfileEditor } from "../../profile/public/editor";
import { getLocale } from "@/lib/i18n";

const M = {
  en: {
    back: "Back to website roster",
    eyebrow: (id: string) => `Admin edit · ${id}`,
    title: (name: string) => `${name}'s public profile`,
    description: "Edit this advisor's www.homixny.com profile as an administrator, even when the advisor has no Portal account.",
  },
  zh: {
    back: "返回官网名册",
    eyebrow: (id: string) => `管理员编辑 · ${id}`,
    title: (name: string) => `${name} 的对外主页`,
    description: "以管理员身份编辑该经纪人在 www.homixny.com 上的资料，即使对方没有 Portal 账号也可编辑。",
  },
} as const;

export const metadata: Metadata = { title: "Edit Advisor · Homix" };

// Admin edit of one advisor's public profile, keyed by PUBLIC agent id — works
// for advisors with no portal account too. Reuses the self-service editor with
// adminPublicId set so saves go to the admin endpoint.
export default async function RosterEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireActiveAgent();
  if (!session.user.isAdmin) redirect("/profile");
  const t = M[await getLocale()];
  const { id } = await params;

  const { profile, unreachable, notFound } = await fetchPublicProfileById(id);
  if (notFound) redirect("/agents?view=public");

  return (
    <div className="space-y-6">
      <Link href="/agents?view=public" className="text-[12.5px]" style={{ color: tone.ink50 }}>
        ← {t.back}
      </Link>
      <PageHeader
        eyebrow={t.eyebrow(id)}
        title={t.title(profile?.name || id)}
        description={t.description}
      />
      <PublicProfileEditor
        linked={!!profile}
        unreachable={!!unreachable}
        profile={profile ?? null}
        targetAgentId={0}
        isOwn={false}
        canCreate={true}
        agentName={profile?.name || id}
        agentPhone={profile?.phone ?? null}
        agentLicense={profile?.license_number ?? null}
        adminPublicId={id}
      />
    </div>
  );
}
