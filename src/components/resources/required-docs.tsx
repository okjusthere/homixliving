"use client";

import { useState } from "react";
import { Card } from "@/components/homix/primitives";
import { tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";
import { CHECKLIST_GROUPS } from "@/lib/checklist-groups";
import type { ChecklistItem } from "@/db/schema";

const M = {
  en: {
    heading: "Required documents by deal stage",
    lead: "What the office needs from you at each stage — use it as your submission checklist.",
    empty: "No items in this list yet.",
  },
  zh: {
    heading: "做单必交文件",
    lead: "每个阶段需要交给公司的文件——照着清单交，不漏项。",
    empty: "该清单暂无内容。",
  },
} as const;

export function RequiredDocs({ items }: { items: ChecklistItem[] }) {
  const locale = useLocale();
  const t = M[locale];
  // Only show groups that actually have items (a brand-new group with no rows
  // renders nothing for agents).
  const groups = CHECKLIST_GROUPS.filter((g) =>
    items.some((it) => it.groupKey === g.key),
  );
  const [active, setActive] = useState(groups[0]?.key ?? CHECKLIST_GROUPS[0].key);

  if (groups.length === 0) return null;
  const activeItems = items.filter((it) => it.groupKey === active);

  return (
    <section>
      <h2 className="font-serif mb-1" style={{ fontSize: 20, color: tone.ink }}>
        {t.heading}
      </h2>
      <p className="text-[13px] mb-4" style={{ color: tone.ink50 }}>
        {t.lead}
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {groups.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => setActive(g.key)}
            className="rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors"
            style={
              active === g.key
                ? { background: tone.ink, color: tone.paper }
                : { background: tone.paperDeep, color: tone.ink70 }
            }
          >
            {g[locale]}
          </button>
        ))}
      </div>

      <Card className="p-5">
        {activeItems.length === 0 ? (
          <p className="text-[13px]" style={{ color: tone.ink50 }}>
            {t.empty}
          </p>
        ) : (
          <ol className="space-y-0">
            {activeItems.map((it, i) => (
              <li
                key={it.id}
                className="flex items-baseline gap-3 py-2.5"
                style={i > 0 ? { borderTop: `1px solid ${tone.lineSoft}` } : undefined}
              >
                <span
                  className="w-6 shrink-0 text-right font-mono text-[12px] tabular-nums"
                  style={{ color: tone.ink50 }}
                >
                  {i + 1}.
                </span>
                <span className="text-[13.5px] leading-relaxed" style={{ color: tone.ink }}>
                  {it.label}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </section>
  );
}
