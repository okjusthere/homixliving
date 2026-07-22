"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Card, EditorialInput } from "@/components/homix/primitives";
import { CardHeader } from "@/components/homix/page-kit";
import { fmtDate, fmtMoney, tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";
import type { Agent, AgentPayout } from "@/db/schema";

// Masked readiness snapshot — full bank digits never reach the client.
type PaymentReadiness = {
  agentId: number;
  hasW9: boolean;
  hasAch: boolean;
  accountLast4: string | null;
};

const M = {
  en: {
    recordTitle: "Record a payout",
    recordLead:
      "This is the ledger only — send the money in QuickBooks / by check first, then log it here.",
    agent: "Agent",
    pickAgent: "Select agent…",
    amount: "Amount (USD)",
    paidAt: "Paid date",
    method: "Method",
    reference: "Reference (check # / ACH trace)",
    memo: "Memo",
    submit: "Record payout",
    submitting: "Recording…",
    recorded: "Recorded — the agent has been notified.",
    failed: "Failed — please retry.",
    readinessTitle: "Agent readiness",
    readinessLead: "W-9 and ACH info must be on file before money goes out.",
    w9: "W-9",
    ach: "ACH",
    view: "View ↗",
    missing: "Missing",
    ledgerTitle: "Payout ledger",
    allAgents: "All agents",
    allYears: "All years",
    colDate: "Date",
    colAgent: "Agent",
    colAmount: "Amount",
    colMethod: "Method",
    colRef: "Reference",
    colMemo: "Memo",
    colBy: "Recorded by",
    del: "Delete",
    delConfirm: "Delete this payout record? (The bank transfer itself is not affected.)",
    noRows: "No payout records match.",
    totalsTitle: "1099 totals",
    totalsLead: (y: string) => `Per-agent totals for ${y} — the year-end 1099-NEC figures.`,
    exportCsv: "Export CSV",
    filteredTotal: "Filtered total",
  },
  zh: {
    recordTitle: "登记发放",
    recordLead: "这里只是台账——先在 QuickBooks/支票完成实际打款，再来登记。",
    agent: "经纪人",
    pickAgent: "选择经纪人…",
    amount: "金额（美元）",
    paidAt: "打款日期",
    method: "方式",
    reference: "参考号（支票号 / ACH 流水）",
    memo: "备注",
    submit: "登记发放",
    submitting: "登记中…",
    recorded: "已登记，经纪人已收到通知。",
    failed: "登记失败，请重试。",
    readinessTitle: "材料齐备情况",
    readinessLead: "发钱前先确认 W-9 与收款账户已登记。",
    w9: "W-9",
    ach: "收款账户",
    view: "查看 ↗",
    missing: "缺",
    ledgerTitle: "发放台账",
    allAgents: "全部经纪人",
    allYears: "全部年份",
    colDate: "日期",
    colAgent: "经纪人",
    colAmount: "金额",
    colMethod: "方式",
    colRef: "参考号",
    colMemo: "备注",
    colBy: "登记人",
    del: "删除",
    delConfirm: "删除这条发放记录？（不影响银行实际转账。）",
    noRows: "没有符合条件的记录。",
    totalsTitle: "1099 合计",
    totalsLead: (y: string) => `${y} 年各经纪人合计——即年末 1099-NEC 数字。`,
    exportCsv: "导出 CSV",
    filteredTotal: "筛选合计",
  },
} as const;

const METHODS = ["ach", "check", "quickbooks", "zelle", "other"] as const;

export function PayoutsClient({
  agents,
  payouts,
  profiles,
}: {
  agents: Agent[];
  payouts: AgentPayout[];
  profiles: PaymentReadiness[];
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = M[locale];

  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const profileByAgent = useMemo(
    () => new Map(profiles.map((p) => [p.agentId, p])),
    [profiles],
  );

  const selectStyle = {
    border: `1px solid ${tone.line}`,
    background: tone.card,
    color: tone.ink,
  } as const;

  // --- record form ---
  const [formAgent, setFormAgent] = useState("");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("ach");
  const [reference, setReference] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    const cents = Math.round(parseFloat(amount) * 100);
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/payouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: Number(formAgent),
        amountCents: cents,
        paidAt,
        method,
        reference,
        memo,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setMsg(body.error || t.failed);
      return;
    }
    setAmount("");
    setReference("");
    setMemo("");
    setMsg(t.recorded);
    router.refresh();
  }

  async function remove(id: number) {
    if (!window.confirm(t.delConfirm)) return;
    const res = await fetch(`/api/payouts/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  // --- filters ---
  const [filterAgent, setFilterAgent] = useState("");
  const years = useMemo(() => {
    const set = new Set(payouts.map((p) => (p.paidAt || "").slice(0, 4)).filter(Boolean));
    return [...set].sort().reverse();
  }, [payouts]);
  const [filterYear, setFilterYear] = useState("");

  const filtered = useMemo(
    () =>
      payouts.filter(
        (p) =>
          (!filterAgent || p.agentId === Number(filterAgent)) &&
          (!filterYear || (p.paidAt || "").startsWith(filterYear)),
      ),
    [payouts, filterAgent, filterYear],
  );
  const filteredTotal = filtered.reduce((s, p) => s + p.amountCents, 0);

  // --- 1099 totals (per agent, for the selected/most-recent year) ---
  const totalsYear = filterYear || years[0] || "";
  const totals = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of payouts) {
      if (!totalsYear || !(p.paidAt || "").startsWith(totalsYear)) continue;
      map.set(p.agentId, (map.get(p.agentId) ?? 0) + p.amountCents);
    }
    return [...map.entries()]
      .map(([agentId, cents]) => ({ agentId, cents, agent: agentById.get(agentId) }))
      .sort((a, b) => b.cents - a.cents);
  }, [payouts, totalsYear, agentById]);

  function exportCsv() {
    const header = "Year,Agent,Email,License,Total Paid (USD)";
    const lines = totals.map((row) =>
      [
        totalsYear,
        JSON.stringify(row.agent?.name ?? `#${row.agentId}`),
        row.agent?.email ?? "",
        JSON.stringify(row.agent?.licenseNumber ?? ""),
        (row.cents / 100).toFixed(2),
      ].join(","),
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `homix-1099-totals-${totalsYear || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader title={t.recordTitle} />
          <div className="p-5 space-y-3">
            <p className="text-[12.5px]" style={{ color: tone.ink50 }}>
              {t.recordLead}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={formAgent}
                onChange={(e) => setFormAgent(e.target.value)}
                className="h-10 rounded-lg px-3 text-[13.5px]"
                style={selectStyle}
              >
                <option value="">{t.pickAgent}</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <EditorialInput value={amount} onChange={setAmount} placeholder={t.amount} prefix="$" mono />
              <EditorialInput value={paidAt} onChange={setPaidAt} type="date" placeholder={t.paidAt} mono />
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="h-10 rounded-lg px-3 text-[13.5px]"
                style={selectStyle}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m.toUpperCase()}
                  </option>
                ))}
              </select>
              <EditorialInput value={reference} onChange={setReference} placeholder={t.reference} mono />
              <EditorialInput value={memo} onChange={setMemo} placeholder={t.memo} />
            </div>
            <div className="flex items-center gap-3">
              <Btn
                variant="primary"
                size="sm"
                onClick={submit}
                disabled={busy || !formAgent || !(parseFloat(amount) > 0)}
              >
                {busy ? t.submitting : t.submit}
              </Btn>
              {msg && (
                <span className="text-[12.5px]" style={{ color: tone.ink70 }}>
                  {msg}
                </span>
              )}
            </div>
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHeader title={t.readinessTitle} />
          <div className="p-5 space-y-3">
            <p className="text-[12.5px]" style={{ color: tone.ink50 }}>
              {t.readinessLead}
            </p>
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr style={{ color: tone.ink50 }}>
                    <th className="text-left font-medium py-1.5 pr-4">{t.agent}</th>
                    <th className="text-left font-medium py-1.5 pr-4">{t.w9}</th>
                    <th className="text-left font-medium py-1.5">{t.ach}</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => {
                    const p = profileByAgent.get(a.id);
                    return (
                      <tr key={a.id} style={{ borderTop: `1px solid ${tone.lineSoft}` }}>
                        <td className="py-1.5 pr-4" style={{ color: tone.ink }}>
                          {a.name}
                        </td>
                        <td className="py-1.5 pr-4">
                          {p?.hasW9 ? (
                            <a
                              href={`/api/agents/${a.id}/w9`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium"
                              style={{ color: tone.green }}
                            >
                              ✓ {t.view}
                            </a>
                          ) : (
                            <span style={{ color: tone.rose }}>✗ {t.missing}</span>
                          )}
                        </td>
                        <td className="py-1.5">
                          {p?.hasAch ? (
                            <span style={{ color: tone.green }}>
                              ✓ ****{p.accountLast4}
                            </span>
                          ) : (
                            <span style={{ color: tone.rose }}>✗ {t.missing}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      </div>

      <Card className="flex flex-col">
        <CardHeader
          title={t.totalsTitle}
          action={
            <Btn size="sm" onClick={exportCsv} disabled={totals.length === 0}>
              {t.exportCsv}
            </Btn>
          }
        />
        <div className="p-5 space-y-3">
          <p className="text-[12.5px]" style={{ color: tone.ink50 }}>
            {t.totalsLead(totalsYear || "—")}
          </p>
          <div className="flex flex-wrap gap-2">
            {totals.length === 0 ? (
              <p className="text-[13px]" style={{ color: tone.ink50 }}>
                {t.noRows}
              </p>
            ) : (
              totals.map((row) => (
                <span
                  key={row.agentId}
                  className="rounded-full px-3 py-1.5 text-[12.5px] font-medium"
                  style={{ background: tone.paperDeep, color: tone.ink }}
                >
                  {row.agent?.name ?? `#${row.agentId}`} · ${fmtMoney(row.cents / 100)}
                </span>
              ))
            )}
          </div>
        </div>
      </Card>

      <Card className="flex flex-col">
        <CardHeader
          title={t.ledgerTitle}
          action={
            <div className="flex items-center gap-2">
            <select
              value={filterAgent}
              onChange={(e) => setFilterAgent(e.target.value)}
              className="h-9 rounded-lg px-2.5 text-[12.5px]"
              style={selectStyle}
            >
              <option value="">{t.allAgents}</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="h-9 rounded-lg px-2.5 text-[12.5px]"
              style={selectStyle}
            >
              <option value="">{t.allYears}</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
              </select>
            </div>
          }
        />
        <div className="p-5 space-y-3">
          <p className="text-[12.5px]" style={{ color: tone.ink50 }}>
            {t.filteredTotal}: <span className="font-mono">${fmtMoney(filteredTotal / 100)}</span> ·{" "}
            {filtered.length} {locale === "zh" ? "条" : "records"}
          </p>
          {filtered.length === 0 ? (
            <p className="text-[13px]" style={{ color: tone.ink50 }}>
              {t.noRows}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr style={{ color: tone.ink50 }}>
                    <th className="text-left font-medium py-2 pr-4">{t.colDate}</th>
                    <th className="text-left font-medium py-2 pr-4">{t.colAgent}</th>
                    <th className="text-right font-medium py-2 pr-4">{t.colAmount}</th>
                    <th className="text-left font-medium py-2 pr-4">{t.colMethod}</th>
                    <th className="text-left font-medium py-2 pr-4">{t.colRef}</th>
                    <th className="text-left font-medium py-2 pr-4">{t.colMemo}</th>
                    <th className="text-left font-medium py-2 pr-4">{t.colBy}</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id} style={{ borderTop: `1px solid ${tone.lineSoft}` }}>
                      <td className="py-2 pr-4 font-mono text-[12.5px]" style={{ color: tone.ink70 }}>
                        {fmtDate(p.paidAt)}
                      </td>
                      <td className="py-2 pr-4" style={{ color: tone.ink }}>
                        {agentById.get(p.agentId)?.name ?? `#${p.agentId}`}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums" style={{ color: tone.ink }}>
                        ${fmtMoney(p.amountCents / 100)}
                      </td>
                      <td className="py-2 pr-4" style={{ color: tone.ink70 }}>
                        {p.method.toUpperCase()}
                      </td>
                      <td className="py-2 pr-4 font-mono text-[12px]" style={{ color: tone.ink70 }}>
                        {p.reference || "—"}
                      </td>
                      <td className="py-2 pr-4" style={{ color: tone.ink70 }}>
                        {p.memo || "—"}
                      </td>
                      <td className="py-2 pr-4 text-[12px]" style={{ color: tone.ink50 }}>
                        {p.createdByEmail || "—"}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => remove(p.id)}
                          className="text-[12px] font-medium"
                          style={{ color: tone.rose }}
                        >
                          {t.del}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
