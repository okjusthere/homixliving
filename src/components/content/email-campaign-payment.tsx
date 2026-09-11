"use client";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CreditCard, LoaderCircle } from "lucide-react";
import { contentFetch } from "./ui";
import type { ListingEmailPayment } from "@/lib/commerce/listing-email-policy";

export function EmailCampaignPayment({ campaignId, zh, disabled, onVerified, onError }: {
  campaignId: string; zh: boolean; disabled: boolean;
  onVerified: (id: string, paid: boolean) => void;
  onError: (message: string) => void;
}) {
  const [payment, setPayment] = useState<ListingEmailPayment | null>(null);
  const [busy, setBusy] = useState(false);
  const check = useCallback(async () => {
    const result = await contentFetch<ListingEmailPayment>(`/api/marketing/email/campaigns/${campaignId}/payment`);
    setPayment(result);
    onVerified(campaignId, result.paid);
    return result;
  }, [campaignId, onVerified]);
  useEffect(() => {
    let live = true;
    const checkLive = async () => {
      try {
        const result = await contentFetch<ListingEmailPayment>(`/api/marketing/email/campaigns/${campaignId}/payment`);
        if (live) { setPayment(result); onVerified(campaignId, result.paid); }
      } catch (e) { if (live) onError(e instanceof Error ? e.message : "Payment check failed"); }
    };
    void checkLive();
    window.addEventListener("focus", checkLive);
    // Returning from Checkout may precede its webhook. The server reads the
    // verified Stripe session, so no success query parameter grants access.
    const timer = setInterval(checkLive, 15000);
    return () => { live = false; clearInterval(timer); window.removeEventListener("focus", checkLive); };
  }, [campaignId, onError, onVerified]);
  async function checkout() {
    setBusy(true);
    try {
      const result = await contentFetch<{ paid?: boolean; url?: string }>(`/api/marketing/email/campaigns/${campaignId}/checkout`, { method: "POST", body: "{}" });
      if (result.paid) await check();
      else if (result.url) window.location.assign(result.url);
      else throw new Error("Checkout unavailable");
    } catch (e) { onError(e instanceof Error ? e.message : "Checkout failed"); }
    finally { setBusy(false); }
  }
  return <section className="studio-section" aria-label={zh ? "群发费用" : "Campaign payment"}>
    <div className="studio-kicker">{zh ? "群发费用 · 每个任务" : "CAMPAIGN FEE · PER CAMPAIGN"}</div>
    <div className="flex items-baseline justify-between gap-3">
      <h2>{zh ? "Listing 邮件群发" : "Listing Email Blast"}</h2>
      <span className="font-mono text-[26px]">$22</span>
    </div>
    <p className="studio-note">{zh ? "付款后即可确认发送或定时群发。同一任务失败重试不重复收费；新任务需单独付款。" : "Pay before confirming or scheduling delivery. Retries of this campaign are included; a new campaign requires its own payment."}</p>
    {payment?.paid ? <p role="status" className="flex items-center gap-2 text-sm text-homix-green"><CheckCircle2 size={17} />{zh ? "已付款 · 此任务可发送" : "Paid · ready for this campaign"}</p> : <>
      <p className="studio-note" role="status">{!payment ? (zh ? "正在核实付款…" : "Checking payment…") : payment.status === "refunded" ? (zh ? "付款已退回，请联系管理员。" : "Payment reversed. Contact support.") : (zh ? "尚未完成付款" : "Payment required")}</p>
      <button className="studio-button" disabled={disabled || busy || !payment || payment.status === "refunded"} onClick={checkout}>
        {busy ? <LoaderCircle size={16} className="animate-spin" /> : <CreditCard size={16} />}
        {busy ? (zh ? "正在打开付款…" : "Opening checkout…") : (zh ? "支付 $22" : "Pay $22")}
      </button>
      <p className="studio-note">{zh ? "付款后返回此任务，由你确认发送。" : "Return here after payment to confirm delivery."}</p>
    </>}
  </section>;
}
