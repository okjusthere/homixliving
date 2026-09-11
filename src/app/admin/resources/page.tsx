import Link from "next/link";
import { requireAdmin } from "@/lib/auth-guards";
import { loadLibrary } from "@/lib/resource-library";
import { getCompanyW9DocumentMetadata } from "@/lib/company-w9";
import { getLocale } from "@/lib/i18n";
import { PageHeader } from "@/components/homix/page-kit";
import { ResourceManager } from "@/components/resources/resource-manager";
import { ChecklistManager } from "@/components/resources/checklist-manager";
import { CompanyDocuments } from "@/components/resources/company-documents";
export const metadata = { title: "Resource management · Homix" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAdmin();
  const zh = (await getLocale()) === "zh";
  const { tab = "library" } = await searchParams;
  const [[resources, checklist], documents] = await Promise.all([
    loadLibrary(true),
    getCompanyW9DocumentMetadata(),
  ]);
  const tabs = [
    ["library", "资料库", "Library"],
    ["checklists", "入职清单", "Checklists"],
    ["company-documents", "公司文件", "Company documents"],
  ];
  const current = tabs.some((t) => t[0] === tab) ? tab : "library";
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={zh ? "内容与培训" : "Content & learning"}
        title={zh ? "资料与公司文件" : "Resources & company documents"}
        actions={
          <Link className="admin-control" href="/resources">
            {zh ? "打开资料库 ↗" : "Open resource library ↗"}
          </Link>
        }
      />
      <nav
        aria-label={zh ? "资料管理视图" : "Resource views"}
        className="flex flex-wrap gap-2"
      >
        {tabs.map(([key, cn, en]) => (
          <Link
            key={key}
            className="admin-control"
            aria-current={key === current ? "page" : undefined}
            href={`?tab=${key}`}
          >
            {zh ? cn : en}
          </Link>
        ))}
      </nav>
      {current === "library" ? (
        <ResourceManager initialResources={resources} />
      ) : current === "checklists" ? (
        <ChecklistManager initialItems={checklist} />
      ) : (
        <CompanyDocuments initialW9s={documents} isAdmin />
      )}
    </div>
  );
}
