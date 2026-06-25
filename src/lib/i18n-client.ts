"use client";

import { useSyncExternalStore } from "react";

export type Locale = "en" | "zh";

const subscribe = () => () => {};

/**
 * Current UI locale for CLIENT components, read from the `locale` cookie.
 * The language toggle in the nav writes the cookie and calls router.refresh(),
 * which re-renders and re-reads this snapshot across the app. Server components
 * read the same cookie via getLocale() in `@/lib/i18n`.
 *
 * Pages localize with a self-contained message map:
 *   const M = { en: { title: "Sales" }, zh: { title: "买卖" } } as const;
 *   const t = M[useLocale()];
 */
export function useLocale(): Locale {
  return useSyncExternalStore(
    subscribe,
    () =>
      typeof document !== "undefined" && /(?:^|;\s*)locale=zh/.test(document.cookie)
        ? "zh"
        : "en",
    () => "en",
  );
}
