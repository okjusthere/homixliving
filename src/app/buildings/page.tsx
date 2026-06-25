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
import { useLocale } from "@/lib/i18n-client";
import type { Building } from "@/db/schema";

const M = {
  en: {
    nameRegionRequired: "Name and region are required",
    added: "added",
    saved: "saved",
    saveFailed: "Save failed",
    deleteConfirm: (name: string) => `Delete "${name}"? This cannot be undone.`,
    deleted: "deleted",
    deleteFailed: "Delete failed",
    colBuilding: "Building",
    outOfState: "Out of state",
    colRegion: "Region",
    colBillTo: "Bill to",
    colContact: "Contact",
    noContactEmail: "No contact email",
    colNotes: "Notes",
    eyebrow: "Directory",
    title: "Buildings",
    buildingsCount: (n: number) => `${n} building${n === 1 ? "" : "s"}`,
    addBuilding: "Add Building",
    searchPlaceholder: "Search name, region, management, email…",
    emptyNone: "No buildings yet",
    emptyNoResults: "No results match your search",
    addFirst: "Add your first building",
    new: "New",
    edit: "Edit",
    addBuildingTitle: "Add building",
    labelName: "Name *",
    namePlaceholder: "e.g. The Octagon",
    labelRegion: "Region *",
    regionPlaceholder: "e.g. NJ, BK, 中城",
    labelManagement: "Management company",
    managementPlaceholder: "e.g. Greystar",
    labelContactEmail: "Contact email",
    labelBillToCompany: "Bill-to company",
    labelInvoiceFormat: "Invoice № format",
    labelBillToAddress: "Bill-to address",
    labelSubmissionNotes: "Submission notes",
    submissionNotesPlaceholder: "e.g. CC company inbox when sending",
    labelSpecialReq: "Special requirements",
    specialReqPlaceholder: "e.g. Requires broker referral form",
    delete: "Delete",
    cancel: "Cancel",
    saving: "Saving…",
    save: "Save",
  },
  zh: {
    nameRegionRequired: "名称和区域为必填项",
    added: "已添加",
    saved: "已保存",
    saveFailed: "保存失败",
    deleteConfirm: (name: string) => `删除“${name}”？此操作无法撤销。`,
    deleted: "已删除",
    deleteFailed: "删除失败",
    colBuilding: "楼盘",
    outOfState: "外州",
    colRegion: "区域",
    colBillTo: "开票对象",
    colContact: "联系方式",
    noContactEmail: "无联系邮箱",
    colNotes: "备注",
    eyebrow: "目录",
    title: "楼盘",
    buildingsCount: (n: number) => `${n} 个楼盘`,
    addBuilding: "添加楼盘",
    searchPlaceholder: "搜索名称、区域、管理公司、邮箱…",
    emptyNone: "暂无楼盘",
    emptyNoResults: "没有匹配的结果",
    addFirst: "添加第一个楼盘",
    new: "新建",
    edit: "编辑",
    addBuildingTitle: "添加楼盘",
    labelName: "名称 *",
    namePlaceholder: "例如 The Octagon",
    labelRegion: "区域 *",
    regionPlaceholder: "例如 NJ、BK、中城",
    labelManagement: "管理公司",
    managementPlaceholder: "例如 Greystar",
    labelContactEmail: "联系邮箱",
    labelBillToCompany: "开票公司",
    labelInvoiceFormat: "发票编号格式",
    labelBillToAddress: "开票地址",
    labelSubmissionNotes: "提交备注",
    submissionNotesPlaceholder: "例如 发送时抄送公司邮箱",
    labelSpecialReq: "特殊要求",
    specialReqPlaceholder: "例如 需要经纪人推荐表",
    delete: "删除",
    cancel: "取消",
    saving: "保存中…",
    save: "保存",
  },
} as const;

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
  const t = M[useLocale()];
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
      toast.error(t.nameRegionRequired);
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
      toast.success(isNew ? `${editBuilding.name} ${t.added}` : `${editBuilding.name} ${t.saved}`);
      closeDialog();
      fetchBuildings();
    } catch {
      toast.error(t.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editBuilding?.id) return;
    if (!confirm(t.deleteConfirm(editBuilding.name))) return;
    try {
      const res = await fetch("/api/buildings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editBuilding.id }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${editBuilding.name} ${t.deleted}`);
      closeDialog();
      fetchBuildings();
    } catch {
      toast.error(t.deleteFailed);
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
      label: t.colBuilding,
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
            {b.isOutOfState && <Pill tone="accent">{t.outOfState}</Pill>}
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
      label: t.colRegion,
      width: "0.9fr",
      render: (b) => <Pill tone="neutral">{b.region}</Pill>,
    },
    {
      key: "billTo",
      label: t.colBillTo,
      width: "1.3fr",
      render: (b) => (
        <span className="truncate text-[12.5px]" style={{ color: tone.ink70 }}>
          {b.billToCompany || "—"}
        </span>
      ),
    },
    {
      key: "contact",
      label: t.colContact,
      width: "1.4fr",
      render: (b) =>
        b.contactEmail ? (
          <span className="truncate font-mono text-[11px]" style={{ color: tone.ink70 }}>
            {b.contactEmail}
          </span>
        ) : (
          <span className="text-[11.5px]" style={{ color: tone.amber }}>
            {t.noContactEmail}
          </span>
        ),
    },
    {
      key: "notes",
      label: t.colNotes,
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
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.buildingsCount(buildings.length)}
        actions={
          <Btn variant="primary" icon={<Icons.Plus />} onClick={openNew}>
            {t.addBuilding}
          </Btn>
        }
      />

      <Toolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t.searchPlaceholder}
          className="min-w-[340px]"
        />
      </Toolbar>

      <DataTable
        columns={columns}
        rows={filtered}
        getKey={(b) => b.id}
        onRowClick={isAdmin ? openEdit : undefined}
        loading={loading}
        emptyTitle={buildings.length === 0 ? t.emptyNone : t.emptyNoResults}
        emptyAction={
          buildings.length === 0 ? (
            <button
              type="button"
              onClick={openNew}
              className="text-[13px] underline"
              style={{ color: tone.accent }}
            >
              {t.addFirst}
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
                  {isNew ? t.new : t.edit}
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
                  {isNew ? t.addBuildingTitle : editBuilding.name}
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
                <LabeledField label={t.labelName}>
                  <EditorialInput
                    value={editBuilding.name || ""}
                    onChange={(v) => updateField("name", v)}
                    placeholder={t.namePlaceholder}
                  />
                </LabeledField>
                <LabeledField label={t.labelRegion}>
                  <EditorialInput
                    value={editBuilding.region || ""}
                    onChange={(v) => updateField("region", v)}
                    placeholder={t.regionPlaceholder}
                  />
                </LabeledField>
                <LabeledField label={t.labelManagement}>
                  <EditorialInput
                    value={editBuilding.managementCompany || ""}
                    onChange={(v) => updateField("managementCompany", v)}
                    placeholder={t.managementPlaceholder}
                  />
                </LabeledField>
                <LabeledField label={t.labelContactEmail}>
                  <EditorialInput
                    value={editBuilding.contactEmail || ""}
                    onChange={(v) => updateField("contactEmail", v)}
                    placeholder="ap@example.com"
                    mono
                  />
                </LabeledField>
                <LabeledField label={t.labelBillToCompany}>
                  <EditorialInput
                    value={editBuilding.billToCompany || ""}
                    onChange={(v) => updateField("billToCompany", v)}
                  />
                </LabeledField>
                <LabeledField label={t.labelInvoiceFormat}>
                  <EditorialInput
                    value={editBuilding.invoiceNumberFormat || ""}
                    onChange={(v) => updateField("invoiceNumberFormat", v)}
                    placeholder="Unit-OCTAGON-{year}"
                    mono
                  />
                </LabeledField>
              </div>

              <LabeledField label={t.labelBillToAddress}>
                <EditorialInput
                  value={editBuilding.billToAddress || ""}
                  onChange={(v) => updateField("billToAddress", v)}
                  placeholder="888 Main St, New York, NY 10044"
                />
              </LabeledField>

              <LabeledField label={t.labelSubmissionNotes}>
                <textarea
                  value={editBuilding.submissionNotes || ""}
                  onChange={(e) => updateField("submissionNotes", e.target.value)}
                  rows={2}
                  placeholder={t.submissionNotesPlaceholder}
                  className="w-full rounded-lg p-3 text-[13.5px] outline-none"
                  style={{
                    background: tone.card,
                    border: `1px solid ${tone.line}`,
                    color: tone.ink,
                    resize: "vertical",
                  }}
                />
              </LabeledField>

              <LabeledField label={t.labelSpecialReq}>
                <textarea
                  value={editBuilding.specialNotes || ""}
                  onChange={(e) => updateField("specialNotes", e.target.value)}
                  rows={2}
                  placeholder={t.specialReqPlaceholder}
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
                    {t.delete}
                  </Btn>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Btn variant="outline" onClick={closeDialog}>
                  {t.cancel}
                </Btn>
                <Btn variant="primary" onClick={handleSave} disabled={saving}>
                  {saving ? t.saving : isNew ? t.addBuildingTitle : t.save}
                </Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
