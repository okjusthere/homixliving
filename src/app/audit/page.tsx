import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { tone } from "@/components/homix/tokens";
import { Card, Pill } from "@/components/homix/server-primitives";
import { requireActiveAgent } from "@/lib/auth-guards";
import { getLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const M = {
  en: {
    title: "Audit Log",
    subtitle: "Who changed what — append-only, latest 200 entries",
    all: "All",
    time: "Time",
    actor: "Actor",
    action: "Action",
    entity: "Entity",
    summary: "Summary",
    empty: "No audit entries yet. Mutations are recorded from now on.",
  },
  zh: {
    title: "审计日志",
    subtitle: "谁在什么时候改了什么——只追加，显示最近 200 条",
    all: "全部",
    time: "时间",
    actor: "操作人",
    action: "动作",
    entity: "对象",
    summary: "摘要",
    empty: "还没有审计记录。从现在起所有写操作都会被记录。",
  },
} as const;

const ENTITY_LABELS: Record<string, { zh: string; en: string }> = {
  rental_deal: { zh: "租赁成交", en: "Rental" },
  sale_deal: { zh: "买卖成交", en: "Sale" },
  invoice: { zh: "发票", en: "Invoice" },
  agent: { zh: "经纪人", en: "Agent" },
  team: { zh: "团队", en: "Team" },
  setting: { zh: "设置", en: "Setting" },
  building: { zh: "楼盘", en: "Building" },
  training_video: { zh: "培训视频", en: "Training" },
  resource: { zh: "资料", en: "Resource" },
  deal_document: { zh: "成交文件", en: "Document" },
};

function actionTone(action: string): "neutral" | "sent" | "draft" | "failed" | "accent" {
  if (action.includes("delete") || action.includes("revoke")) return "failed";
  if (action.includes("create") || action.includes("approve")) return "sent";
  if (action.includes("paid")) return "accent";
  return "draft";
}

function fmtTs(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  const session = await requireActiveAgent();
  if (!session.user.isAdmin) redirect("/");

  const locale = await getLocale();
  const t = M[locale];
  const { entity } = await searchParams;
  const entityFilter = entity && ENTITY_LABELS[entity] ? entity : null;

  const rows = await db
    .select()
    .from(auditLog)
    .where(entityFilter ? eq(auditLog.entityType, entityFilter) : undefined)
    .orderBy(desc(auditLog.id))
    .limit(200);

  return (
    <div className="mx-auto max-w-[1280px] px-8 py-8">
      <div className="mb-6">
        <h1 className="font-serif" style={{ fontSize: 28, color: tone.ink }}>
          {t.title}
        </h1>
        <p className="text-[13px] mt-1" style={{ color: tone.ink50 }}>
          {t.subtitle}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        <Link
          href="/audit"
          className="px-3 py-1.5 rounded-md text-[12.5px]"
          style={{
            background: !entityFilter ? tone.ink : tone.paperDeep,
            color: !entityFilter ? "#fff" : tone.ink70,
          }}
        >
          {t.all}
        </Link>
        {Object.entries(ENTITY_LABELS).map(([key, label]) => (
          <Link
            key={key}
            href={`/audit?entity=${key}`}
            className="px-3 py-1.5 rounded-md text-[12.5px]"
            style={{
              background: entityFilter === key ? tone.ink : tone.paperDeep,
              color: entityFilter === key ? "#fff" : tone.ink70,
            }}
          >
            {label[locale]}
          </Link>
        ))}
      </div>

      <Card>
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-[13px]" style={{ color: tone.ink50 }}>
            {t.empty}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr style={{ color: tone.ink50, borderBottom: `1px solid ${tone.line}` }}>
                  <th className="text-left font-medium px-4 py-2.5 whitespace-nowrap">{t.time}</th>
                  <th className="text-left font-medium px-4 py-2.5 whitespace-nowrap">{t.actor}</th>
                  <th className="text-left font-medium px-4 py-2.5 whitespace-nowrap">{t.action}</th>
                  <th className="text-left font-medium px-4 py-2.5 whitespace-nowrap">{t.entity}</th>
                  <th className="text-left font-medium px-4 py-2.5 w-full">{t.summary}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    style={{ borderBottom: `1px solid ${tone.lineSoft}`, color: tone.ink70 }}
                  >
                    <td className="px-4 py-2.5 whitespace-nowrap font-mono text-[11.5px]">
                      {fmtTs(row.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap max-w-[180px] truncate">
                      {row.actorEmail || "—"}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <Pill tone={actionTone(row.action)}>{row.action}</Pill>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {(ENTITY_LABELS[row.entityType]?.[locale] || row.entityType) +
                        (row.entityId ? ` #${row.entityId}` : "")}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: tone.ink }}>
                      {row.summary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
