"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/homix/primitives";
import { tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";

const M = {
  en: {
    sync: "Sync Stripe payments",
    syncing: "Syncing…",
    done: (orders: number, invoices: number, errors: number) =>
      `Synced ${orders} one-time payments and ${invoices} invoices${errors ? `; ${errors} failed` : ""}.`,
    failed: "Sync failed — please retry.",
    confirm:
      "Pull one-time payments and the full subscription invoice history from Stripe? Existing rows update in place.",
  },
  zh: {
    sync: "同步 Stripe 收款",
    syncing: "同步中…",
    done: (orders: number, invoices: number, errors: number) =>
      `已同步 ${orders} 笔一次性付款及 ${invoices} 张订阅账单${errors ? `；${errors} 项失败` : ""}。`,
    failed: "同步失败，请重试。",
    confirm: "从 Stripe 拉取一次性付款及全部订阅账单历史？已有记录会原位更新，不会重复。",
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
    setMsg(t.done(s.ordersReconciled ?? 0, s.upserted ?? 0, s.errors?.length ?? 0));
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
