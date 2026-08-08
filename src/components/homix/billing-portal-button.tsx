"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { useLocale } from "@/lib/i18n-client";

export function BillingPortalButton({
  className = "",
  label,
}: {
  className?: string;
  label?: string;
}) {
  const locale = useLocale();
  const resolvedLabel = label || (locale === "zh" ? "管理订阅与付款" : "Manage billing");
  const unavailable = locale === "zh" ? "付款管理页面暂时不可用。" : "Billing portal is unavailable.";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/stripe/customer-portal", {
        method: "POST",
      });
      const data = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !data.url) {
        throw new Error(locale === "en" ? data.error || unavailable : unavailable);
      }

      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : unavailable);
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={openPortal}
        disabled={loading}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-ink px-4 text-[13px] font-medium text-white transition hover:bg-ink-70 disabled:cursor-not-allowed disabled:opacity-55"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
        {resolvedLabel}
      </button>
      {error && <div className="mt-2 text-[12px] leading-5 text-homix-rose">{error}</div>}
    </div>
  );
}
