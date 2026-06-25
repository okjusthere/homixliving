"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import type { Locale } from "@/lib/i18n";

/** Switches the `locale` cookie and refreshes server components in-place. */
export function LocaleToggle({
  locale,
  label,
  className,
}: {
  locale: Locale;
  /** The OTHER language's name (e.g. "中文" when current is en). */
  label: string;
  className?: string;
}) {
  const router = useRouter();

  const toggle = () => {
    const next = locale === "zh" ? "en" : "zh";
    document.cookie = `locale=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch language"
      className={cn(
        "text-sm font-medium tracking-wide transition-colors hover:text-bronze",
        className,
      )}
    >
      {label}
    </button>
  );
}
