"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { tone } from "@/components/homix/tokens";
import { Icons } from "@/components/homix/primitives";
import { useLocale } from "@/lib/i18n-client";

type SearchResult = {
  group: "rental" | "sale" | "invoice" | "building" | "agent";
  title: string;
  subtitle?: string;
  href: string;
};

const M = {
  en: {
    search: "Search",
    placeholder: "Tenant, building, invoice #, agent…",
    empty: "No results",
    hint: "Type to search deals, invoices, buildings",
    groups: {
      rental: "Rental deals",
      sale: "Sales",
      invoice: "Invoices",
      building: "Buildings",
      agent: "Agents",
    },
  },
  zh: {
    search: "搜索",
    placeholder: "租客、楼名、发票号、经纪人…",
    empty: "没有匹配结果",
    hint: "输入以搜索成交、发票、楼盘",
    groups: {
      rental: "租赁成交",
      sale: "买卖",
      invoice: "发票",
      building: "楼盘",
      agent: "经纪人",
    },
  },
} as const;

const GROUP_ORDER: SearchResult["group"][] = [
  "rental",
  "sale",
  "invoice",
  "building",
  "agent",
];

export function SearchCommand() {
  const router = useRouter();
  const locale = useLocale();
  const t = M[locale];
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ⌘K / Ctrl+K opens from anywhere; Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQ("");
      setResults([]);
      setActive(0);
    }
  }, [open]);

  // Debounced fetch.
  useEffect(() => {
    if (!open) return;
    const query = q.trim();
    if (!query) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
          setActive(0);
        }
      } catch {
        // aborted or offline — keep previous results
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [q, open]);

  const go = useCallback(
    (r: SearchResult | undefined) => {
      if (!r) return;
      setOpen(false);
      router.push(r.href);
    },
    [router]
  );

  // Flat list in group order for keyboard navigation.
  const ordered = GROUP_ORDER.flatMap((g) => results.filter((r) => r.group === g));

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, ordered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(ordered[active]);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 h-9 px-3 rounded-md transition-colors hover:opacity-80"
        style={{ border: `1px solid ${tone.line}`, color: tone.ink50 }}
        aria-label={t.search}
      >
        <span style={{ color: tone.ink30 }}>
          <Icons.Search />
        </span>
        <span className="text-[13px] hidden sm:inline">{t.search}</span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded font-mono hidden sm:inline"
          style={{ background: tone.paperDeep, color: tone.ink50 }}
        >
          ⌘K
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
          style={{ background: "rgba(26,24,20,0.35)" }}
          onMouseDown={(e) => {
            if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
          }}
        >
          <div
            ref={boxRef}
            className="w-full max-w-[560px] rounded-xl overflow-hidden"
            style={{
              background: tone.card,
              border: `1px solid ${tone.line}`,
              boxShadow: "0 24px 60px -15px rgba(0,0,0,0.3)",
            }}
          >
            <div
              className="flex items-center gap-2.5 px-4"
              style={{ borderBottom: `1px solid ${tone.lineSoft}` }}
            >
              <span style={{ color: tone.ink30 }}>
                <Icons.Search />
              </span>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onInputKey}
                placeholder={t.placeholder}
                className="flex-1 h-12 bg-transparent outline-none text-[14px]"
                style={{ color: tone.ink }}
              />
              {loading && (
                <span className="text-[11px]" style={{ color: tone.ink30 }}>
                  …
                </span>
              )}
            </div>

            <div className="max-h-[50vh] overflow-y-auto py-1">
              {q.trim() === "" ? (
                <div className="px-4 py-6 text-center text-[12.5px]" style={{ color: tone.ink50 }}>
                  {t.hint}
                </div>
              ) : ordered.length === 0 && !loading ? (
                <div className="px-4 py-6 text-center text-[12.5px]" style={{ color: tone.ink50 }}>
                  {t.empty}
                </div>
              ) : (
                GROUP_ORDER.map((g) => {
                  const groupItems = results.filter((r) => r.group === g);
                  if (groupItems.length === 0) return null;
                  return (
                    <div key={g} className="pb-1">
                      <div
                        className="px-4 pt-2.5 pb-1 text-[10.5px] uppercase tracking-wider"
                        style={{ color: tone.ink30 }}
                      >
                        {t.groups[g]}
                      </div>
                      {groupItems.map((r) => {
                        const flatIndex = ordered.indexOf(r);
                        const isActive = flatIndex === active;
                        return (
                          <button
                            key={`${r.group}:${r.href}:${r.title}`}
                            type="button"
                            onClick={() => go(r)}
                            onMouseEnter={() => setActive(flatIndex)}
                            className="w-full text-left px-4 py-2 flex items-baseline gap-2"
                            style={{ background: isActive ? tone.paperDeep : "transparent" }}
                          >
                            <span className="text-[13.5px] truncate" style={{ color: tone.ink }}>
                              {r.title}
                            </span>
                            {r.subtitle && (
                              <span
                                className="text-[11.5px] truncate flex-1"
                                style={{ color: tone.ink50 }}
                              >
                                {r.subtitle}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
