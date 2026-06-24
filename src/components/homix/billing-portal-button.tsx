"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";

export function BillingPortalButton({
  className = "",
  label = "Manage billing",
}: {
  className?: string;
  label?: string;
}) {
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
        throw new Error(data.error || "Billing portal is unavailable.");
      }

      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Billing portal is unavailable.");
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
        {label}
      </button>
      {error && <div className="mt-2 text-[12px] leading-5 text-homix-rose">{error}</div>}
    </div>
  );
}
