"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Card, EditorialInput } from "@/components/homix/primitives";
import { tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";
import { CHECKLIST_GROUPS, type ChecklistGroupKey } from "@/lib/checklist-groups";
import type { ChecklistItem } from "@/db/schema";

const M = {
  en: {
    manage: "Manage required-documents checklists",
    lead: "Items agents must submit per deal stage.",
    addItem: "Add item",
    close: "Close",
    label: "Document name (e.g. Agency Disclosure)",
    labelRequired: "Please enter the document name.",
    saveFailed: "Save failed — please retry.",
    saving: "Saving…",
    save: "Add to checklist",
    delete: "Delete",
    confirmDelete: (label: string) => `Delete "${label}"?`,
  },
  zh: {
    manage: "管理做单必交清单",
    lead: "各阶段经纪人必须提交的文件项。",
    addItem: "添加清单项",
    close: "收起",
    label: "文件名称（例如 Agency Disclosure）",
    labelRequired: "请填写文件名称。",
    saveFailed: "保存失败，请重试。",
    saving: "保存中…",
    save: "加入清单",
    delete: "删除",
    confirmDelete: (label: string) => `删除“${label}”？`,
  },
} as const;

export function ChecklistManager({ initialItems }: { initialItems: ChecklistItem[] }) {
  const router = useRouter();
  const locale = useLocale();
  const t = M[locale];
  const [open, setOpen] = useState(false);
  const [groupKey, setGroupKey] = useState<ChecklistGroupKey>(CHECKLIST_GROUPS[0].key);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setError(null);
    if (!label.trim()) {
      setError(t.labelRequired);
      return;
    }
    setBusy(true);
    // New items land at the end of their group.
    const maxSort = Math.max(
      0,
      ...initialItems.filter((i) => i.groupKey === groupKey).map((i) => i.sortOrder),
    );
    const res = await fetch("/api/checklists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupKey, label, sortOrder: maxSort + 10 }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(t.saveFailed);
      return;
    }
    setLabel("");
    router.refresh();
  }

  async function remove(it: ChecklistItem) {
    if (!confirm(t.confirmDelete(it.label))) return;
    await fetch(`/api/checklists/${it.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <Card className="p-5 mb-10" style={{ background: tone.paper }}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-serif" style={{ fontSize: 16, color: tone.ink }}>
            {t.manage}
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: tone.ink50 }}>
            {t.lead}
          </div>
        </div>
        <Btn variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? t.close : t.addItem}
        </Btn>
      </div>

      {open && (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-[240px_1fr_auto]">
            <select
              value={groupKey}
              onChange={(e) => setGroupKey(e.target.value as ChecklistGroupKey)}
              className="rounded-md px-3 py-2 text-[13px]"
              style={{ border: `1px solid ${tone.lineSoft}`, background: tone.paperDeep, color: tone.ink }}
            >
              {CHECKLIST_GROUPS.map((g) => (
                <option key={g.key} value={g.key}>
                  {g[locale]}
                </option>
              ))}
            </select>
            <EditorialInput value={label} onChange={setLabel} placeholder={t.label} />
            <Btn variant="primary" size="sm" onClick={add} disabled={busy}>
              {busy ? t.saving : t.save}
            </Btn>
          </div>
          {error && (
            <p className="mt-2 text-[12.5px]" style={{ color: tone.rose }}>
              {error}
            </p>
          )}

          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            {CHECKLIST_GROUPS.map((g) => {
              const items = initialItems.filter((i) => i.groupKey === g.key);
              if (items.length === 0) return null;
              return (
                <div key={g.key}>
                  <div className="text-[12px] font-medium mb-1.5" style={{ color: tone.ink70 }}>
                    {g[locale]}
                  </div>
                  {items.map((it) => (
                    <div
                      key={it.id}
                      className="flex items-center gap-3 py-2"
                      style={{ borderTop: `1px solid ${tone.lineSoft}` }}
                    >
                      <div className="flex-1 min-w-0 truncate text-[13px]" style={{ color: tone.ink }}>
                        {it.label}
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(it)}
                        className="text-[12px] px-2 py-0.5 rounded-md"
                        style={{ color: tone.rose }}
                      >
                        {t.delete}
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
