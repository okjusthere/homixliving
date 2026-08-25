"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Btn, Card, EditorialInput } from "@/components/homix/primitives";
import { CardHeader } from "@/components/homix/page-kit";
import { fmtDate, fmtMoney, tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";
import { isEmailChangeRequestActive } from "@/lib/email-change";
import type { AgentPayout } from "@/db/schema";
import type { MlsVerificationStatus } from "@/lib/public-identity-status";

export type SafeAgentProfile = {
  id: number;
  name: string;
  phone: string | null;
  licenseNumber: string | null;
  licenseExpiresAt: string | null;
  email: string;
  splitPct: number;
  pendingEmail: string | null;
  emailChangeRequestedAt: string | null;
};

// Masked payment state — full routing/account digits never reach the client.
export type SafePaymentProfile = {
  payeeType: string | null;
  payeeName: string | null;
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
    basicLead: "Contact details are self-service. Commission terms are managed by the office.",
    name: "Name",
    phone: "Phone",
    license: "License number",
    licenseExpires: "License expiry date",
    email: "Email",
    split: "Commission split",
    save: "Save",
    saving: "Saving…",
    saved: "Saved.",
    saveFailed: "Save failed — please retry.",
    emailChangeTitle: "Google login email",
    emailChangeLead:
      "Enter the new address, then verify it by signing in with that Google account. Your deals, team, and payouts stay on the same profile.",
    newEmail: "New Google email",
    requestEmailChange: "Change email",
    requestingEmailChange: "Saving…",
    pendingEmail: (email: string) => `Waiting for verification: ${email}`,
    pendingEmailLead:
      "This request is valid for 7 days. Sign out, choose the new Google account, and Homix will rebind this profile after Google verifies it.",
    verifyEmail: "Verify with Google",
    cancelEmailChange: "Cancel request",
    cancelingEmailChange: "Canceling…",
    emailInvalid: "Enter a valid email address.",
    emailSame: "That is already your login email.",
    emailInUse: "That email is already linked or waiting to be linked to another profile.",
    emailAdmin:
      "An admin must add the new address to ADMIN_EMAILS before changing this login.",
    emailChangeFailed: "Could not start the email change. Please retry.",
    mlsVerified: "Saved. MLS identity verified. Past sales appear when OneKey has eligible Closed records.",
    mlsUnavailable: "Saved. MLS verification is temporarily unavailable and will retry automatically.",
    mlsUnmatched: "Saved. This license has not matched the Homix OneKey roster. Check the number; the system retries daily.",
    mlsAmbiguous: "Saved. Multiple MLS records matched this license; ask the office to review it.",
    mlsClaimed: "Saved. This license is already linked to another website profile; ask the office to review it.",
    mlsUnlinked: "Saved. Your website profile is not linked yet; ask the office to link it.",
    mlsFailed: "Saved in the Portal, but the website sync did not finish. The office should review it.",
    achTitle: "Payout account (ACH)",
    achLead:
      "Payouts run through QuickBooks/checks — this tells the office where to send your money. Only you and admins can see it.",
    payeeType: "Payee",
    payeeIndividual: "Individual (my own name)",
    payeeBusiness: "Business entity (LLC / Corp)",
    payeeName: "Payee name (as on the bank account & W-9)",
    payeeHint:
      "If you get paid through your LLC, put the LLC's exact legal name here — the ACH and your 1099 will be issued to it. It must match your bank account title and your W-9.",
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
    referralTitle: "My referral link",
    referralLead: "Share this link with an agent you introduce to Homix. It records you as the sponsor without forcing the person into your team.",
    referralCreate: "Create referral link",
    referralEmail: "Specific email (optional)",
    referralCreating: "Creating…",
    referralCopy: "Copy link",
    referralCopied: "Link copied.",
    referralFailed: "Could not create the link.",
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
    basicLead: "联系方式可自行维护，佣金方案由公司管理。",
    name: "姓名",
    phone: "电话",
    license: "执照号",
    licenseExpires: "执照到期日",
    email: "邮箱",
    split: "分成比例",
    save: "保存",
    saving: "保存中…",
    saved: "已保存。",
    saveFailed: "保存失败，请重试。",
    emailChangeTitle: "Google 登录邮箱",
    emailChangeLead:
      "填写新邮箱后，需要用该 Google 账号重新登录完成验证。成交、团队、付款等资料仍保留在同一个档案下。",
    newEmail: "新的 Google 邮箱",
    requestEmailChange: "更换邮箱",
    requestingEmailChange: "保存中…",
    pendingEmail: (email: string) => `等待验证：${email}`,
    pendingEmailLead:
      "申请 7 天内有效。退出后选择新的 Google 账号登录，Google 验证成功后系统会自动完成换绑。",
    verifyEmail: "使用 Google 验证",
    cancelEmailChange: "取消申请",
    cancelingEmailChange: "取消中…",
    emailInvalid: "请输入有效邮箱。",
    emailSame: "这已经是当前登录邮箱。",
    emailInUse: "该邮箱已关联或正等待关联到其他档案。",
    emailAdmin: "管理员换绑前，需要先把新地址加入 ADMIN_EMAILS。",
    emailChangeFailed: "无法发起邮箱更换，请重试。",
    mlsVerified: "已保存，并已匹配 MLS 身份。OneKey 有可展示的 Closed 记录时，历史成交会自动出现。",
    mlsUnavailable: "已保存。MLS 暂时无法验证，系统会自动重试。",
    mlsUnmatched: "已保存，但该执照号尚未匹配 Homix 的 OneKey 名册。请核对号码；系统每天会自动重试。",
    mlsAmbiguous: "已保存，但该执照号匹配到多条 MLS 记录，请联系公司核对。",
    mlsClaimed: "已保存，但该执照号已关联另一份官网档案，请联系公司核对。",
    mlsUnlinked: "已保存，但你的官网主页尚未关联，请联系公司处理。",
    mlsFailed: "Portal 已保存，但官网同步未完成，请联系公司核对。",
    achTitle: "收款账户（ACH）",
    achLead: "打款走 QuickBooks/支票——这里告诉公司把钱打到哪。仅你本人和管理员可见。",
    payeeType: "收款主体",
    payeeIndividual: "个人（本人姓名）",
    payeeBusiness: "公司主体（LLC / Corp）",
    payeeName: "收款抬头（与银行账户、W-9 一致）",
    payeeHint:
      "如果你通过自己的 LLC 收款，这里填 LLC 的准确注册名——ACH 打款和年末 1099 都以此抬头开出，须与银行账户户名及 W-9 完全一致。",
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
    referralTitle: "我的推荐链接",
    referralLead: "把此链接发给你介绍加入 Homix 的经纪人。系统只会记录你为介绍人，不会强制对方加入你的团队。",
    referralCreate: "生成推荐链接",
    referralEmail: "限定邮箱（可选）",
    referralCreating: "正在生成…",
    referralCopy: "复制链接",
    referralCopied: "链接已复制。",
    referralFailed: "无法生成链接。",
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
  agent: SafeAgentProfile | null;
  profile: SafePaymentProfile | null;
  payouts: AgentPayout[];
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = M[locale];

  // --- basic info ---
  const [name, setName] = useState(agent?.name ?? "");
  const [phone, setPhone] = useState(agent?.phone ?? "");
  const [license, setLicense] = useState(agent?.licenseNumber ?? "");
  const [licenseExpires, setLicenseExpires] = useState(agent?.licenseExpiresAt ?? "");
  const [basicBusy, setBasicBusy] = useState(false);
  const [basicMsg, setBasicMsg] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState(
    agent?.pendingEmail && isEmailChangeRequestActive(agent.emailChangeRequestedAt)
      ? agent.pendingEmail
      : "",
  );
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);

  async function saveBasic() {
    if (!agent) return;
    setBasicBusy(true);
    setBasicMsg(null);
    const res = await fetch("/api/agents", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: agent.id,
        name,
        phone,
        licenseNumber: license,
        licenseExpiresAt: licenseExpires,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBasicBusy(false);
    if (!res.ok) {
      setBasicMsg(t.saveFailed);
      return;
    }
    const verificationStatus = body?.mlsVerification?.status as
      | MlsVerificationStatus
      | undefined;
    const messages: Partial<Record<MlsVerificationStatus, string>> = {
      verified: t.mlsVerified,
      unavailable: t.mlsUnavailable,
      unmatched: t.mlsUnmatched,
      ambiguous: t.mlsAmbiguous,
      claimed: t.mlsClaimed,
      unlinked: t.mlsUnlinked,
      failed: t.mlsFailed,
    };
    setBasicMsg((verificationStatus && messages[verificationStatus]) || t.saved);
    if (res.ok) router.refresh();
  }

  function emailErrorMessage(code: unknown) {
    switch (code) {
      case "INVALID_EMAIL":
        return t.emailInvalid;
      case "SAME_EMAIL":
        return t.emailSame;
      case "EMAIL_IN_USE":
        return t.emailInUse;
      case "ADMIN_EMAIL_NOT_CONFIGURED":
        return t.emailAdmin;
      default:
        return t.emailChangeFailed;
    }
  }

  async function requestEmailChange() {
    setEmailBusy(true);
    setEmailMsg(null);
    try {
      const response = await fetch("/api/profile/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: newEmail }),
      });
      const data = (await response.json().catch(() => null)) as
        | { pendingEmail?: string; code?: string }
        | null;
      if (!response.ok || !data?.pendingEmail) {
        setEmailMsg(emailErrorMessage(data?.code));
        return;
      }
      setPendingEmail(data.pendingEmail);
      setNewEmail("");
    } catch {
      setEmailMsg(t.emailChangeFailed);
    } finally {
      setEmailBusy(false);
    }
  }

  async function cancelEmailChange() {
    setEmailBusy(true);
    setEmailMsg(null);
    try {
      const response = await fetch("/api/profile/email", { method: "DELETE" });
      if (!response.ok) {
        setEmailMsg(t.emailChangeFailed);
        return;
      }
      setPendingEmail("");
    } catch {
      setEmailMsg(t.emailChangeFailed);
    } finally {
      setEmailBusy(false);
    }
  }

  async function verifyEmailChange() {
    await signOut({ redirectTo: "/login?switchAccount=1" });
  }

  // --- ACH ---
  const [payeeType, setPayeeType] = useState(profile?.payeeType ?? "individual");
  const [payeeName, setPayeeName] = useState(profile?.payeeName ?? "");
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
        payeeType,
        payeeName,
        bankName,
        accountType,
        routingNumber: routing,
        accountNumber: account,
      }),
    });
    setAchBusy(false);
    if (!res.ok) {
      setAchMsg(t.saveFailed);
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
      setW9Msg(t.w9Failed);
      return;
    }
    setW9Msg(t.w9Done);
    router.refresh();
  }

  // --- recruiting attribution ---
  const [referralBusy, setReferralBusy] = useState(false);
  const [referralUrl, setReferralUrl] = useState("");
  const [referralEmail, setReferralEmail] = useState("");
  const [referralMsg, setReferralMsg] = useState<string | null>(null);

  async function createReferralLink() {
    setReferralBusy(true);
    setReferralMsg(null);
    try {
      const response = await fetch("/api/onboarding/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "personal_referral",
          source: "direct",
          email: referralEmail.trim() || null,
          maxUses: referralEmail.trim() ? 1 : 100,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error();
      setReferralUrl(data.url);
    } catch {
      setReferralMsg(t.referralFailed);
    } finally {
      setReferralBusy(false);
    }
  }

  async function copyReferralLink() {
    if (!referralUrl) return;
    await navigator.clipboard.writeText(referralUrl);
    setReferralMsg(t.referralCopied);
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
            <EditorialInput
              value={licenseExpires}
              onChange={setLicenseExpires}
              placeholder={t.licenseExpires}
              type="date"
              mono
            />
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
          <div className="mt-4 border-t pt-4" style={{ borderColor: tone.lineSoft }}>
            <div className="text-[13.5px] font-medium" style={{ color: tone.ink }}>
              {t.emailChangeTitle}
            </div>
            <p className="mt-1 text-[12.5px] leading-5" style={{ color: tone.ink50 }}>
              {t.emailChangeLead}
            </p>
            {pendingEmail ? (
              <div className="mt-3 space-y-3 rounded-lg p-3" style={{ background: tone.paperDeep }}>
                <div>
                  <div className="break-all font-mono text-[13px]" style={{ color: tone.ink }}>
                    {t.pendingEmail(pendingEmail)}
                  </div>
                  <p className="mt-1 text-[12px] leading-5" style={{ color: tone.ink50 }}>
                    {t.pendingEmailLead}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Btn
                    variant="primary"
                    size="sm"
                    onClick={() => void verifyEmailChange()}
                    disabled={emailBusy}
                  >
                    {t.verifyEmail}
                  </Btn>
                  <Btn
                    variant="ghost"
                    size="sm"
                    onClick={() => void cancelEmailChange()}
                    disabled={emailBusy}
                  >
                    {emailBusy ? t.cancelingEmailChange : t.cancelEmailChange}
                  </Btn>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <EditorialInput
                  value={newEmail}
                  onChange={setNewEmail}
                  placeholder={t.newEmail}
                  type="email"
                  mono
                  className="flex-1"
                />
                <Btn
                  variant="outline"
                  size="sm"
                  onClick={() => void requestEmailChange()}
                  disabled={emailBusy || !newEmail.trim()}
                >
                  {emailBusy ? t.requestingEmailChange : t.requestEmailChange}
                </Btn>
              </div>
            )}
            {emailMsg && (
              <p className="mt-2 text-[12.5px]" style={{ color: tone.rose }}>
                {emailMsg}
              </p>
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
            {profile?.payeeName && achLast4 ? ` · ${profile.payeeName}` : ""}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              value={payeeType}
              onChange={(e) => {
                const next = e.target.value;
                setPayeeType(next);
                // Switching back to individual must not silently keep the old
                // LLC as the authoritative 1099/ACH payee.
                if (next === "individual" && payeeName === (profile?.payeeName ?? "")) {
                  setPayeeName("");
                }
              }}
              className="rounded-md px-3 py-2 text-[13px]"
              style={inputStyle}
              aria-label={t.payeeType}
            >
              <option value="individual">{t.payeeIndividual}</option>
              <option value="business">{t.payeeBusiness}</option>
            </select>
            <EditorialInput value={payeeName} onChange={setPayeeName} placeholder={t.payeeName} />
          </div>
          <p className="text-[12px]" style={{ color: tone.ink50 }}>
            {t.payeeHint}
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
        <CardHeader title={t.referralTitle} />
        <div className="space-y-3 p-5">
          <p className="text-[12.5px]" style={{ color: tone.ink50 }}>
            {t.referralLead}
          </p>
          {referralUrl ? (
            <div className="space-y-3">
              <div className="break-all rounded-md px-3 py-2 font-mono text-[12px]" style={inputStyle}>
                {referralUrl}
              </div>
              <Btn variant="primary" size="sm" onClick={() => void copyReferralLink()}>
                {t.referralCopy}
              </Btn>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <EditorialInput value={referralEmail} onChange={setReferralEmail} placeholder={t.referralEmail} type="email" className="flex-1" />
              <Btn variant="primary" size="sm" onClick={() => void createReferralLink()} disabled={referralBusy}>
                {referralBusy ? t.referralCreating : t.referralCreate}
              </Btn>
            </div>
          )}
          {referralMsg && (
            <p className="text-[12.5px]" style={{ color: tone.ink70 }}>
              {referralMsg}
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
