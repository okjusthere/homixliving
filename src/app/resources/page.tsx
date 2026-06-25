import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { resources, type Resource } from "@/db/schema";
import { requireActiveAgent } from "@/lib/auth-guards";
import { tone } from "@/components/homix/tokens";
import { Card, Pill } from "@/components/homix/server-primitives";
import { PageHeader, CardHeader } from "@/components/homix/page-kit";
import { ResourceManager } from "@/components/resources/resource-manager";
import { getLocale } from "@/lib/i18n";

export const metadata: Metadata = { title: "Resources · Homix Deals" };

const M = {
  en: {
    eyebrow: "Agent resources",
    title: "Resource library",
    description: "SOPs, scripts, templates and brand assets.",
    emptyAdmin: "No resources yet — add one above.",
    emptyAgent: "Resources are being added. Check back soon.",
    hidden: "Hidden",
    open: "Open ↗",
  },
  zh: {
    eyebrow: "经纪人资料",
    title: "资料库",
    description: "标准流程、话术、模板和品牌素材。",
    emptyAdmin: "暂无资料 — 请在上方添加。",
    emptyAgent: "资料正在添加中，敬请稍后查看。",
    hidden: "隐藏",
    open: "打开 ↗",
  },
} as const;

function groupByCategory(items: Resource[]): [string, Resource[]][] {
  const map = new Map<string, Resource[]>();
  for (const it of items) {
    const key = it.category || "General";
    const arr = map.get(key) ?? [];
    arr.push(it);
    map.set(key, arr);
  }
  return Array.from(map.entries());
}

export default async function ResourcesPage() {
  const session = await requireActiveAgent();
  const isAdmin = !!session.user.isAdmin;
  const t = M[await getLocale()];

  const all = await db
    .select()
    .from(resources)
    .orderBy(asc(resources.sortOrder), asc(resources.id));
  const visible = isAdmin ? all : all.filter((r) => r.isPublished);
  const groups = groupByCategory(visible);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
      />

      {isAdmin && <ResourceManager initialResources={all} />}

      {visible.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-[14px]" style={{ color: tone.ink50 }}>
            {isAdmin ? t.emptyAdmin : t.emptyAgent}
          </p>
        </Card>
      ) : (
        <div className="space-y-12">
          {groups.map(([category, items]) => (
            <section key={category}>
              <h2 className="font-serif mb-4" style={{ fontSize: 20, color: tone.ink }}>
                {category}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((r) => (
                  <Card key={r.id} className="flex flex-col">
                    <CardHeader
                      title={r.title}
                      action={!r.isPublished ? <Pill tone="draft">{t.hidden}</Pill> : undefined}
                    />
                    <div className="flex flex-1 flex-col p-5">
                      {r.description && (
                        <p className="flex-1 text-[13px] leading-relaxed" style={{ color: tone.ink70 }}>
                          {r.description}
                        </p>
                      )}
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium"
                        style={{ color: tone.accent }}
                      >
                        {t.open}
                      </a>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
