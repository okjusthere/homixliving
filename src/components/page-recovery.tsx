"use client";

import Link from "next/link";
import { Btn } from "@/components/homix/primitives";
import { tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";

const M = {
  en: {
    errorTitle: "This page could not be opened",
    errorBody: "Check your connection and try again. If you just submitted information or made a payment, check the result before submitting again.",
    missingTitle: "Page not found",
    missingBody: "The link may have changed, or this page may no longer be available.",
    retry: "Try again",
    home: "Back to workbench",
  },
  zh: {
    errorTitle: "暂时无法打开页面",
    errorBody: "请检查网络后重试。如果刚才提交过资料或付款，请先核对结果，再决定是否重新提交。",
    missingTitle: "找不到这个页面",
    missingBody: "链接可能已更改，或该页面已不存在。",
    retry: "重新加载",
    home: "返回工作台",
  },
} as const;

export function PageRecovery({
  kind = "error",
  onRetry,
}: {
  kind?: "error" | "not-found";
  onRetry?: () => void;
}) {
  const locale = useLocale();
  const t = M[locale];
  return (
    <section className="mx-auto flex min-h-[55vh] w-full max-w-xl flex-col justify-center px-4 py-12 sm:px-8" aria-labelledby="recovery-title">
      <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: tone.brand }}>
        Homix{kind === "not-found" ? " · 404" : ""}
      </p>
      <h1 id="recovery-title" className="font-serif text-3xl leading-tight sm:text-4xl" style={{ color: tone.ink }}>
        {kind === "not-found" ? t.missingTitle : t.errorTitle}
      </h1>
      <p className="mt-4 text-sm leading-7" style={{ color: tone.ink70 }}>
        {kind === "not-found" ? t.missingBody : t.errorBody}
      </p>
      <div className="mt-7 flex flex-wrap items-center gap-3">
        {onRetry && <Btn onClick={onRetry}>{t.retry}</Btn>}
        <Link href="/" prefetch={false} className="inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium hover:underline" style={{ color: tone.ink, borderColor: tone.line }}>
          {t.home}
        </Link>
      </div>
    </section>
  );
}
