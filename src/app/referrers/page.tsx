"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Btn, Card, EditorialInput, Icons, LabeledField, Pill } from "@/components/homix/primitives";
import { fmtMoney, tone } from "@/components/homix/tokens";
import type { Referrer } from "@/db/schema";

type ReferrerRow = {
  referrer: Referrer;
  dealsCount: number;
  totalEarned: number;
};

const emptyReferrer: Partial<Referrer> = {
  name: "",
  email: "",
  phone: "",
  defaultReferralType: "percent",
  defaultReferralAmount: 15,
  notes: "",
};

function referralLabel(referrer: Partial<Referrer>) {
  if (!referrer.defaultReferralType || referrer.defaultReferralAmount == null) return "No default";
  if (referrer.defaultReferralType === "percent") return `${referrer.defaultReferralAmount}%`;
  return `$${fmtMoney(Number(referrer.defaultReferralAmount))}`;
}

export default function ReferrersPage() {
  const [rows, setRows] = useState<ReferrerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editReferrer, setEditReferrer] = useState<Partial<Referrer> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/referrers")
      .then((r) => r.json())
      .then(setRows)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const updateField = (field: keyof Referrer, value: string | number | null) => {
    if (!editReferrer) return;
    setEditReferrer({ ...editReferrer, [field]: value });
  };

  const handleSave = async () => {
    if (!editReferrer?.name?.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/referrers", {
        method: editReferrer.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editReferrer),
      });
      if (!res.ok) throw new Error();
      toast.success(editReferrer.id ? "Referrer saved" : "Referrer created");
      setEditReferrer(null);
      load();
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editReferrer?.id) return;
    if (!confirm(`Delete "${editReferrer.name}"? Existing deals will keep their commission math but lose the referrer link.`)) return;
    try {
      const res = await fetch("/api/referrers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editReferrer.id }),
      });
      if (!res.ok) throw new Error();
      toast.success("Referrer deleted");
      setEditReferrer(null);
      load();
    } catch {
      toast.error("Delete failed");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] mb-2" style={{ color: tone.ink50 }}>
            Referral Network
          </div>
          <h1 className="font-serif" style={{ fontSize: 52, lineHeight: 0.95, color: tone.ink }}>
            Referrers
          </h1>
          <p className="mt-3 text-[14px]" style={{ color: tone.ink70 }}>
            Outside parties who receive percent or flat referral payouts.
          </p>
        </div>
        <Btn variant="primary" icon={<Icons.Plus />} onClick={() => setEditReferrer(emptyReferrer)}>
          Add Referrer
        </Btn>
      </div>

      {loading ? (
        <p className="text-[13px]" style={{ color: tone.ink50 }}>
          Loading…
        </p>
      ) : rows.length === 0 ? (
        <Card>
          <div className="px-6 py-16 text-center">
            <div className="font-serif mb-2" style={{ fontSize: 24, color: tone.ink }}>
              No referrers yet
            </div>
            <button type="button" onClick={() => setEditReferrer(emptyReferrer)} className="text-[13px] underline" style={{ color: tone.accent }}>
              Add your first referrer
            </button>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="grid text-[11px] uppercase tracking-[0.1em] px-6 py-3" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 100px", color: tone.ink50, borderBottom: `1px solid ${tone.lineSoft}` }}>
            <div>Name</div>
            <div>Default</div>
            <div>Deals</div>
            <div className="text-right">Earned</div>
            <div />
          </div>
          {rows.map(({ referrer, dealsCount, totalEarned }, index) => (
            <button
              key={referrer.id}
              type="button"
              onClick={() => setEditReferrer(referrer)}
              className="grid w-full px-6 py-4 text-left items-center transition-colors hover:bg-[#FAF7F0]"
              style={{
                gridTemplateColumns: "2fr 1fr 1fr 1fr 100px",
                borderBottom: index < rows.length - 1 ? `1px solid ${tone.lineSoft}` : "none",
              }}
            >
              <div>
                <div className="font-serif" style={{ fontSize: 20, color: tone.ink }}>
                  {referrer.name}
                </div>
                <div className="text-[12px] mt-1" style={{ color: tone.ink50 }}>
                  {referrer.email || "No email"} {referrer.phone ? `· ${referrer.phone}` : ""}
                </div>
              </div>
              <div>
                <Pill tone="neutral">{referralLabel(referrer)}</Pill>
              </div>
              <div className="font-serif" style={{ fontSize: 22, color: tone.ink }}>
                {dealsCount}
              </div>
              <div className="font-serif text-right" style={{ fontSize: 22, color: tone.green }}>
                ${fmtMoney(totalEarned)}
              </div>
              <div className="flex justify-end">
                <Icons.Edit />
              </div>
            </button>
          ))}
        </Card>
      )}

      {editReferrer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8" style={{ background: "rgba(26, 24, 20, 0.4)", backdropFilter: "blur(4px)" }} onClick={() => setEditReferrer(null)}>
          <div className="w-full max-w-xl rounded-2xl overflow-hidden" style={{ background: tone.card, border: `1px solid ${tone.line}`, boxShadow: "0 30px 80px -20px rgba(0,0,0,0.3)" }} onClick={(e) => e.stopPropagation()}>
            <div className="px-8 py-6 flex items-center justify-between" style={{ borderBottom: `1px solid ${tone.line}` }}>
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em]" style={{ color: tone.ink50 }}>
                  {editReferrer.id ? "Edit" : "New"}
                </div>
                <div className="font-serif" style={{ fontSize: 26, color: tone.ink }}>
                  {editReferrer.id ? editReferrer.name : "Add referrer"}
                </div>
              </div>
              <button onClick={() => setEditReferrer(null)} className="w-8 h-8 rounded-full" style={{ background: tone.paperDeep, color: tone.ink70 }}>
                x
              </button>
            </div>
            <div className="px-8 py-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <LabeledField label="Name *">
                  <EditorialInput value={editReferrer.name || ""} onChange={(v) => updateField("name", v)} />
                </LabeledField>
                <LabeledField label="Default type">
                  <select
                    value={editReferrer.defaultReferralType || ""}
                    onChange={(e) => updateField("defaultReferralType", e.target.value || null)}
                    className="w-full h-10 rounded-lg px-3 text-[13.5px] outline-none"
                    style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink }}
                  >
                    <option value="">None</option>
                    <option value="percent">Percent</option>
                    <option value="flat">Flat</option>
                  </select>
                </LabeledField>
                <LabeledField label="Email">
                  <EditorialInput value={editReferrer.email || ""} onChange={(v) => updateField("email", v)} mono />
                </LabeledField>
                <LabeledField label="Phone">
                  <EditorialInput value={editReferrer.phone || ""} onChange={(v) => updateField("phone", v)} mono />
                </LabeledField>
                <LabeledField label="Default amount">
                  <EditorialInput value={editReferrer.defaultReferralAmount ?? ""} onChange={(v) => updateField("defaultReferralAmount", v === "" ? null : Number(v))} type="number" mono />
                </LabeledField>
              </div>
              <LabeledField label="Notes">
                <textarea
                  value={editReferrer.notes || ""}
                  onChange={(e) => updateField("notes", e.target.value)}
                  rows={3}
                  className="w-full rounded-lg p-3 text-[13.5px] outline-none"
                  style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink, resize: "vertical" }}
                />
              </LabeledField>
            </div>
            <div className="px-8 py-5 flex items-center justify-between" style={{ borderTop: `1px solid ${tone.line}`, background: tone.paper }}>
              <div>
                {editReferrer.id && (
                  <Btn variant="danger" size="sm" icon={<Icons.Trash />} onClick={handleDelete}>
                    Delete
                  </Btn>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Btn variant="outline" onClick={() => setEditReferrer(null)}>
                  Cancel
                </Btn>
                <Btn variant="primary" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
