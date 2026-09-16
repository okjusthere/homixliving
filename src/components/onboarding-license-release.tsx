"use client";
import { RELEASE_LABELS, type LicenseReleaseInput } from "@/lib/onboarding-license";

export type ReleaseDraft = Omit<LicenseReleaseInput, "status"> & { status: LicenseReleaseInput["status"] | "" };
export function LicenseReleaseFields({ value, onChange, zh, disabled = false }: {
  value: ReleaseDraft; onChange: (value: ReleaseDraft) => void; zh: boolean; disabled?: boolean;
}) {
  return <fieldset disabled={disabled} className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
    <legend className="mb-2 text-sm font-medium">{zh ? "原公司执照 release 状态" : "Release from previous brokerage"}</legend>
    <label className="grid gap-1 text-sm">
      {zh ? "原公司 release 状态（必选）" : "Release status (required)"}
      <select required className="admin-control w-full" value={value.status} onChange={(event) => onChange({ ...value, status: event.target.value as ReleaseDraft["status"] })}>
        <option value="">{zh ? "请选择" : "Select status"}</option>
        {Object.entries(RELEASE_LABELS).map(([key, labels]) => <option key={key} value={key}>{labels[zh ? 0 : 1]}</option>)}
      </select>
    </label>
    {value.status !== "not_applicable" && <label className="grid gap-1 text-sm">
      {zh ? "原公司名称（必填）" : "Previous brokerage (required)"}
      <input required maxLength={200} className="admin-control w-full" value={value.previousCompany} onChange={(event) => onChange({ ...value, previousCompany: event.target.value })} />
    </label>}
    {value.status === "not_applicable" && <label className="grid gap-1 text-sm">
      {zh ? "不适用原因（例如已在 Homix，或首次领照）" : "Reason (e.g. already at Homix, or first license)"}
      <input required maxLength={1000} className="admin-control w-full" value={value.note} onChange={(event) => onChange({ ...value, note: event.target.value })} />
    </label>}
    <p className="text-xs text-stone-500 sm:col-span-2">{zh ? "这是你的情况申报，不代表 DOS 已完成接收。公司会人工核实；此资料不更改已发送或已签署的协议。" : "This is your declaration, not DOS confirmation. The company verifies affiliation manually. This does not alter sent or signed agreements."}</p>
  </fieldset>;
}
