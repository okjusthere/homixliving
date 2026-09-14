"use client";

import { useRef, useState } from "react";
import { useLocale } from "@/lib/i18n-client";
import { nyDate } from "@/lib/celebrations/calendar";
import { dbDatePart, fmtTimestamp } from "@/lib/db-time";
import type { OnboardingRecords } from "./onboarding-special-actions";

export type OnboardingFee = {
  originalAmountCents: number;
  waivedAmountCents: number;
  dueAmountCents: number;
  adjustment: { reason: string; approvedAt: string; approvedBy: string | number } | null;
};
export type ReceiptMethod = "cash" | "check" | "ach" | "zelle" | "wire" | "other";
type Receipt = {
  amountCents: number;
  currency: "usd";
  method: ReceiptMethod;
  reference: string;
  receivedAt: string;
};
type Settlement =
  | { mode: "verified" }
  | { mode: "waiver"; waiverAmountCents: number; reason: string }
  | { mode: "payment"; waiverAmountCents: number; reason?: string; receiptId: string; receipt?: never }
  | { mode: "payment"; waiverAmountCents: number; reason?: string; receipt: Receipt; receiptId?: never };

export function parseMoneyCents(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= 100_000_000 ? cents : null;
}

export function receiptMissingReasons(
  input: { amount: string; method: string; reference: string; receivedAt: string },
  zh: boolean,
  today = nyDate(),
): string[] {
  const reasons: string[] = [];
  const cents = parseMoneyCents(input.amount);
  if (cents === null || cents <= 0) reasons.push(zh ? "请输入大于 0、最多两位小数的实际到账金额（上限 $1,000,000）。" : "Enter a positive amount with up to two decimal places (maximum $1,000,000).");
  if (input.method !== "cash" && !input.reference.trim()) reasons.push(zh ? "请填写支票号或交易凭据；现金可留空。" : "Enter the check or transaction reference; cash may leave it blank.");
  if (input.reference.trim().length > 120) reasons.push(zh ? "交易凭据最多 120 个字符。" : "Keep the reference within 120 characters.");
  const validDay = /^\d{4}-\d{2}-\d{2}$/.test(input.receivedAt) &&
    !Number.isNaN(Date.parse(input.receivedAt)) &&
    new Date(input.receivedAt).toISOString().slice(0, 10) === input.receivedAt;
  if (!validDay || input.receivedAt > today) reasons.push(zh ? "请选择有效的实际到账日期，不能晚于今天。" : "Choose a valid received date, no later than today.");
  return reasons;
}

export function completionRequest(settlement: Settlement, idempotencyKey: string) {
  return { action: "complete_onboarding" as const, idempotencyKey, confirmed: true as const, ...settlement };
}

export function onboardingActionError(error: unknown, zh: boolean) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const translations: Record<string, string> = {
    "Administrator access required": "需要管理员权限，请重新登录后重试。",
    "Agent not found": "未找到该经纪人，请刷新名册。",
    "Complete the person's profile first": "请先补全本人资料。",
    "Confirm team membership and compensation terms first": "请先确认团队归属和分佣条款。",
    "Receipt not found": "未找到收款记录，请刷新后重新选择。",
    "Enter the payment reference": "请填写支票号或交易凭据；现金可留空。",
    "Explain the company fee reduction (at least 5 characters)": "请填写减免依据，至少 5 个字符。",
    "Existing payments cannot be changed during approval": "已核验的付款不能在审批时修改，请刷新费用状态。",
    "This approval request was already used with different details": "此审批请求已用于不同资料，请核对资料后重试。",
    "This account is not pending. Refresh its current status before recording another payment.": "账号已不在待开通状态，请先刷新，勿重复登记收款。",
    "The agent has not signed the affiliation agreement.": "本人尚未签署入职协议。",
    "A verified offline receipt or an approved full waiver is required": "需要已核验的线下付款或已批准的全额减免。",
    "The fee is already paid. Use the existing verified payment instead of recording another receipt.": "费用已支付，请使用现有核验记录，勿重复登记收款。",
    "A full waiver must cover the entire onboarding fee": "全额减免须覆盖全部入职费用。",
    "Enter a valid fee reduction and the reason for approval": "请填写有效的减免金额及批准依据。",
    "Review the saved fee reduction before replacing it": "请先核对已有减免，不能在本流程直接清除已有减免。",
    "No payment is due. Use full waiver without a receipt.": "当前无应收款，请选择全额减免，不要生成收款记录。",
    "Select an unmatched actual receipt belonging to this agent": "请选择属于本人的待匹配实际收款记录。",
    "The operation could not be saved": "操作暂未完成，请使用相同资料重试。",
  };
  if (zh && translations[message]) return translations[message];
  if (zh && /Stripe checkout|unresolved Stripe checkouts/.test(message))
    return "存在尚未关闭或结果未确认的 Stripe 付款链接。请先到 Stripe 核对；关闭后重试，系统会再次确认。暂勿再次收款或批准减免。";
  // Keep the server's specific human-readable explanation, including quote errors.
  return message || (zh ? "未能确认结果，请保留当前资料重试。" : "The result could not be confirmed. Retry with the same details.");
}

const control = "admin-control mt-1 w-full";
const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function OnboardingCompletion({
  agentId, fee, accountStatus, paymentStatus, paymentChannel, canComplete,
  profileReady, signed, teamReady, warning, loading, busy: parentBusy,
  receipts, onChanged, onBusyChange, onRecordOnly,
}: {
  agentId: number;
  fee: OnboardingFee | null;
  accountStatus: string;
  paymentStatus: string;
  paymentChannel: string | null;
  canComplete: boolean;
  profileReady: boolean;
  signed: boolean;
  teamReady: boolean;
  warning: boolean;
  loading: boolean;
  busy: boolean;
  receipts: OnboardingRecords["receipts"];
  onChanged: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
  onRecordOnly: () => void;
}) {
  const zh = useLocale() === "zh";
  const [choice, setChoice] = useState<"payment" | "waiver">("payment");
  const [waiverKind, setWaiverKind] = useState<"full" | "partial">("full");
  const [waiverAmount, setWaiverAmount] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [receiptChoice, setReceiptChoice] = useState<string | null>(null);
  const [amount, setAmount] = useState<string | null>(null);
  const [method, setMethod] = useState<ReceiptMethod>("check");
  const [reference, setReference] = useState("");
  const [receivedAt, setReceivedAt] = useState(nyDate);
  const [confirmedDetails, setConfirmedDetails] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const submitting = useRef(false);
  // The same payload always reuses its UUID, including after a timeout or an A/B/A edit.
  const requestKeys = useRef(new Map<string, string>());
  const fullyWaived = Boolean(paymentStatus === "not_required" && fee?.adjustment && fee.dueAmountCents === 0 && fee.waivedAmountCents === fee.originalAmountCents);
  const verified = (paymentStatus === "paid" && paymentChannel === "offline") || fullyWaived;
  const fullWaiver = !verified && choice === "waiver" && waiverKind === "full";
  const totalWaiver = verified ? fee?.waivedAmountCents ?? 0 : choice === "waiver"
    ? fullWaiver ? fee?.originalAmountCents ?? 0 : parseMoneyCents(waiverAmount ?? String((fee?.waivedAmountCents ?? 0) / 100))
    : fee?.waivedAmountCents ?? 0;
  const due = fee && totalWaiver !== null ? fee.originalAmountCents - totalWaiver : null;
  const waiverReason = reason ?? fee?.adjustment?.reason ?? "";
  const requiresReason = !verified && (fullWaiver || (totalWaiver ?? 0) > 0 || totalWaiver !== fee?.waivedAmountCents);
  const unmatched = receipts.filter((r) => r.status === "unmatched");
  const selectedId = receiptChoice ?? unmatched.find((r) => r.amountCents === due && r.currency.toLowerCase() === "usd")?.id ?? "new";
  const existingReceipt = unmatched.find((r) => r.id === selectedId);
  const actualAmount = amount ?? (due !== null && due > 0 ? (due / 100).toFixed(2) : "");
  // A refreshed quote or receipt must be reviewed again, even if no field was edited.
  const confirmationDetails = JSON.stringify({
    agentId, fee, verified, fullWaiver, totalWaiver, waiverReason,
    selectedId, existingReceipt, actualAmount, method, reference, receivedAt,
  });
  const confirmed = confirmedDetails === confirmationDetails;
  const setConfirmed = (value: boolean) => setConfirmedDetails(value ? confirmationDetails : null);
  const reasons: string[] = [];
  if (loading) reasons.push(zh ? "正在刷新资料，请稍候。" : "Refreshing the latest details; please wait.");
  if (busy || parentBusy) reasons.push(zh ? "正在处理，请勿重复提交。" : "An operation is in progress; please wait.");
  if (accountStatus !== "pending") reasons.push(accountStatus === "active" ? (zh ? "账号已开通，无需重复审批；下方待办可继续跟进。" : "The account is already active. Follow up on remaining tasks below.") : (zh ? "仅待开通账号可使用此流程。" : "This flow is for pending accounts only."));
  if (!profileReady) reasons.push(zh ? "本人资料尚未补齐。" : "The agent profile is incomplete.");
  if (!signed) reasons.push(zh ? "本人合同要求尚未完成。" : "The agent contract requirement is incomplete.");
  if (!teamReady) reasons.push(zh ? "团队归属或分佣条款尚未确认。" : "Team membership or compensation terms are not confirmed.");
  if (warning) reasons.push(zh ? "请先刷新并核实签署状态。" : "Refresh and verify the signing status first.");
  if (!fee) reasons.push(zh ? "尚无有效费用报价，请刷新或补齐方案。" : "A fee quote is unavailable. Refresh or complete the plan details.");
  if (!canComplete && accountStatus === "pending" && profileReady && signed && teamReady) reasons.push(zh ? "服务端尚未确认可审批，请刷新状态。" : "The server has not confirmed approval readiness. Refresh the status.");
  if (!verified && paymentStatus === "paid") reasons.push(zh ? "费用已支付，请核对现有付款及自动开通结果，勿重复收款。" : "Payment is already recorded. Review that payment and automatic activation before proceeding.");
  if (!verified && (totalWaiver === null || totalWaiver < 0 || !fee || totalWaiver > fee.originalAmountCents || (!fullWaiver && due !== null && due <= 0))) reasons.push(zh ? "请核对减免金额；全额减免请选择「全额」。" : "Check the waiver amount. Choose Full for a full waiver.");
  if (!verified && fee?.adjustment && totalWaiver === 0) reasons.push(zh ? "请先核对已有减免；此流程不能直接清除已有减免。" : "Review the existing waiver first; this flow cannot clear a saved waiver.");
  if (requiresReason && waiverReason.trim().length < 5) reasons.push(zh ? "请填写减免或更正依据，至少 5 个字符。" : "Explain the waiver or correction in at least 5 characters.");
  if (!verified && !fullWaiver) {
    if (selectedId === "new") {
      reasons.push(...receiptMissingReasons({ amount: actualAmount, method, reference, receivedAt }, zh));
      if (parseMoneyCents(actualAmount) !== due) reasons.push(zh ? "实际到账金额须与本次应收一致；金额不同请先使用「仅登记收款」。" : "The receipt must equal the fee due. Use Record receipt only for a different amount.");
    } else if (!existingReceipt || existingReceipt.amountCents !== due || existingReceipt.currency.toLowerCase() !== "usd") reasons.push(zh ? "请选择金额等于应收美元金额的待匹配收款。" : "Select an unmatched USD receipt equal to the amount due.");
  }
  if (!confirmed) reasons.push(verified ? (zh ? "请确认现有核验记录并开通账号。" : "Confirm the existing verified record and activation.") : fullWaiver ? (zh ? "请确认公司全额减免及开通决定。" : "Confirm the full company waiver and activation.") : (zh ? "请确认款项已实际到账，并同意开通账号。" : "Confirm the money was actually received and approve activation."));

  const submit = async () => {
    if (reasons.length || submitting.current || !fee) return;
    let settlement: Settlement;
    if (verified) settlement = { mode: "verified" };
    else if (fullWaiver) settlement = { mode: "waiver", waiverAmountCents: fee.originalAmountCents, reason: waiverReason.trim() };
    else {
      const common = { mode: "payment" as const, waiverAmountCents: totalWaiver!, ...(requiresReason ? { reason: waiverReason.trim() } : {}) };
      settlement = selectedId === "new"
        ? { ...common, receipt: { amountCents: parseMoneyCents(actualAmount)!, currency: "usd", method, reference: reference.trim(), receivedAt } }
        : { ...common, receiptId: selectedId };
    }
    const signature = JSON.stringify({ agentId, ...settlement });
    const idempotencyKey = requestKeys.current.get(signature) ?? crypto.randomUUID();
    requestKeys.current.set(signature, idempotencyKey);
    submitting.current = true;
    setBusy(true); onBusyChange(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/admin/agents/${agentId}/onboarding/commands`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completionRequest(settlement, idempotencyKey)),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || (zh ? "操作未完成，请保留资料重试。" : "The operation did not complete. Retry with the same details."));
      setMessage(body.replayed ? (zh ? "已确认此前的开通结果。" : "The previous completion was confirmed.") : (zh ? "入职已批准，账号已开通。" : "Onboarding approved and account activated."));
      if (body.followUp?.publicProfileReady === false)
        setMessage(zh ? "账号已开通；官网同步尚未完成，已保留重试待办。无需重复审批或收款。" : "The account is active. Website sync needs a retry; do not repeat approval or payment.");
      setConfirmed(false);
      await onChanged();
    } catch (e) { setError(onboardingActionError(e, zh)); }
    finally { submitting.current = false; setBusy(false); onBusyChange(false); }
  };

  return <section className="space-y-3 rounded-xl border border-stone-200 p-4">
    <h3 className="font-medium">{zh ? "费用确认与开通" : "Confirm fee & activate"}</h3>
    {fee ? <>
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div><dt className="text-stone-500">{zh ? "原费用" : "Original fee"}</dt><dd className="mt-1 font-medium">{dollars(fee.originalAmountCents)}</dd></div>
        <div><dt className="text-stone-500">{zh ? "公司减免" : "Company waiver"}</dt><dd className="mt-1 font-medium">{dollars(fee.waivedAmountCents)}</dd></div>
        <div><dt className="text-stone-500">{zh ? "应收金额" : "Fee due"}</dt><dd className="mt-1 font-medium">{dollars(fee.dueAmountCents)}</dd></div>
      </dl>
      {fee.adjustment && <p className="text-xs text-stone-500">{fee.adjustment.reason} · {fee.adjustment.approvedBy} · {fmtTimestamp(fee.adjustment.approvedAt)}</p>}
    </> : <p className="text-sm text-amber-800">{zh ? "费用报价尚未取得。" : "Fee quote unavailable."}</p>}
    {accountStatus === "pending" && <>
      {verified ? <p className="text-sm text-green-800">{fullyWaived ? (zh ? "现有费用已全额减免，使用减免记录开通。" : "Use the existing full-waiver record to activate.") : (zh ? "线下付款已核验，直接确认开通。" : "Offline payment is verified. Confirm activation.")}</p> : <fieldset disabled={busy || parentBusy || loading} className="space-y-3">
        <legend className="sr-only">{zh ? "费用处理方式" : "Fee handling"}</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex gap-2"><input type="radio" name={`fee-mode-${agentId}`} checked={choice === "payment"} onChange={() => { setChoice("payment"); setConfirmed(false); setAmount(null); }} />{zh ? "实际收款" : "Money received"}</label>
          <label className="flex gap-2"><input type="radio" name={`fee-mode-${agentId}`} checked={choice === "waiver"} onChange={() => { setChoice("waiver"); setConfirmed(false); setAmount(null); }} />{zh ? "公司减免" : "Company waiver"}</label>
        </div>
        {choice === "waiver" && <>
          <label className="block text-sm">{zh ? "减免方式" : "Waiver type"}<select className={control} value={waiverKind} onChange={(e) => { setWaiverKind(e.target.value as "full" | "partial"); setConfirmed(false); setAmount(null); }}><option value="full">{zh ? "全额减免" : "Full waiver"}</option><option value="partial">{zh ? "部分减免，收取余额" : "Partial waiver; collect the balance"}</option></select></label>
          {waiverKind === "partial" && <label className="block text-sm">{zh ? "减免总额（美元，含已有减免）" : "Total waiver in USD (including any existing waiver)"}<input className={control} type="number" min="0" step="0.01" value={waiverAmount ?? String((fee?.waivedAmountCents ?? 0) / 100)} onChange={(e) => { setWaiverAmount(e.target.value); setAmount(null); setConfirmed(false); }} /></label>}
        </>}
        {requiresReason && <label className="block text-sm">{zh ? "减免 / 更正依据" : "Waiver / correction reason"}<textarea className={control} value={waiverReason} maxLength={2000} onChange={(e) => { setReason(e.target.value); setConfirmed(false); }} rows={2} /></label>}
        {fullWaiver ? <p className="text-sm text-stone-600">{zh ? "公司承担全额费用。此操作记录减免，不会生成收款记录。" : "The company waives the entire fee. This records a waiver and creates no receipt."}</p> : <>
          <p className="text-sm font-medium">{zh ? "本次须实际到账" : "Actual payment required"}: {due !== null && due >= 0 ? dollars(due) : "—"}</p>
          {unmatched.length > 0 && <label className="block text-sm">{zh ? "收款凭据" : "Receipt"}<select className={control} value={selectedId} onChange={(e) => { setReceiptChoice(e.target.value); setConfirmed(false); }}><option value="new">{zh ? "登记新到账款项" : "Record a new payment received"}</option>{unmatched.map((r) => <option key={r.id} value={r.id}>{dollars(r.amountCents)} · {dbDatePart(r.receivedAt)} · {r.method} · {r.reference || (zh ? "无凭据号" : "No reference")}</option>)}</select></label>}
          {selectedId === "new" ? <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">{zh ? "实际到账金额（美元）" : "Amount actually received (USD)"}<input className={control} type="number" min="0.01" max="1000000" step="0.01" value={actualAmount} onChange={(e) => { setAmount(e.target.value); setConfirmed(false); }} /></label>
            <label className="text-sm">{zh ? "收款方式" : "Payment method"}<select className={control} value={method} onChange={(e) => { setMethod(e.target.value as ReceiptMethod); setConfirmed(false); }}>{([['check', zh ? '支票' : 'Check'], ['cash', zh ? '现金' : 'Cash'], ['ach', 'ACH'], ['zelle', 'Zelle'], ['wire', zh ? '电汇' : 'Wire'], ['other', zh ? '其他' : 'Other']] as const).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-sm">{zh ? "交易凭据（现金可留空）" : "Reference (optional for cash)"}<input className={control} value={reference} maxLength={120} onChange={(e) => { setReference(e.target.value); setConfirmed(false); }} /></label>
            <label className="text-sm">{zh ? "实际到账日期" : "Received date"}<input className={control} type="date" value={receivedAt} max={nyDate()} onChange={(e) => { setReceivedAt(e.target.value); setConfirmed(false); }} /></label>
          </div> : <p className="text-sm text-stone-600">{zh ? "将复用所选待匹配收款，不重复登记。" : "The selected unmatched receipt will be reused without recording another payment."}</p>}
        </>}
      </fieldset>}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirmed} disabled={busy || parentBusy || loading} onChange={(e) => setConfirmed(e.target.checked)} />{verified ? (zh ? "已核对现有付款 / 减免记录，确认开通。" : "I checked the existing payment / waiver record and confirm activation.") : fullWaiver ? (zh ? "确认公司批准上述全额减免并开通账号。" : "I confirm company approval of this full waiver and account activation.") : (zh ? "确认公司已实际收到上述款项，且上述减免（如有）已获批准，确认开通。" : "I confirm the company actually received this payment, any waiver is approved, and the account should be activated.")}</label>
      <button className="admin-control" onClick={() => void submit()} disabled={reasons.length > 0} aria-describedby={`completion-reasons-${agentId}`}>{busy ? (zh ? "正在确认并开通…" : "Confirming & activating…") : fullWaiver ? (zh ? "确认减免并开通" : "Confirm waiver & activate") : (zh ? "确认并开通账号" : "Confirm & activate")}</button>
      <p className="text-xs text-stone-500">{zh ? "正常开通将自动沿用已关联的官网档案。" : "Normal activation automatically uses the linked website profile."}</p>
    </>}
    {reasons.length > 0 && <ul id={`completion-reasons-${agentId}`} className="space-y-1 text-xs text-stone-600" aria-live="polite">{(accountStatus === "active" ? reasons.slice(0, 1) : reasons).map((r) => <li key={r}>{r}</li>)}</ul>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="text-sm text-green-800">{message}</p>}
    <div className="border-t pt-3">
      <button className="admin-control" disabled={busy || parentBusy || loading} onClick={onRecordOnly}>{zh ? "仅登记实际收款" : "Record receipt only"}</button>
      <p className="mt-2 text-xs text-stone-500">{busy || parentBusy || loading ? (zh ? "请等待当前操作结束。" : "Wait for the current operation to finish.") : (zh ? "可在签署前登记已到账款项，或保留金额不同的款项待核对；此操作不会开通账号。" : "Available before signing, including different amounts that need reconciliation. Recording alone does not activate the account.")}</p>
    </div>
  </section>;
}
