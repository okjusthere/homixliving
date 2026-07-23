import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  agents,
  commerceCharges,
  commerceOrders,
  type CommerceCharge,
  type CommerceOrder,
} from "@/db/schema";
import { requireActiveAgent } from "@/lib/auth-guards";
import { tone, fmtMoney, fmtDate } from "@/components/homix/tokens";
import { Card, Pill, type PillTone } from "@/components/homix/server-primitives";
import { PageHeader } from "@/components/homix/page-kit";
import { SyncInvoicesButton } from "@/components/sync-invoices-button";
import { FinanceExportButton } from "@/components/finance-export-button";
import { getLocale } from "@/lib/i18n";

export const metadata: Metadata = { title: "Finance · Homix Deals" };

const M = {
  en: {
    eyebrow: "Finance",
    title: "Agent fee ledger",
    description:
      "Stripe paid totals after discounts and tax — before Stripe fees or refunds — with one row per charge.",
    totalCollected: "Stripe paid (all time)",
    monthCollected: "Stripe paid this month",
    activeSubs: "Active subscriptions",
    failedCharges: "Failed charges",
    byAgent: "By agent",
    byAgentLead: "Totals include one-time charges and every collected subscription invoice.",
    ledger: "Ledger",
    ledgerLead: "Newest first. Subscription renewals appear as their own rows.",
    fAgent: "Agent / email",
    fProduct: "Product",
    fStatus: "Status",
    fType: "Type",
    fFrom: "From",
    fTo: "To",
    fApply: "Filter",
    fReset: "Reset",
    fAll: "All",
    colAgent: "Agent",
    colTotal: "Total paid",
    colItems: "Items",
    colDate: "Date",
    colProduct: "Product",
    colAmount: "Amount",
    colType: "Type",
    colStatus: "Status",
    tOnetime: "One-time",
    tInitial: "Subscription · first",
    tRenewal: "Subscription · renewal",
    tSubOrder: "Subscription",
    unmatched: "(not on roster)",
    empty: "No records match the current filters.",
    resultCount: (n: number) => `${n} records`,
  },
  zh: {
    eyebrow: "财务",
    title: "经纪人缴费",
    description: "按 Stripe 实际支付总额统计优惠与税费后的收款；不代表扣除手续费或退款后的银行净入账。",
    totalCollected: "Stripe 累计已支付",
    monthCollected: "Stripe 本月已支付",
    activeSubs: "生效中的订阅",
    failedCharges: "扣款失败",
    byAgent: "按经纪人汇总",
    byAgentLead: "合计含一次性费用与每一期已收的订阅账单。",
    ledger: "对账流水",
    ledgerLead: "按时间倒序。订阅续费每期单独成行。",
    fAgent: "经纪人 / 邮箱",
    fProduct: "项目",
    fStatus: "状态",
    fType: "类型",
    fFrom: "起始日期",
    fTo: "截止日期",
    fApply: "筛选",
    fReset: "重置",
    fAll: "全部",
    colAgent: "经纪人",
    colTotal: "累计缴费",
    colItems: "缴费项目",
    colDate: "日期",
    colProduct: "项目",
    colAmount: "金额",
    colType: "类型",
    colStatus: "状态",
    tOnetime: "一次性",
    tInitial: "订阅 · 首期",
    tRenewal: "订阅 · 续费",
    tSubOrder: "订阅",
    unmatched: "（不在花名册）",
    empty: "当前筛选条件下没有记录。",
    resultCount: (n: number) => `${n} 条记录`,
  },
} as const;

const PAID_ORDER_STATUSES = new Set(["paid", "active"]);

const STATUS_TONE: Record<string, PillTone> = {
  paid: "sent",
  active: "sent",
  pending: "draft",
  open: "draft",
  failed: "failed",
  past_due: "failed",
  uncollectible: "failed",
  expired: "neutral",
  void: "neutral",
  canceled: "neutral",
  canceling: "draft",
};

type RowType = "onetime" | "initial" | "renewal" | "suborder";

interface LedgerRow {
  key: string;
  date: string;
  payerName: string;
  payerEmail: string;
  product: string;
  amountCents: number;
  type: RowType;
  status: string;
  isPaidMoney: boolean;
}

function orderDate(o: CommerceOrder): string {
  return o.paidAt || o.createdAt || "";
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    product?: string;
    status?: string;
    type?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const session = await requireActiveAgent();
  if (!session.user.isAdmin) redirect("/");
  const t = M[await getLocale()];
  const filters = await searchParams;

  const [orders, charges, roster] = await Promise.all([
    db.select().from(commerceOrders).orderBy(desc(commerceOrders.id)),
    db.select().from(commerceCharges).orderBy(desc(commerceCharges.id)),
    db.select({ id: agents.id, name: agents.name, email: agents.email }).from(agents),
  ]);

  const agentByEmail = new Map(roster.map((a) => [String(a.email || "").toLowerCase(), a]));
  const nameFor = (email: string | null, fallback: string | null) => {
    const agent = agentByEmail.get(String(email || "").toLowerCase());
    return {
      name: agent?.name || fallback || email || "—",
      onRoster: Boolean(agent),
    };
  };

  const typeLabel: Record<RowType, string> = {
    onetime: t.tOnetime,
    initial: t.tInitial,
    renewal: t.tRenewal,
    suborder: t.tSubOrder,
  };

  // Stripe history is returned newest-first, so local IDs do not indicate the
  // first billing cycle. Classify by the invoice period instead.
  const firstCharge = new Map<string, { id: number; date: string }>();
  for (const c of charges) {
    if (!c.stripeSubscriptionId) continue;
    const date = c.periodStart || c.paidAt || c.createdAt || "";
    const prev = firstCharge.get(c.stripeSubscriptionId);
    if (!prev || date < prev.date || (date === prev.date && c.id < prev.id)) {
      firstCharge.set(c.stripeSubscriptionId, { id: c.id, date });
    }
  }
  const chargedSubscriptions = new Set(
    charges.map((c) => c.stripeSubscriptionId).filter(Boolean) as string[],
  );

  const rows: LedgerRow[] = [];
  for (const c of charges as CommerceCharge[]) {
    rows.push({
      key: `c${c.id}`,
      date: c.paidAt || c.periodStart || c.createdAt || "",
      ...(() => {
        const { name } = nameFor(c.customerEmail, c.customerName);
        return { payerName: name, payerEmail: c.customerEmail || "" };
      })(),
      product: c.productName || "—",
      amountCents: c.amountCents,
      type:
        c.stripeSubscriptionId && firstCharge.get(c.stripeSubscriptionId)?.id !== c.id
          ? "renewal"
          : "initial",
      status: c.status,
      isPaidMoney: c.status === "paid",
    });
  }
  for (const o of orders as CommerceOrder[]) {
    const isSub = o.billingMode === "subscription";
    // Subscription orders whose invoices are in the charge ledger are fully
    // represented there — skip the order row to avoid double counting.
    if (isSub && o.stripeSubscriptionId && chargedSubscriptions.has(o.stripeSubscriptionId)) {
      continue;
    }
    const { name } = nameFor(o.customerEmail, o.customerName);
    rows.push({
      key: `o${o.id}`,
      date: orderDate(o),
      payerName: name,
      payerEmail: o.customerEmail || "",
      product: o.productName,
      amountCents: o.amountCents,
      type: isSub ? "suborder" : "onetime",
      status: o.status,
      isPaidMoney: PAID_ORDER_STATUSES.has(o.status),
    });
  }
  rows.sort((a, b) => (a.date < b.date ? 1 : -1));

  // ---- Filters (server-side, via querystring) ----
  const q = (filters.q || "").trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (q && !r.payerName.toLowerCase().includes(q) && !r.payerEmail.toLowerCase().includes(q))
      return false;
    if (filters.product && r.product !== filters.product) return false;
    if (filters.status && r.status !== filters.status) return false;
    if (filters.type && r.type !== filters.type) return false;
    const day = r.date.slice(0, 10);
    if (filters.from && day < filters.from) return false;
    if (filters.to && day > filters.to) return false;
    return true;
  });

  const productOptions = [...new Set(rows.map((r) => r.product))].sort();
  const statusOptions = [...new Set(rows.map((r) => r.status))].sort();

  // ---- Stats + per-agent rollup (paid money only, never double counted) ----
  const paidRows = rows.filter((r) => r.isPaidMoney);
  const monthKey = new Date().toISOString().slice(0, 7);
  const totalCents = paidRows.reduce((s, r) => s + r.amountCents, 0);
  const monthCents = paidRows
    .filter((r) => r.date.startsWith(monthKey))
    .reduce((s, r) => s + r.amountCents, 0);
  const activeSubs = orders.filter(
    (o) => o.billingMode === "subscription" && o.status === "active",
  ).length;
  const failedCount = rows.filter((r) => ["failed", "past_due", "uncollectible"].includes(r.status))
    .length;

  const byPayer = new Map<
    string,
    { name: string; onRoster: boolean; cents: number; items: Map<string, number> }
  >();
  for (const r of paidRows) {
    const email = r.payerEmail.toLowerCase() || "—";
    const { name, onRoster } = nameFor(r.payerEmail, r.payerName);
    const entry = byPayer.get(email) ?? {
      name,
      onRoster,
      cents: 0,
      items: new Map<string, number>(),
    };
    entry.cents += r.amountCents;
    entry.items.set(r.product, (entry.items.get(r.product) ?? 0) + 1);
    byPayer.set(email, entry);
  }
  const payers = [...byPayer.entries()].sort((a, b) => b[1].cents - a[1].cents);

  const stats = [
    { label: t.totalCollected, value: `$${fmtMoney(totalCents / 100)}` },
    { label: t.monthCollected, value: `$${fmtMoney(monthCents / 100)}` },
    { label: t.activeSubs, value: String(activeSubs) },
    { label: t.failedCharges, value: String(failedCount) },
  ];

  const inputStyle = {
    border: `1px solid ${tone.lineSoft}`,
    background: tone.paperDeep,
    color: tone.ink,
  } as const;

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
                  <td
                    className="px-5 py-3 text-right font-mono tabular-nums"
                    style={{ color: tone.ink }}
                  >
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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
          <h2 className="font-serif" style={{ fontSize: 20, color: tone.ink }}>
            {t.ledger}
          </h2>
          <div className="flex items-center gap-2">
            <FinanceExportButton
              rows={filtered.map((r) => ({
                date: r.date,
                payerName: r.payerName,
                payerEmail: r.payerEmail,
                product: r.product,
                typeLabel: typeLabel[r.type],
                status: r.status,
                amountCents: r.amountCents,
              }))}
            />
            <SyncInvoicesButton />
          </div>
        </div>
        <p className="text-[13px] mb-4" style={{ color: tone.ink50 }}>
          {t.ledgerLead}
        </p>

        <Card className="p-4 mb-4">
          <form method="get" className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6 items-end">
            <label className="text-[12px]" style={{ color: tone.ink50 }}>
              {t.fAgent}
              <input
                name="q"
                defaultValue={filters.q || ""}
                className="mt-1 w-full rounded-md px-2.5 py-1.5 text-[13px]"
                style={inputStyle}
              />
            </label>
            <label className="text-[12px]" style={{ color: tone.ink50 }}>
              {t.fProduct}
              <select
                name="product"
                defaultValue={filters.product || ""}
                className="mt-1 w-full rounded-md px-2 py-1.5 text-[13px]"
                style={inputStyle}
              >
                <option value="">{t.fAll}</option>
                {productOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px]" style={{ color: tone.ink50 }}>
              {t.fStatus}
              <select
                name="status"
                defaultValue={filters.status || ""}
                className="mt-1 w-full rounded-md px-2 py-1.5 text-[13px]"
                style={inputStyle}
              >
                <option value="">{t.fAll}</option>
                {statusOptions.map((sVal) => (
                  <option key={sVal} value={sVal}>
                    {sVal}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px]" style={{ color: tone.ink50 }}>
              {t.fType}
              <select
                name="type"
                defaultValue={filters.type || ""}
                className="mt-1 w-full rounded-md px-2 py-1.5 text-[13px]"
                style={inputStyle}
              >
                <option value="">{t.fAll}</option>
                {(Object.keys(typeLabel) as RowType[]).map((k) => (
                  <option key={k} value={k}>
                    {typeLabel[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px]" style={{ color: tone.ink50 }}>
              {t.fFrom}
              <input
                type="date"
                name="from"
                defaultValue={filters.from || ""}
                className="mt-1 w-full rounded-md px-2 py-1.5 text-[13px]"
                style={inputStyle}
              />
            </label>
            <label className="text-[12px]" style={{ color: tone.ink50 }}>
              {t.fTo}
              <input
                type="date"
                name="to"
                defaultValue={filters.to || ""}
                className="mt-1 w-full rounded-md px-2 py-1.5 text-[13px]"
                style={inputStyle}
              />
            </label>
            <div className="flex items-center gap-2 sm:col-span-3 lg:col-span-6">
              <button
                type="submit"
                className="rounded-md px-3.5 py-1.5 text-[13px] font-medium"
                style={{ background: tone.ink, color: tone.paper }}
              >
                {t.fApply}
              </button>
              <a
                href="/finance"
                className="rounded-md px-3.5 py-1.5 text-[13px]"
                style={{ background: tone.paperDeep, color: tone.ink70 }}
              >
                {t.fReset}
              </a>
              <span className="ml-auto text-[12px]" style={{ color: tone.ink50 }}>
                {t.resultCount(filtered.length)}
              </span>
            </div>
          </form>
        </Card>

        {filtered.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-[14px]" style={{ color: tone.ink50 }}>
              {t.empty}
            </p>
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr style={{ color: tone.ink50 }}>
                  <th className="text-left font-medium px-5 py-3">{t.colDate}</th>
                  <th className="text-left font-medium px-5 py-3">{t.colAgent}</th>
                  <th className="text-left font-medium px-5 py-3">{t.colProduct}</th>
                  <th className="text-right font-medium px-5 py-3">{t.colAmount}</th>
                  <th className="text-left font-medium px-5 py-3">{t.colType}</th>
                  <th className="text-left font-medium px-5 py-3">{t.colStatus}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.key} style={{ borderTop: `1px solid ${tone.lineSoft}` }}>
                    <td
                      className="px-5 py-3 whitespace-nowrap font-mono text-[12.5px]"
                      style={{ color: tone.ink70 }}
                    >
                      {fmtDate(r.date.slice(0, 10))}
                    </td>
                    <td className="px-5 py-3">
                      <div style={{ color: tone.ink }}>{r.payerName}</div>
                      <div className="text-[11.5px] font-mono" style={{ color: tone.ink50 }}>
                        {r.payerEmail}
                      </div>
                    </td>
                    <td className="px-5 py-3" style={{ color: tone.ink }}>
                      {r.product}
                    </td>
                    <td
                      className="px-5 py-3 text-right font-mono tabular-nums"
                      style={{ color: tone.ink }}
                    >
                      ${fmtMoney(r.amountCents / 100)}
                    </td>
                    <td className="px-5 py-3" style={{ color: tone.ink70 }}>
                      {typeLabel[r.type]}
                    </td>
                    <td className="px-5 py-3">
                      <Pill tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  );
}
