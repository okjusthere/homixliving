"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Card, EditorialInput } from "@/components/homix/primitives";
import { CardHeader } from "@/components/homix/page-kit";
import { fmtDate, fmtMoney, tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";
import type { Agent, AgentPayout } from "@/db/schema";

// Masked payment state — full routing/account digits never reach the client.
export type SafePaymentProfile = {
  bankName: string | null;
  accountType: string | null;
  accountLast4: string | null;
  hasAch: boolean;
  hasW9: boolean;
  w9FileName: string | null;
  w9UploadedAt: string | null;
};

const M = {
  en: {
    basicTitle: "Basic info",
    basicLead: "Email and commission split are managed by the office.",
    name: "Name",
    phone: "Phone",
    license: "License number",
    email: "Email",
    split: "Commission split",
    save: "Save",
    saving: "Saving…",
    saved: "Saved.",
    saveFailed: "Save failed — please retry.",
    achTitle: "Payout account (ACH)",
    achLead:
      "Payouts run through QuickBooks/checks — this tells the office where to send your money. Only you and admins can see it.",
    bankName: "Bank name",
    accountType: "Account type",
    checking: "Checking",
    savings: "Savings",
    routing: "Routing number (9 digits)",
    account: "Account number",
    achOnFile: (last4: string) => `Account on file · ****${last4}`,
    achNone: "No payout account on file yet.",
    w9Title: "W-9",
    w9Lead: "Required before commission payouts and for the year-end 1099.",
    w9OnFile: (name: string, date: string) => `On file: ${name} · ${date}`,
    w9None: "No W-9 on file yet.",
    w9View: "View ↗",
    w9Upload: "Upload W-9",
    w9Replace: "Replace W-9",
    w9Uploading: "Uploading…",
    w9Done: "W-9 uploaded.",
    w9Failed: "Upload failed — please retry.",
    payoutsTitle: "My payouts",
    payoutsLead: "Commission disbursements the office has recorded for you.",
    colDate: "Date",
    colAmount: "Amount",
    colMethod: "Method",
    colRef: "Reference",
    colMemo: "Memo",
    yearTotal: (y: string, v: string) => `${y} total: $${v}`,
    noPayouts: "No payouts recorded yet.",
  },
  zh: {
    basicTitle: "基本信息",
    basicLead: "邮箱与分成比例由公司管理。",
    name: "姓名",
    phone: "电话",
    license: "执照号",
    email: "邮箱",
    split: "分成比例",
    save: "保存",
    saving: "保存中…",
    saved: "已保存。",
    saveFailed: "保存失败，请重试。",
    achTitle: "收款账户（ACH）",
    achLead: "打款走 QuickBooks/支票——这里告诉公司把钱打到哪。仅你本人和管理员可见。",
    bankName: "银行名称",
    accountType: "账户类型",
    checking: "支票账户 Checking",
    savings: "储蓄账户 Savings",
    routing: "Routing Number（9 位）",
    account: "账号 Account Number",
    achOnFile: (last4: string) => `已登记账户 · ****${last4}`,
    achNone: "尚未登记收款账户。",
    w9Title: "W-9",
    w9Lead: "发放佣金与年末 1099 报税的前置材料。",
    w9OnFile: (name: string, date: string) => `已上传：${name} · ${date}`,
    w9None: "尚未上传 W-9。",
    w9View: "查看 ↗",
    w9Upload: "上传 W-9",
    w9Replace: "更换 W-9",
    w9Uploading: "上传中…",
    w9Done: "W-9 已上传。",
    w9Failed: "上传失败，请重试。",
    payoutsTitle: "我的收款记录",
    payoutsLead: "公司为你登记的每一笔佣金发放。",
    colDate: "日期",
    colAmount: "金额",
    colMethod: "方式",
    colRef: "参考号",
    colMemo: "备注",
    yearTotal: (y: string, v: string) => `${y} 年合计：$${v}`,
    noPayouts: "暂无发放记录。",
  },
} as const;

export function ProfileClient({
  agent,
  profile,
  payouts,
}: {
  agent: Agent | null;
  profile: SafePaymentProfile | null;
  payouts: AgentPayout[];
}) {
  const router = useRouter();
  const t = M[useLocale()];

  // --- basic info ---
  const [name, setName] = useState(agent?.name ?? "");
  const [phone, setPhone] = useState(agent?.phone ?? "");
  const [license, setLicense] = useState(agent?.licenseNumber ?? "");
  const [basicBusy, setBasicBusy] = useState(false);
  const [basicMsg, setBasicMsg] = useState<string | null>(null);

  async function saveBasic() {
    if (!agent) return;
    setBasicBusy(true);
    setBasicMsg(null);
    const res = await fetch("/api/agents", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: agent.id, name, phone, licenseNumber: license }),
    });
    setBasicBusy(false);
    setBasicMsg(res.ok ? t.saved : t.saveFailed);
    if (res.ok) router.refresh();
  }

  // --- ACH ---
  const [bankName, setBankName] = useState(profile?.bankName ?? "");
  const [accountType, setAccountType] = useState(profile?.accountType ?? "checking");
  const [routing, setRouting] = useState("");
  const [account, setAccount] = useState("");
  const [achBusy, setAchBusy] = useState(false);
  const [achMsg, setAchMsg] = useState<string | null>(null);
  const achLast4 = profile?.hasAch ? profile.accountLast4 : null;

  async function saveAch() {
    setAchBusy(true);
    setAchMsg(null);
    // Blank digit fields tell the server "keep what's on file".
    const res = await fetch("/api/profile/payment", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bankName,
        accountType,
        routingNumber: routing,
        accountNumber: account,
      }),
    });
    setAchBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setAchMsg(body.error || t.saveFailed);
      return;
    }
    setRouting("");
    setAccount("");
    setAchMsg(t.saved);
    router.refresh();
  }

  // --- W-9 ---
  const [w9Busy, setW9Busy] = useState(false);
  const [w9Msg, setW9Msg] = useState<string | null>(null);

  async function uploadW9(file: File | null) {
    if (!file) return;
    setW9Busy(true);
    setW9Msg(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/profile/w9", { method: "POST", body: form });
    setW9Busy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setW9Msg(body.error || t.w9Failed);
      return;
    }
    setW9Msg(t.w9Done);
    router.refresh();
  }

  // --- payouts ---
  const yearTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of payouts) {
      const y = (p.paidAt || "").slice(0, 4) || "—";
      map.set(y, (map.get(y) ?? 0) + p.amountCents);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [payouts]);

  const inputStyle = {
    border: `1px solid ${tone.lineSoft}`,
    background: tone.paperDeep,
    color: tone.ink,
  } as const;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="flex flex-col">
        <CardHeader title={t.basicTitle} />
        <div className="p-5 space-y-3">
          <p className="text-[12.5px]" style={{ color: tone.ink50 }}>
            {t.basicLead}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <EditorialInput value={name} onChange={setName} placeholder={t.name} />
            <EditorialInput value={phone} onChange={setPhone} placeholder={t.phone} />
            <EditorialInput value={license} onChange={setLicense} placeholder={t.license} mono />
            <div className="text-[13px] self-center" style={{ color: tone.ink50 }}>
              {t.email}: <span className="font-mono">{agent?.email}</span>
              {typeof agent?.splitPct === "number" && (
                <span className="ml-3">
                  {t.split}: {agent.splitPct}%
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Btn variant="primary" size="sm" onClick={saveBasic} disabled={basicBusy}>
              {basicBusy ? t.saving : t.save}
            </Btn>
            {basicMsg && (
              <span className="text-[12.5px]" style={{ color: tone.ink70 }}>
                {basicMsg}
              </span>
            )}
          </div>
        </div>
      </Card>

      <Card className="flex flex-col">
        <CardHeader title={t.achTitle} />
        <div className="p-5 space-y-3">
          <p className="text-[12.5px]" style={{ color: tone.ink50 }}>
            {t.achLead}
          </p>
          <p className="text-[13px]" style={{ color: achLast4 ? tone.green : tone.ink50 }}>
            {achLast4 ? t.achOnFile(achLast4) : t.achNone}
            {profile?.bankName && achLast4 ? ` · ${profile.bankName}` : ""}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <EditorialInput value={bankName} onChange={setBankName} placeholder={t.bankName} />
            <select
              value={accountType}
              onChange={(e) => setAccountType(e.target.value)}
              className="rounded-md px-3 py-2 text-[13px]"
              style={inputStyle}
            >
              <option value="checking">{t.checking}</option>
              <option value="savings">{t.savings}</option>
            </select>
            <EditorialInput value={routing} onChange={setRouting} placeholder={t.routing} mono />
            <EditorialInput value={account} onChange={setAccount} placeholder={t.account} mono />
          </div>
          <div className="flex items-center gap-3">
            <Btn variant="primary" size="sm" onClick={saveAch} disabled={achBusy}>
              {achBusy ? t.saving : t.save}
            </Btn>
            {achMsg && (
              <span className="text-[12.5px]" style={{ color: tone.ink70 }}>
                {achMsg}
              </span>
            )}
          </div>
        </div>
      </Card>

      <Card className="flex flex-col">
        <CardHeader title={t.w9Title} />
        <div className="p-5 space-y-3">
          <p className="text-[12.5px]" style={{ color: tone.ink50 }}>
            {t.w9Lead}
          </p>
          <p className="text-[13px]" style={{ color: profile?.hasW9 ? tone.green : tone.ink50 }}>
            {profile?.hasW9
              ? t.w9OnFile(profile.w9FileName || "W-9", fmtDate(profile.w9UploadedAt?.slice(0, 10)))
              : t.w9None}
            {profile?.hasW9 && (
              <a
                href="/api/profile/w9"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-3 font-medium"
                style={{ color: tone.accent }}
              >
                {t.w9View}
              </a>
            )}
          </p>
          <label
            className="inline-flex cursor-pointer items-center rounded-md px-3.5 py-2 text-[13px] font-medium"
            style={{ background: tone.ink, color: tone.paper, opacity: w9Busy ? 0.6 : 1 }}
          >
            {w9Busy ? t.w9Uploading : profile?.hasW9 ? t.w9Replace : t.w9Upload}
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              className="hidden"
              disabled={w9Busy}
              onChange={(e) => uploadW9(e.target.files?.[0] ?? null)}
            />
          </label>
          {w9Msg && (
            <p className="text-[12.5px]" style={{ color: tone.ink70 }}>
              {w9Msg}
            </p>
          )}
        </div>
      </Card>

      <Card className="flex flex-col">
        <CardHeader title={t.payoutsTitle} />
        <div className="p-5 space-y-3">
          <p className="text-[12.5px]" style={{ color: tone.ink50 }}>
            {t.payoutsLead}
          </p>
          {yearTotals.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {yearTotals.map(([y, cents]) => (
                <span
                  key={y}
                  className="rounded-full px-3 py-1 text-[12px] font-medium"
                  style={{ background: tone.paperDeep, color: tone.ink }}
                >
                  {t.yearTotal(y, fmtMoney(cents / 100))}
                </span>
              ))}
            </div>
          )}
          {payouts.length === 0 ? (
            <p className="text-[13px]" style={{ color: tone.ink50 }}>
              {t.noPayouts}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr style={{ color: tone.ink50 }}>
                    <th className="text-left font-medium py-2 pr-4">{t.colDate}</th>
                    <th className="text-right font-medium py-2 pr-4">{t.colAmount}</th>
                    <th className="text-left font-medium py-2 pr-4">{t.colMethod}</th>
                    <th className="text-left font-medium py-2 pr-4">{t.colRef}</th>
                    <th className="text-left font-medium py-2">{t.colMemo}</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((p) => (
                    <tr key={p.id} style={{ borderTop: `1px solid ${tone.lineSoft}` }}>
                      <td className="py-2 pr-4 font-mono text-[12.5px]" style={{ color: tone.ink70 }}>
                        {fmtDate(p.paidAt)}
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
                      <td className="py-2" style={{ color: tone.ink70 }}>
                        {p.memo || "—"}
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
