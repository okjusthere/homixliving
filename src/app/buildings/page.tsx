"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  Pill,
  Icons,
  EditorialInput,
  LabeledField,
} from "@/components/homix/primitives";
import { tone } from "@/components/homix/tokens";
import type { Building } from "@/db/schema";

const emptyBuilding: Partial<Building> = {
  name: "",
  region: "",
  managementCompany: "",
  submissionType: "email",
  submissionNotes: "",
  invoiceNumberFormat: "",
  billToCompany: "",
  billToAddress: "",
  contactEmail: "",
  specialNotes: "",
  isOutOfState: false,
};

export default function BuildingsPage() {
  const { data: session } = useSession();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editBuilding, setEditBuilding] = useState<Building | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const isAdmin = Boolean(session?.user.isAdmin);

  const fetchBuildings = () => {
    fetch("/api/buildings")
      .then((r) => r.json())
      .then((data) => {
        setBuildings(data);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchBuildings();
  }, []);

  const openNew = () => {
    setEditBuilding(emptyBuilding as Building);
    setIsNew(true);
  };

  const openEdit = (b: Building) => {
    if (!isAdmin) return;
    setEditBuilding(b);
    setIsNew(false);
  };

  const closeDialog = () => {
    setEditBuilding(null);
    setIsNew(false);
  };

  const handleSave = async () => {
    if (!editBuilding) return;
    if (!editBuilding.name?.trim() || !editBuilding.region?.trim()) {
      toast.error("Name and region are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/buildings", {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editBuilding),
      });
      if (!res.ok) throw new Error();
      toast.success(isNew ? `${editBuilding.name} added` : `${editBuilding.name} saved`);
      closeDialog();
      fetchBuildings();
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editBuilding?.id) return;
    if (!confirm(`Delete "${editBuilding.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch("/api/buildings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editBuilding.id }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${editBuilding.name} deleted`);
      closeDialog();
      fetchBuildings();
    } catch {
      toast.error("Delete failed");
    }
  };

  const updateField = (field: keyof Building, value: string | boolean | null) => {
    if (!editBuilding) return;
    setEditBuilding({ ...editBuilding, [field]: value } as Building);
  };

  const filtered = useMemo(() => {
    if (!search) return buildings;
    const q = search.toLowerCase();
    return buildings.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.region.toLowerCase().includes(q) ||
        (b.managementCompany || "").toLowerCase().includes(q) ||
        (b.contactEmail || "").toLowerCase().includes(q)
    );
  }, [buildings, search]);

  const grouped = useMemo(() => {
    return filtered.reduce<Record<string, Building[]>>((acc, b) => {
      const key = b.region;
      if (!acc[key]) acc[key] = [];
      acc[key].push(b);
      return acc;
    }, {});
  }, [filtered]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <div
            className="text-[11px] uppercase tracking-[0.16em] mb-2"
            style={{ color: tone.ink50 }}
          >
            Directory
          </div>
          <h1
            className="font-serif"
            style={{
              fontSize: 52,
              lineHeight: 0.95,
              letterSpacing: "-0.02em",
              color: tone.ink,
            }}
          >
            Buildings
          </h1>
          <p className="mt-3 text-[14px]" style={{ color: tone.ink70 }}>
            {buildings.length} building{buildings.length === 1 ? "" : "s"}
            {isAdmin ? " · click a card to edit" : ""}
          </p>
        </div>
        <Btn variant="primary" icon={<Icons.Plus />} onClick={openNew}>
          Add Building
        </Btn>
      </div>

      {/* Search */}
      <div
        className="flex items-center gap-2 h-10 px-3 rounded-md max-w-md"
        style={{ background: tone.card, border: `1px solid ${tone.line}` }}
      >
        <span style={{ color: tone.ink30 }}>
          <Icons.Search />
        </span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, region, management, email…"
          className="flex-1 bg-transparent outline-none text-[13.5px]"
          style={{ color: tone.ink }}
        />
      </div>

      {loading ? (
        <p className="text-[13px]" style={{ color: tone.ink50 }}>
          Loading…
        </p>
      ) : (
        Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([region, regionBuildings]) => (
            <Card key={region}>
              <div
                className="px-6 py-5 flex items-center justify-between"
                style={{ borderBottom: `1px solid ${tone.lineSoft}` }}
              >
                <div
                  className="font-serif flex items-center gap-3"
                  style={{ fontSize: 22, color: tone.ink, letterSpacing: "-0.01em" }}
                >
                  {region}
                  <Pill tone="neutral">{regionBuildings.length}</Pill>
                </div>
              </div>
              <div className="p-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {regionBuildings.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => openEdit(b)}
                    className="rounded-xl p-4 text-left transition-colors hover:bg-[#FAF7F0] disabled:cursor-default disabled:hover:bg-transparent"
                    disabled={!isAdmin}
                    style={{ border: `1px solid ${tone.line}`, background: tone.card }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Pill tone="neutral">{b.region}</Pill>
                      {b.isOutOfState && <Pill tone="accent">Out of state</Pill>}
                    </div>
                    <div
                      className="font-serif"
                      style={{
                        fontSize: 18,
                        color: tone.ink,
                        letterSpacing: "-0.01em",
                        lineHeight: 1.2,
                      }}
                    >
                      {b.name}
                    </div>
                    {b.managementCompany && (
                      <div className="text-[12px] mt-1" style={{ color: tone.ink50 }}>
                        {b.managementCompany}
                      </div>
                    )}
                    <div
                      className="mt-3 pt-3 space-y-1.5 text-[11.5px]"
                      style={{ borderTop: `1px solid ${tone.lineSoft}`, color: tone.ink70 }}
                    >
                      {b.billToCompany && (
                        <div className="flex gap-2">
                          <span style={{ color: tone.ink50 }}>Bill to</span>
                          <span className="truncate">{b.billToCompany}</span>
                        </div>
                      )}
                      {b.contactEmail ? (
                        <div className="flex gap-2">
                          <span style={{ color: tone.ink50 }}>Email</span>
                          <span className="truncate font-mono text-[10.5px]">
                            {b.contactEmail}
                          </span>
                        </div>
                      ) : (
                        <div
                          className="text-[11px]"
                          style={{ color: tone.amber }}
                        >
                          No contact email
                        </div>
                      )}
                    </div>
                    {b.specialNotes && (
                      <div
                        className="mt-2 text-[11px] line-clamp-2"
                        style={{ color: tone.rose }}
                      >
                        ⚠ {b.specialNotes}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </Card>
          ))
      )}

      {/* Edit Dialog */}
      {editBuilding && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-8"
          style={{ background: "rgba(26, 24, 20, 0.4)", backdropFilter: "blur(4px)" }}
          onClick={closeDialog}
        >
          <div
            className="w-full max-w-2xl rounded-2xl max-h-[90vh] overflow-hidden flex flex-col"
            style={{
              background: tone.card,
              border: `1px solid ${tone.line}`,
              boxShadow: "0 30px 80px -20px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="px-8 py-6 flex items-center justify-between"
              style={{ borderBottom: `1px solid ${tone.line}` }}
            >
              <div>
                <div
                  className="text-[11px] uppercase tracking-[0.14em]"
                  style={{ color: tone.ink50 }}
                >
                  {isNew ? "New" : "Edit"}
                </div>
                <div
                  className="font-serif"
                  style={{
                    fontSize: 26,
                    color: tone.ink,
                    letterSpacing: "-0.01em",
                    marginTop: 2,
                  }}
                >
                  {isNew ? "Add building" : editBuilding.name}
                </div>
              </div>
              <button
                onClick={closeDialog}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: tone.paperDeep, color: tone.ink70 }}
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-auto px-8 py-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <LabeledField label="Name *">
                  <EditorialInput
                    value={editBuilding.name || ""}
                    onChange={(v) => updateField("name", v)}
                    placeholder="e.g. The Octagon"
                  />
                </LabeledField>
                <LabeledField label="Region *">
                  <EditorialInput
                    value={editBuilding.region || ""}
                    onChange={(v) => updateField("region", v)}
                    placeholder="e.g. NJ, BK, 中城"
                  />
                </LabeledField>
                <LabeledField label="Management company">
                  <EditorialInput
                    value={editBuilding.managementCompany || ""}
                    onChange={(v) => updateField("managementCompany", v)}
                    placeholder="e.g. Greystar"
                  />
                </LabeledField>
                <LabeledField label="Contact email">
                  <EditorialInput
                    value={editBuilding.contactEmail || ""}
                    onChange={(v) => updateField("contactEmail", v)}
                    placeholder="ap@example.com"
                    mono
                  />
                </LabeledField>
                <LabeledField label="Bill-to company">
                  <EditorialInput
                    value={editBuilding.billToCompany || ""}
                    onChange={(v) => updateField("billToCompany", v)}
                  />
                </LabeledField>
                <LabeledField label="Invoice № format">
                  <EditorialInput
                    value={editBuilding.invoiceNumberFormat || ""}
                    onChange={(v) => updateField("invoiceNumberFormat", v)}
                    placeholder="Unit-OCTAGON-{year}"
                    mono
                  />
                </LabeledField>
              </div>

              <LabeledField label="Bill-to address">
                <EditorialInput
                  value={editBuilding.billToAddress || ""}
                  onChange={(v) => updateField("billToAddress", v)}
                  placeholder="888 Main St, New York, NY 10044"
                />
              </LabeledField>

              <LabeledField label="Submission notes">
                <textarea
                  value={editBuilding.submissionNotes || ""}
                  onChange={(e) => updateField("submissionNotes", e.target.value)}
                  rows={2}
                  placeholder="e.g. CC company inbox when sending"
                  className="w-full rounded-lg p-3 text-[13.5px] outline-none"
                  style={{
                    background: tone.card,
                    border: `1px solid ${tone.line}`,
                    color: tone.ink,
                    resize: "vertical",
                  }}
                />
              </LabeledField>

              <LabeledField label="Special requirements">
                <textarea
                  value={editBuilding.specialNotes || ""}
                  onChange={(e) => updateField("specialNotes", e.target.value)}
                  rows={2}
                  placeholder="e.g. Requires broker referral form"
                  className="w-full rounded-lg p-3 text-[13.5px] outline-none"
                  style={{
                    background: tone.card,
                    border: `1px solid ${tone.line}`,
                    color: tone.ink,
                    resize: "vertical",
                  }}
                />
              </LabeledField>
            </div>

            {/* Footer */}
            <div
              className="px-8 py-5 flex items-center justify-between"
              style={{ borderTop: `1px solid ${tone.line}`, background: tone.paper }}
            >
              <div>
                {!isNew && isAdmin && (
                  <Btn variant="danger" size="sm" icon={<Icons.Trash />} onClick={handleDelete}>
                    Delete
                  </Btn>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Btn variant="outline" onClick={closeDialog}>
                  Cancel
                </Btn>
                <Btn variant="primary" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : isNew ? "Add building" : "Save"}
                </Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
