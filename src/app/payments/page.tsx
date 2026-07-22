import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { agents, commerceOrders, type CommerceOrder } from "@/db/schema";
import { requireActiveAgent } from "@/lib/auth-guards";
import { tone, fmtMoney, fmtDate } from "@/components/homix/tokens";
import { Card, Pill, type PillTone } from "@/components/homix/server-primitives";
import { PageHeader } from "@/components/homix/page-kit";
import { getLocale } from "@/lib/i18n";

export const metadata: Metadata = { title: "Payments · Homix Deals" };

const M = {
  en: {
    eyebrow: "Fee tracking",
    title: "Agent payments",
    description: "Every desk fee, membership, and one-time charge collected through Stripe.",
    totalCollected: "Collected (all time)",
    monthCollected: "Collected this month",
    activeSubs: "Active subscriptions",
    pendingOrders: "Open / pending",
    byAgent: "By agent",
    byAgentLead: "Who has paid what — totals include paid one-time charges and activated subscriptions.",
    ledger: "Full ledger",
    ledgerLead: "Newest first. Subscription renewals appear on the Stripe invoice, not as new rows.",
    colAgent: "Agent",
    colTotal: "Total paid",
    colItems: "Items",
    colDate: "Date",
    colProduct: "Product",
    colAmount: "Amount",
    colMode: "Type",
    colStatus: "Status",
    oneTime: "One-time",
    subscription: "Subscription",
    unmatched: "(not on roster)",
    empty: "No payments recorded yet.",
  },
  zh: {
    eyebrow: "费用追踪",
    title: "经纪人缴费",
    description: "所有通过 Stripe 收取的桌费、会员费与一次性费用。",
    totalCollected: "累计已收",
    monthCollected: "本月已收",
    activeSubs: "生效中的订阅",
    pendingOrders: "待支付 / 进行中",
    byAgent: "按经纪人汇总",
    byAgentLead: "谁付了什么——合计含已支付的一次性费用与已生效的订阅。",
    ledger: "全部流水",
    ledgerLead: "最新在前。订阅的后续扣款体现在 Stripe 账单里，不再新增行。",
    colAgent: "经纪人",
    colTotal: "累计缴费",
    colItems: "缴费项目",
    colDate: "日期",
    colProduct: "项目",
    colAmount: "金额",
    colMode: "类型",
    colStatus: "状态",
    oneTime: "一次性",
    subscription: "订阅",
    unmatched: "（不在花名册）",
    empty: "暂无缴费记录。",
  },
} as const;

/** Order states that mean money actually arrived. */
const PAID_STATUSES = new Set(["paid", "active"]);

const STATUS_TONE: Record<string, PillTone> = {
  paid: "sent",
  active: "sent",
  pending: "draft",
  open: "draft",
  past_due: "failed",
  expired: "neutral",
  canceled: "neutral",
};

function orderDate(o: CommerceOrder): string {
  return o.paidAt || o.createdAt || "";
}

export default async function PaymentsPage() {
  const session = await requireActiveAgent();
  if (!session.user.isAdmin) redirect("/");
  const t = M[await getLocale()];

  const [orders, roster] = await Promise.all([
    db.select().from(commerceOrders).orderBy(desc(commerceOrders.id)),
    db.select({ id: agents.id, name: agents.name, email: agents.email }).from(agents),
  ]);

  const agentByEmail = new Map(
    roster.map((a) => [String(a.email || "").toLowerCase(), a]),
  );
  const agentFor = (o: CommerceOrder) =>
    agentByEmail.get(String(o.customerEmail || "").toLowerCase());

  const paid = orders.filter((o) => PAID_STATUSES.has(o.status));
  const monthKey = new Date().toISOString().slice(0, 7);
  const totalCents = paid.reduce((s, o) => s + o.amountCents, 0);
  const monthCents = paid
    .filter((o) => orderDate(o).startsWith(monthKey))
    .reduce((s, o) => s + o.amountCents, 0);
  const activeSubs = orders.filter(
    (o) => o.billingMode === "subscription" && o.status === "active",
  ).length;
  const pendingCount = orders.filter((o) =>
    ["pending", "open"].includes(o.status),
  ).length;

  // Per-payer rollup (keyed by email so off-roster payers still show up).
  const byPayer = new Map<
    string,
    { name: string; onRoster: boolean; cents: number; items: Map<string, number> }
  >();
  for (const o of paid) {
    const email = String(o.customerEmail || "—").toLowerCase();
    const agent = agentFor(o);
    const entry = byPayer.get(email) ?? {
      name: agent?.name || o.customerName || email,
      onRoster: Boolean(agent),
      cents: 0,
      items: new Map<string, number>(),
    };
    entry.cents += o.amountCents;
    entry.items.set(o.productName, (entry.items.get(o.productName) ?? 0) + 1);
    byPayer.set(email, entry);
  }
  const payers = [...byPayer.entries()].sort((a, b) => b[1].cents - a[1].cents);

  const stats = [
    { label: t.totalCollected, value: `$${fmtMoney(totalCents / 100)}` },
    { label: t.monthCollected, value: `$${fmtMoney(monthCents / 100)}` },
    { label: t.activeSubs, value: String(activeSubs) },
    { label: t.pendingOrders, value: String(pendingCount) },
  ];

  return (
    <div className="space-y-7">
      <PageHeader eyebrow={t.eyebrow} title={t.title} description={t.description} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="text-[12px]" style={{ color: tone.ink50 }}>
              {s.label}
            </div>
            <div className="font-serif mt-1 tabular-nums" style={{ fontSize: 24, color: tone.ink }}>
              {s.value}
            </div>
          </Card>
        ))}
      </div>

      {orders.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-[14px]" style={{ color: tone.ink50 }}>
            {t.empty}
          </p>
        </Card>
      ) : (
        <>
          <section>
            <h2 className="font-serif mb-1" style={{ fontSize: 20, color: tone.ink }}>
              {t.byAgent}
            </h2>
            <p className="text-[13px] mb-4" style={{ color: tone.ink50 }}>
              {t.byAgentLead}
            </p>
            <Card className="overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr style={{ color: tone.ink50 }}>
                    <th className="text-left font-medium px-5 py-3">{t.colAgent}</th>
                    <th className="text-right font-medium px-5 py-3">{t.colTotal}</th>
                    <th className="text-left font-medium px-5 py-3">{t.colItems}</th>
                  </tr>
                </thead>
                <tbody>
                  {payers.map(([email, p]) => (
                    <tr key={email} style={{ borderTop: `1px solid ${tone.lineSoft}` }}>
                      <td className="px-5 py-3">
                        <div style={{ color: tone.ink }}>
                          {p.name}
                          {!p.onRoster && (
                            <span className="ml-2 text-[11.5px]" style={{ color: tone.ink50 }}>
                              {t.unmatched}
                            </span>
                          )}
                        </div>
                        <div className="text-[11.5px] font-mono" style={{ color: tone.ink50 }}>
                          {email}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums" style={{ color: tone.ink }}>
                        ${fmtMoney(p.cents / 100)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {[...p.items.entries()].map(([product, n]) => (
                            <span
                              key={product}
                              className="rounded-full px-2.5 py-0.5 text-[11.5px]"
                              style={{ background: tone.paperDeep, color: tone.ink70 }}
                            >
                              {product}
                              {n > 1 ? ` ×${n}` : ""}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>

          <section>
            <h2 className="font-serif mb-1" style={{ fontSize: 20, color: tone.ink }}>
              {t.ledger}
            </h2>
            <p className="text-[13px] mb-4" style={{ color: tone.ink50 }}>
              {t.ledgerLead}
            </p>
            <Card className="overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr style={{ color: tone.ink50 }}>
                    <th className="text-left font-medium px-5 py-3">{t.colDate}</th>
                    <th className="text-left font-medium px-5 py-3">{t.colAgent}</th>
                    <th className="text-left font-medium px-5 py-3">{t.colProduct}</th>
                    <th className="text-right font-medium px-5 py-3">{t.colAmount}</th>
                    <th className="text-left font-medium px-5 py-3">{t.colMode}</th>
                    <th className="text-left font-medium px-5 py-3">{t.colStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const agent = agentFor(o);
                    return (
                      <tr key={o.id} style={{ borderTop: `1px solid ${tone.lineSoft}` }}>
                        <td className="px-5 py-3 whitespace-nowrap font-mono text-[12.5px]" style={{ color: tone.ink70 }}>
                          {fmtDate(orderDate(o).slice(0, 10))}
                        </td>
                        <td className="px-5 py-3">
                          <div style={{ color: tone.ink }}>
                            {agent?.name || o.customerName || "—"}
                          </div>
                          <div className="text-[11.5px] font-mono" style={{ color: tone.ink50 }}>
                            {o.customerEmail || ""}
                          </div>
                        </td>
                        <td className="px-5 py-3" style={{ color: tone.ink }}>
                          {o.productName}
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums" style={{ color: tone.ink }}>
                          ${fmtMoney(o.amountCents / 100)}
                        </td>
                        <td className="px-5 py-3" style={{ color: tone.ink70 }}>
                          {o.billingMode === "subscription" ? t.subscription : t.oneTime}
                        </td>
                        <td className="px-5 py-3">
                          <Pill tone={STATUS_TONE[o.status] ?? "neutral"}>{o.status}</Pill>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
