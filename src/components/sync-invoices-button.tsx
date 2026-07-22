"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/homix/primitives";
import { tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";

const M = {
  en: {
    sync: "Sync Stripe invoices",
    syncing: "Syncing…",
    done: (n: number, seen: number) => `Synced ${n}/${seen} invoices.`,
    failed: "Sync failed — please retry.",
    confirm:
      "Pull the full invoice history (including every subscription renewal) from Stripe? Existing rows update in place.",
  },
  zh: {
    sync: "同步 Stripe 账单",
    syncing: "同步中…",
    done: (n: number, seen: number) => `已入账 ${n}/${seen} 张发票。`,
    failed: "同步失败，请重试。",
    confirm: "从 Stripe 拉取全部账单历史（含每期订阅续费）？已有记录会原位更新，不会重复。",
  },
} as const;

export function SyncInvoicesButton() {
  const router = useRouter();
  const t = M[useLocale()];
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sync() {
    if (!confirm(t.confirm)) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/sync-stripe-invoices", { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setMsg(t.failed);
      return;
    }
    const s = await res.json();
    setMsg(t.done(s.upserted ?? 0, s.invoicesSeen ?? 0));
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-3">
      <Btn variant="outline" size="sm" onClick={sync} disabled={busy}>
        {busy ? t.syncing : t.sync}
      </Btn>
      {msg && (
        <span className="text-[12.5px]" style={{ color: tone.ink70 }}>
          {msg}
        </span>
      )}
    </span>
  );
}
