"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  Btn,
  Pill,
  Icons,
  EditorialInput,
  LabeledField,
} from "@/components/homix/primitives";
import {
  PageHeader,
  Toolbar,
  SearchInput,
  DataTable,
  type Column,
} from "@/components/homix/page-kit";
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

  const columns: Column<Building>[] = [
    {
      key: "building",
      label: "Building",
      width: "2.2fr",
      render: (b) => (
        <div>
          <div className="flex items-center gap-2">
            <span
              className="font-serif"
              style={{ fontSize: 18, color: tone.ink, letterSpacing: "-0.01em", lineHeight: 1.2 }}
            >
              {b.name}
            </span>
            {b.isOutOfState && <Pill tone="accent">Out of state</Pill>}
          </div>
          {b.managementCompany && (
            <div className="mt-0.5 text-[12px]" style={{ color: tone.ink50 }}>
              {b.managementCompany}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "region",
      label: "Region",
      width: "0.9fr",
      render: (b) => <Pill tone="neutral">{b.region}</Pill>,
    },
    {
      key: "billTo",
      label: "Bill to",
      width: "1.3fr",
      render: (b) => (
        <span className="truncate text-[12.5px]" style={{ color: tone.ink70 }}>
          {b.billToCompany || "—"}
        </span>
      ),
    },
    {
      key: "contact",
      label: "Contact",
      width: "1.4fr",
      render: (b) =>
        b.contactEmail ? (
          <span className="truncate font-mono text-[11px]" style={{ color: tone.ink70 }}>
            {b.contactEmail}
          </span>
        ) : (
          <span className="text-[11.5px]" style={{ color: tone.amber }}>
            No contact email
          </span>
        ),
    },
    {
      key: "notes",
      label: "Notes",
      width: "1.4fr",
      render: (b) =>
        b.specialNotes ? (
          <span className="line-clamp-2 text-[11.5px]" style={{ color: tone.rose }}>
            ⚠ {b.specialNotes}
          </span>
        ) : (
          <span className="text-[12px]" style={{ color: tone.ink30 }}>
            —
          </span>
        ),
    },
  ];

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Directory"
        title="Buildings"
        description={`${buildings.length} building${buildings.length === 1 ? "" : "s"}`}
        actions={
          <Btn variant="primary" icon={<Icons.Plus />} onClick={openNew}>
            Add Building
          </Btn>
        }
      />

      <Toolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search name, region, management, email…"
          className="min-w-[340px]"
        />
      </Toolbar>

      <DataTable
        columns={columns}
        rows={filtered}
        getKey={(b) => b.id}
        onRowClick={isAdmin ? openEdit : undefined}
        loading={loading}
        emptyTitle={buildings.length === 0 ? "No buildings yet" : "No results match your search"}
        emptyAction={
          buildings.length === 0 ? (
            <button
              type="button"
              onClick={openNew}
              className="text-[13px] underline"
              style={{ color: tone.accent }}
            >
              Add your first building
            </button>
          ) : undefined
        }
      />

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
