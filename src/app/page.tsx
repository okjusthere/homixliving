import Link from "next/link";
import { db } from "@/db";
import { invoices, buildings } from "@/db/schema";
import { eq, count, sql } from "drizzle-orm";
import { tone, fmtMoney, fmtDate } from "@/components/homix/tokens";
import { Pill, Card } from "@/components/homix/server-primitives";
import { IconChev } from "@/components/homix/icons";
import { DashboardCTA } from "@/components/homix/dashboard-cta";

export const dynamic = "force-dynamic";

function Stat({
  label,
  value,
  sub,
  toneKey = "ink",
  big,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  toneKey?: "ink" | "accent" | "green" | "amber";
  big?: boolean;
}) {
  const color =
    toneKey === "accent"
      ? tone.accent
      : toneKey === "green"
      ? tone.green
      : toneKey === "amber"
      ? tone.amber
      : tone.ink;
  return (
    <div style={{ padding: "22px 24px" }}>
      <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: tone.ink50 }}>
        {label}
      </div>
      <div
        className="font-serif"
        style={{
          fontSize: big ? 56 : 42,
          lineHeight: 1,
          marginTop: 10,
          letterSpacing: "-0.02em",
          color,
        }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[12px] mt-2" style={{ color: tone.ink50 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default async function Dashboard() {
  const [totalBuildingsRow] = await db.select({ count: count() }).from(buildings);
  const [totalInvoicesRow] = await db.select({ count: count() }).from(invoices);
  const [sentInvoicesRow] = await db
    .select({ count: count() })
    .from(invoices)
    .where(eq(invoices.status, "sent"));
  const [draftInvoicesRow] = await db
    .select({ count: count() })
    .from(invoices)
    .where(eq(invoices.status, "draft"));
  const [failedInvoicesRow] = await db
    .select({ count: count() })
    .from(invoices)
    .where(eq(invoices.status, "failed"));
  const [totalAmountRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${invoices.totalAmount}), 0)` })
    .from(invoices);
  const [sentAmountRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${invoices.totalAmount}), 0)` })
    .from(invoices)
    .where(eq(invoices.status, "sent"));
  const [draftAmountRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${invoices.totalAmount}), 0)` })
    .from(invoices)
    .where(eq(invoices.status, "draft"));
  const [outOfStateRow] = await db
    .select({ count: count() })
    .from(buildings)
    .where(eq(buildings.isOutOfState, true));

  const recentInvoices = await db
    .select({
      invoice: invoices,
      buildingName: buildings.name,
      buildingRegion: buildings.region,
      buildingManagement: buildings.managementCompany,
    })
    .from(invoices)
    .leftJoin(buildings, eq(invoices.buildingId, buildings.id))
    .orderBy(sql`${invoices.createdAt} DESC`)
    .limit(5);

  // Top buildings by invoice volume
  const topBuildings = await db
    .select({
      id: buildings.id,
      name: buildings.name,
      region: buildings.region,
      managementCompany: buildings.managementCompany,
      count: sql<number>`COUNT(${invoices.id})`,
    })
    .from(buildings)
    .leftJoin(invoices, eq(invoices.buildingId, buildings.id))
    .groupBy(buildings.id)
    .orderBy(sql`COUNT(${invoices.id}) DESC`, buildings.name)
    .limit(5);

  const now = new Date();
  const longDate = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const maxCount = Math.max(1, ...topBuildings.map((b) => Number(b.count || 0)));

  return (
    <div className="space-y-10">
      {/* Editorial Hero */}
      <div className="flex items-end justify-between pt-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] mb-3" style={{ color: tone.ink50 }}>
            {longDate}
          </div>
          <h1
            className="font-serif"
            style={{
              fontSize: 68,
              lineHeight: 0.95,
              letterSpacing: "-0.02em",
              color: tone.ink,
            }}
          >
            {greeting}.
          </h1>
          <p className="mt-4 text-[15px] max-w-xl" style={{ color: tone.ink70 }}>
            {draftInvoicesRow.count} invoice{draftInvoicesRow.count === 1 ? "" : "s"} waiting to send
            {failedInvoicesRow.count > 0 && `, ${failedInvoicesRow.count} need attention`}.
            {" "}
            <span style={{ color: tone.ink }}>
              ${fmtMoney(Number(draftAmountRow.total || 0))}
            </span>{" "}
            in draft.
          </p>
        </div>
        <DashboardCTA />
      </div>

      {/* KPI ribbon */}
      <Card style={{ overflow: "hidden" }}>
        <div className="grid grid-cols-4">
          <div style={{ borderRight: `1px solid ${tone.line}` }}>
            <Stat
              label="Invoiced YTD"
              value={`$${fmtMoney(Number(totalAmountRow.total || 0))}`}
              sub={`Across ${totalInvoicesRow.count} invoice${totalInvoicesRow.count === 1 ? "" : "s"}`}
              big
            />
          </div>
          <div style={{ borderRight: `1px solid ${tone.line}` }}>
            <Stat
              label="Sent"
              value={sentInvoicesRow.count}
              sub={`$${fmtMoney(Number(sentAmountRow.total || 0))} collected`}
              toneKey="green"
            />
          </div>
          <div style={{ borderRight: `1px solid ${tone.line}` }}>
            <Stat
              label="Draft"
              value={draftInvoicesRow.count}
              sub={`$${fmtMoney(Number(draftAmountRow.total || 0))} pending`}
              toneKey="amber"
            />
          </div>
          <div>
            <Stat
              label="Buildings"
              value={totalBuildingsRow.count}
              sub={`${outOfStateRow.count} out of state`}
            />
          </div>
        </div>
      </Card>

      {/* Recent + Top buildings */}
      <div className="grid grid-cols-3 gap-6">
        <Card className="col-span-2">
          <div
            className="flex items-center justify-between px-6 py-5"
            style={{ borderBottom: `1px solid ${tone.lineSoft}` }}
          >
            <div>
              <div
                className="font-serif"
                style={{ fontSize: 22, color: tone.ink, letterSpacing: "-0.01em" }}
              >
                Recent activity
              </div>
              <div className="text-[12px] mt-0.5" style={{ color: tone.ink50 }}>
                Last 5 invoices
              </div>
            </div>
            <Link
              href="/invoices"
              className="text-[13px] flex items-center gap-1"
              style={{ color: tone.ink70 }}
            >
              View all <IconChev />
            </Link>
          </div>
          <div>
            {recentInvoices.length === 0 ? (
              <div className="px-6 py-12 text-center text-[13px]" style={{ color: tone.ink50 }}>
                No invoices yet.{" "}
                <Link href="/invoices/new" className="underline">
                  Create your first
                </Link>
              </div>
            ) : (
              recentInvoices.map(({ invoice, buildingName }, i) => (
                <Link
                  key={invoice.id}
                  href={`/invoices/${invoice.id}`}
                  className="w-full flex items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-[#FAF7F0]"
                  style={{
                    borderBottom: i < recentInvoices.length - 1 ? `1px solid ${tone.lineSoft}` : "none",
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-md flex items-center justify-center font-serif"
                    style={{ background: tone.paperDeep, color: tone.ink70, fontSize: 17 }}
                  >
                    {(buildingName || "?").charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[13px]" style={{ color: tone.ink }}>
                      {invoice.invoiceNumber}
                    </div>
                    <div className="text-[12.5px] mt-0.5 truncate" style={{ color: tone.ink50 }}>
                      {buildingName || "—"} · Unit {invoice.unit} · {invoice.tenantName}
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className="font-serif"
                      style={{ fontSize: 19, color: tone.ink, lineHeight: 1, letterSpacing: "-0.01em" }}
                    >
                      ${fmtMoney(invoice.totalAmount)}
                    </div>
                    <div className="mt-1.5">
                      <Pill
                        tone={
                          invoice.status === "sent"
                            ? "sent"
                            : invoice.status === "failed"
                            ? "failed"
                            : "draft"
                        }
                      >
                        {invoice.status === "sent"
                          ? "Sent"
                          : invoice.status === "failed"
                          ? "Failed"
                          : "Draft"}
                      </Pill>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>

        <Card>
          <div className="px-6 py-5" style={{ borderBottom: `1px solid ${tone.lineSoft}` }}>
            <div
              className="font-serif"
              style={{ fontSize: 22, color: tone.ink, letterSpacing: "-0.01em" }}
            >
              Top buildings
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: tone.ink50 }}>
              By invoice volume
            </div>
          </div>
          <div className="px-6 py-2">
            {topBuildings.map((b, i) => (
              <div
                key={b.id}
                className="py-3"
                style={{ borderBottom: i < topBuildings.length - 1 ? `1px solid ${tone.lineSoft}` : "none" }}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] truncate" style={{ color: tone.ink }}>
                      {b.name}
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: tone.ink50 }}>
                      {b.region}
                      {b.managementCompany ? ` · ${b.managementCompany}` : ""}
                    </div>
                  </div>
                  <div className="font-mono text-[12px] ml-2" style={{ color: tone.ink }}>
                    {Number(b.count || 0)}
                  </div>
                </div>
                <div
                  className="mt-2 h-1 rounded-full overflow-hidden"
                  style={{ background: tone.paperDeep }}
                >
                  <div
                    style={{
                      width: `${(Number(b.count || 0) / maxCount) * 100}%`,
                      height: "100%",
                      background: tone.accent,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// Suppress unused import lint
void fmtDate;
