"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Btn, Card } from "@/components/homix/primitives";
import { tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";

const M = {
  en: {
    category: "Category", message: "Your suggestion", placeholder: "What should Homix improve? Include enough context for us to act on it.",
    submit: "Submit anonymously", submitting: "Submitting…", sent: "Suggestion received", sentLead: "The stored record contains no agent id, name, email, IP address, or browser information.",
    privacy: "You must be signed in so only active Homix agents can submit. Your identity is checked for access, then discarded and never written to the suggestion record. Do not include identifying details in your message if you want to remain anonymous.",
    failed: "Unable to submit right now.", categories: { product: "Portal product", commission: "Commission", training: "Training", operations: "Operations", culture: "Culture", other: "Other" },
  },
  zh: {
    category: "分类", message: "建议内容", placeholder: "你希望 Homix 改进什么？请提供足够背景，方便实际处理。",
    submit: "匿名提交", submitting: "提交中…", sent: "建议已收到", sentLead: "保存的记录不包含经纪人 ID、姓名、邮箱、IP 地址或浏览器信息。",
    privacy: "登录只用于确认提交人是 Active Homix Agent；通过权限检查后，身份不会写入建议记录。若希望保持匿名，请不要在正文中写入可识别自己的细节。",
    failed: "暂时无法提交。", categories: { product: "Portal 产品", commission: "佣金", training: "培训", operations: "运营", culture: "公司文化", other: "其他" },
  },
} as const;

export function FeedbackForm() {
  const locale = useLocale();
  const t = M[locale];
  const [category, setCategory] = useState("product");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, message, locale }),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setError(t.failed);
      return;
    }
    setSent(true);
    setMessage("");
  }

  if (sent) {
    return (
      <Card className="p-8 text-center">
        <CheckCircle2 className="mx-auto" size={32} style={{ color: tone.green }} />
        <h2 className="mt-4 font-serif text-2xl" style={{ color: tone.ink }}>{t.sent}</h2>
        <p className="mx-auto mt-2 max-w-xl text-[13px]" style={{ color: tone.ink50 }}>{t.sentLead}</p>
        <Btn className="mt-5" onClick={() => setSent(false)}>{locale === "zh" ? "再提一条" : "Submit another"}</Btn>
      </Card>
    );
  }

  return (
    <Card className="p-5 sm:p-7">
      <div className="space-y-5">
        <label className="block space-y-2 text-[12px] font-medium" style={{ color: tone.ink50 }}>
          <span>{t.category}</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-11 w-full rounded-lg px-3 text-[13.5px]" style={{ border: `1px solid ${tone.line}`, background: tone.card, color: tone.ink }}>
            {Object.entries(t.categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="block space-y-2 text-[12px] font-medium" style={{ color: tone.ink50 }}>
          <span>{t.message}</span>
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={9} maxLength={4_000} placeholder={t.placeholder} className="w-full resize-y rounded-lg p-3 text-[14px] outline-none" style={{ border: `1px solid ${tone.line}`, background: tone.card, color: tone.ink }} />
        </label>
        <div className="rounded-lg p-3 text-[11.5px] leading-5" style={{ background: tone.paperDeep, color: tone.ink50 }}>{t.privacy}</div>
        {error && <p className="text-[12.5px]" style={{ color: tone.rose }}>{error}</p>}
        <Btn variant="primary" onClick={() => void submit()} disabled={busy || message.trim().length < 10}>
          {busy ? t.submitting : t.submit}
        </Btn>
      </div>
    </Card>
  );
}
