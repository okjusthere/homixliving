"use client";
import { useState } from "react";
import type { DosConfirmation, LicenseRelease } from "@/lib/onboarding-license";
import { RELEASE_LABELS } from "@/lib/onboarding-license";
import { fmtTimestamp } from "@/lib/db-time";
import { useLocale } from "@/lib/i18n-client";

export type LicenseDetail = {
  legalName: string | null;
  licenseNumber: string | null;
  licensedCompanyId: string | null;
  licensedCompany: string | null;
  accountStatus: string;
  licenseRelease: LicenseRelease | null;
  dosConfirmation: DosConfirmation | null;
};
export function OnboardingLicenseCard({ agentId, agent, confirmed, busy, onBusy, onChanged }: {
  agentId: number; agent: LicenseDetail; confirmed: boolean; busy: boolean;
  onBusy: (value: boolean) => void; onChanged: () => Promise<void>;
}) {
  const zh = useLocale() === "zh";
  const [message, setMessage] = useState("");
  const release = agent.licenseRelease?.licenseNumber === agent.licenseNumber ? agent.licenseRelease : null;
  const company = agent.licensedCompanyId === "homix_realty" ? "Homix Realty Inc."
    : agent.licensedCompanyId === "homix_living" ? "Homix Living Inc." : null;
  const hasIdentity = Boolean(agent.legalName?.trim() && agent.licenseNumber?.trim() && company);
  async function save(value: boolean) {
    onBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/agents/${agentId}/onboarding/commands`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm_dos", confirmed: value,
          legalName: agent.legalName, licenseNumber: agent.licenseNumber, companyId: agent.licensedCompanyId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || (zh ? "未能保存，请刷新重试。" : "Could not save. Refresh and retry."));
      await onChanged();
      setMessage(zh ? "DOS 核实记录已保存；不会代签协议或改动付款。" : "DOS verification saved; signatures and payments are unchanged.");
    } catch (error) { setMessage((error as Error).message); }
    finally { onBusy(false); }
  }
  return <section className="space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
    <h3 className="font-medium">{zh ? "执照接收 · DOS 人工核实" : "License affiliation · manual DOS verification"}</h3>
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      <div><dt className="text-stone-500">Legal name</dt><dd>{agent.legalName || "—"}</dd></div>
      <div><dt className="text-stone-500">License number</dt><dd className="flex items-center gap-2"><span className="font-mono">{agent.licenseNumber || "—"}</span>{agent.licenseNumber && <button type="button" className="text-xs underline" onClick={() => void navigator.clipboard.writeText(agent.licenseNumber!).then(() => setMessage(zh ? "执照号已复制" : "License copied")).catch(() => setMessage(zh ? "无法自动复制，请手动选择执照号。" : "Please select and copy the license manually."))}>{zh ? "复制" : "Copy"}</button>}</dd></div>
      <div><dt className="text-stone-500">{zh ? "拟加入公司" : "Target company"}</dt><dd>{company || "—"}</dd></div>
      <div><dt className="text-stone-500">{zh ? "本人申报的 release 状态" : "Applicant's release declaration"}</dt><dd>{release ? RELEASE_LABELS[release.status][zh ? 0 : 1] : (zh ? "尚未申报" : "Not declared")}</dd></div>
    </dl>
    {release && <p className="text-sm text-stone-600">{release.previousCompany || ""}{release.note ? ` · ${release.note}` : ""}<br />{zh ? "申报于 " : "Declared "}{fmtTimestamp(release.declaredAt)}</p>}
    {agent.accountStatus === "pending" ? <>
      <label className="flex items-start gap-2 text-sm font-medium">
        <input type="checkbox" className="mt-1" checked={confirmed} disabled={busy || !hasIdentity} onChange={(event) => void save(event.target.checked)} />
        <span>{zh ? `我已在 DOS 核实：该执照已正式关联至 ${company || "上述公司"}。` : `I verified in DOS that this license is now affiliated with ${company || "the selected company"}.`}</span>
      </label>
      {!hasIdentity && <p className="text-sm text-amber-800">{zh ? "请先补齐法定姓名、执照号及拟加入公司，才能核实。" : "Complete the legal name, license number and target company first."}</p>}
      <p className="text-xs text-stone-500">{zh ? "仅提交申请、等待 DOS 结果时不要勾选。未确认时可先签署和付款，但不能开通账号。" : "Do not check while a DOS request is only submitted or pending. Signing and payment may proceed, but access requires confirmation."}</p>
    </> : <p className="text-xs text-stone-500">{confirmed ? (zh ? "DOS 接收已核实。" : "DOS affiliation verified.") : (zh ? "未登记 DOS 核实记录；存量账号权限保持不变。" : "No DOS verification recorded; existing account access is unchanged.")}</p>}
    {confirmed && agent.dosConfirmation && <p className="text-xs text-stone-500">{agent.dosConfirmation.source === "authorized_legacy_backfill"
      ? (zh ? "管理员授权的存量确认（历史回填，非本次 DOS 在线核验）" : "Administrator-authorized historical confirmation (not a new live DOS lookup)")
      : `${zh ? "核实管理员" : "Verified by administrator"} #${agent.dosConfirmation.confirmedBy}`} · {fmtTimestamp(agent.dosConfirmation.confirmedAt)}</p>}
    {!confirmed && agent.dosConfirmation && <p className="text-xs text-amber-800">{zh ? "此前确认不适用于当前身份、公司或入职状态，请重新核实。" : "The prior confirmation does not apply to the current identity, company or onboarding status. Verify again."}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
