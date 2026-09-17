"use client";

import "./globals.css";
import { PageRecovery } from "@/components/page-recovery";
import { useLocale } from "@/lib/i18n-client";

export default function GlobalError({ unstable_retry }: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const locale = useLocale();
  // This replaces a failed root layout, so it must work without auth providers,
  // app navigation, or remotely loaded fonts.
  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"}>
      <body style={{ margin: 0, minHeight: "100vh", background: "#F7F4EE", color: "#1A1814", fontFamily: "Arial, sans-serif" }}>
        <title>Homix</title>
        <PageRecovery onRetry={unstable_retry} />
      </body>
    </html>
  );
}
