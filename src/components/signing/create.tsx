"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { X } from "lucide-react";
import { useLocale } from "@/lib/i18n-client";
import type { SigningPackage, SigningRequest } from "@/lib/signing-contract";
import { errorText, signingButton, signingFetch, signingInput } from "./client";

type Preview = {
  title: string;
  parts: {
    title: string;
    files: { name: string; sha256: string }[];
    recipients: { key: string; name: string; email: string; role: string }[];
  }[];
};
export function SigningCreate({
  mode,
  onClose,
}: {
  mode: "buyer" | "seller" | "custom";
  onClose: () => void;
}) {
  const zh = useLocale() === "zh",
    router = useRouter(),
    { data: session } = useSession();
  const [packages, setPackages] = useState<SigningPackage[]>([]),
    [packageId, setPackageId] = useState("");
  const [title, setTitle] = useState(""),
    [customer, setCustomer] = useState(""),
    [property, setProperty] = useState("");
  const [recipients, setRecipients] = useState<
      Record<string, { name: string; email: string }>
    >({}),
    [values, setValues] = useState<Record<string, string | string[]>>({});
  const [files, setFiles] = useState<File[]>([]),
    [preview, setPreview] = useState<Preview | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(mode !== "custom");
  const [submitted, setSubmitted] = useState<{
    payload: string;
    uploads: { id: string; name: string }[];
  } | null>(null);
  const selected = packages.find((p) => p.id === packageId);
  const roles = [
    ...new Map(
      selected?.definition
        .flatMap((part) => part.roles)
        .map((role) => [role.key, role]) || [],
    ).values(),
  ];
  const fieldMap = new Map<string, SigningPackage["definition"][number]["prefill"][number]>();
  for (const field of selected?.definition.flatMap((part) => part.prefill) || []) {
    const previous = fieldMap.get(field.key);
    fieldMap.set(field.key, {
      ...field,
      required: field.required || Boolean(previous?.required),
    });
  }
  const fields = [...fieldMap.values()];
  // These catalog keys share the single business input; other published fields remain explicit.
  const sharedKeys = new Set(
    fields
      .filter(
        (field) =>
          field.valueType === "TEXT" &&
          ["property_address", "customer_name"].includes(field.key),
      )
      .map((field) => field.key),
  );
  const additionalFields = fields.filter((field) => !sharedKeys.has(field.key));
  const sharedRequired = (key: string) =>
    fields.some(
      (field) => sharedKeys.has(key) && field.key === key && field.required,
    );
  useEffect(() => {
    if (mode === "custom") return;
    let live = true;
    signingFetch<{ items: SigningPackage[] }>("packages")
      .then((data) => {
        if (live) setPackages(data.items.filter((p) => p.scenario === mode));
      })
      .catch((e) => {
        if (live) setError(errorText(e, zh));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [mode, zh]);
  function choosePackage(id: string) {
    const item = packages.find((p) => p.id === id);
    setPackageId(id);
    setPreview(null);
    setValues({});
    if (!title && item) setTitle(item.title);
    const next: Record<string, { name: string; email: string }> = {};
    for (const role of item?.definition.flatMap((part) => part.roles) || [])
      next[role.key] =
        role.actor === "owner"
          ? { name: session?.user.name || "", email: session?.user.email || "" }
          : role.actor === "company"
            ? {
                name: item?.company_signer_name || "",
                email: item?.company_signer_email || "",
              }
            : { name: "", email: "" };
    setRecipients(next);
  }
  function payload() {
    const storageKey = `homix-signing-create:${mode}`;
    let id = sessionStorage.getItem(storageKey);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(storageKey, id);
    }
    return {
      title,
      scenario: mode,
      packageId: selected?.id,
      companyKey: selected?.company_key || "homix_realty",
      idempotencyKey: id,
      externalReference: `workspace:${id}`,
      business: { customer, property, reference: "" },
      recipients: roles.map((r) => ({ key: r.key, ...recipients[r.key] })),
      values: {
        ...values,
        ...(sharedKeys.has("property_address")
          ? { property_address: property }
          : {}),
        ...(sharedKeys.has("customer_name") ? { customer_name: customer } : {}),
      },
    };
  }
  async function submit(create: boolean) {
    setError("");
    setBusy(true);
    try {
      const body = payload();
      if (!create) {
        setPreview(await signingFetch<Preview>("packages/preview", body));
        return;
      }
      const serialized = JSON.stringify(body);
      if (submitted && submitted.payload !== serialized)
        throw new Error("IDEMPOTENCY_KEY_REUSED");
      let uploads = submitted?.uploads || [];
      if (mode === "custom" && !submitted) {
        if (
          !files.length ||
          files.length > 10 ||
          files.some(
            (file) =>
              file.size > 25 * 1024 * 1024 || file.type !== "application/pdf",
          ) ||
          files.reduce((n, f) => n + f.size, 0) > 100 * 1024 * 1024
        )
          throw new Error("INVALID_UPLOAD");
        uploads = [];
        for (const file of files) {
          const upload = await signingFetch<{
            uploadId: string;
            uploadUrl: string;
          }>("uploads", { fileName: file.name, byteSize: file.size });
          const response = await fetch(upload.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": "application/pdf" },
            body: file,
          });
          if (!response.ok) throw new Error("UPLOAD_FAILED");
          uploads.push({ id: upload.uploadId, name: file.name });
        }
      }
      setSubmitted({ payload: serialized, uploads });
      const request = await signingFetch<SigningRequest>(
        "requests",
        mode === "custom" ? { ...body, uploads } : body,
      );
      sessionStorage.removeItem(`homix-signing-create:${mode}`);
      router.push(`/signing/${request.id}`);
    } catch (e) {
      setError(errorText(e, zh));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label={zh ? "准备签署" : "Prepare signing"}
      className="rounded-lg border border-line bg-white p-4 sm:p-6"
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium">
          {zh ? "准备签署文件" : "Prepare signing documents"}
        </h2>
        <button
          type="button"
          className={signingButton}
          onClick={onClose}
          disabled={busy}
          aria-label={zh ? "关闭准备表单" : "Close preparation form"}
        >
          <X size={16} />
        </button>
      </div>
      {loading ? (
        <p aria-busy="true">
          {zh ? "读取公司签署包…" : "Loading company packages…"}
        </p>
      ) : mode !== "custom" && !packages.length ? (
        <p className="rounded-md bg-paper p-4 text-sm">
          {zh
            ? "公司尚未发布此类签署包。请管理员在签署管理中选定实际合同并发布。"
            : "No company package is published for this scenario. Ask an administrator to publish the approved documents in Signing administration."}
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(mode === "custom" || Boolean(preview));
          }}
          onChange={() => setPreview(null)}
          className="space-y-5"
        >
          <fieldset
            disabled={busy || Boolean(submitted)}
            className="space-y-5 disabled:opacity-70"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {mode !== "custom" && (
                <label className="text-sm">
                  {zh ? "公司签署包" : "Company package"}
                  <select
                    className={signingInput}
                    required
                    value={packageId}
                    onChange={(e) => choosePackage(e.target.value)}
                  >
                    <option value="">
                      {zh
                        ? "选择文件组合与版本"
                        : "Select document set and version"}
                    </option>
                    {packages.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.title} · v{p.version} ·{" "}
                        {p.company_key === "homix_living"
                          ? "Homix Living"
                          : "Homix Realty"}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="text-sm">
                {zh ? "任务名称" : "Request title"}
                <input
                  required
                  maxLength={200}
                  className={signingInput}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="text-sm">
                {zh ? "客户名称" : "Client name"}
                <input
                  maxLength={200}
                  required={sharedRequired("customer_name")}
                  className={signingInput}
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                />
              </label>
              <label className="text-sm">
                {zh ? "房产地址" : "Property address"}
                <input
                  maxLength={500}
                  required={sharedRequired("property_address")}
                  className={signingInput}
                  value={property}
                  onChange={(e) => setProperty(e.target.value)}
                />
              </label>
            </div>
            {mode === "custom" && (
              <div>
                <label className="text-sm">
                  {zh
                    ? "PDF 文件（最多 10 份，每份 25 MB，总计 100 MB）"
                    : "PDF files (up to 10; 25 MB each, 100 MB total)"}
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    multiple
                    required
                    className={signingInput}
                    onChange={(e) => setFiles(Array.from(e.target.files || []))}
                  />
                </label>
                <p className="mt-2 text-sm text-ink-50">
                  {zh
                    ? "创建后进入 Documenso 添加签署人和字段，在发送前核对。"
                    : "After creation, add recipients and fields in Documenso and review before sending."}
                </p>
              </div>
            )}
            {roles.length > 0 && (
              <fieldset className="space-y-3">
                <legend className="mb-2 font-medium">
                  {zh ? "签署人" : "Recipients"}
                </legend>
                {roles.map((role) => (
                  <div
                    key={role.key}
                    className="grid gap-2 rounded-md bg-paper p-3 sm:grid-cols-[9rem_1fr_1fr]"
                  >
                    <p className="self-center text-sm">{role.label}</p>
                    <label className="text-xs">
                      {zh ? "姓名" : "Name"}
                      <input
                        required
                        className={signingInput}
                        value={recipients[role.key]?.name || ""}
                        onChange={(e) =>
                          setRecipients({
                            ...recipients,
                            [role.key]: {
                              ...recipients[role.key],
                              name: e.target.value,
                            },
                          })
                        }
                      />
                    </label>
                    <label className="text-xs">
                      {zh ? "邮箱" : "Email"}
                      <input
                        required
                        type="email"
                        readOnly={role.actor === "company"}
                        className={signingInput}
                        value={recipients[role.key]?.email || ""}
                        onChange={(e) =>
                          setRecipients({
                            ...recipients,
                            [role.key]: {
                              ...recipients[role.key],
                              email: e.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  </div>
                ))}
              </fieldset>
            )}
            {additionalFields.length > 0 && (
              <fieldset>
                <legend className="mb-3 font-medium">
                  {zh ? "合同资料" : "Contract details"}
                </legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  {additionalFields.map((field) => (
                    <label key={field.key} className="text-sm">
                      {field.label}
                      {field.required ? " *" : ""}
                      {field.valueType === "CHECKBOX" ? (
                        <select
                          multiple
                          required={field.required}
                          className={signingInput}
                          value={
                            Array.isArray(values[field.key])
                              ? (values[field.key] as string[])
                              : []
                          }
                          onChange={(e) =>
                            setValues({
                              ...values,
                              [field.key]: Array.from(
                                e.target.selectedOptions,
                                (o) => o.value,
                              ),
                            })
                          }
                        >
                          {field.options?.map((option) => (
                            <option key={option}>{option}</option>
                          ))}
                        </select>
                      ) : field.options?.length ? (
                        <select
                          required={field.required}
                          className={signingInput}
                          value={String(values[field.key] || "")}
                          onChange={(e) =>
                            setValues({
                              ...values,
                              [field.key]: e.target.value,
                            })
                          }
                        >
                          <option value="">{zh ? "请选择" : "Select"}</option>
                          {field.options.map((option) => (
                            <option key={option}>{option}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          required={field.required}
                          type={
                            field.valueType === "NUMBER" ? "number" : "text"
                          }
                          step="any"
                          className={signingInput}
                          value={String(values[field.key] || "")}
                          onChange={(e) =>
                            setValues({
                              ...values,
                              [field.key]: e.target.value,
                            })
                          }
                        />
                      )}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </fieldset>
          {preview && (
            <div className="rounded-md border border-line p-4">
              <h3 className="font-medium">
                {zh ? "核对文件和收件人" : "Review documents and recipients"}
              </h3>
              {preview.parts.map((part, index) => (
                <div key={index} className="mt-3 border-t border-line pt-3">
                  <p className="font-medium">{part.title}</p>
                  <ul className="my-2 list-inside list-disc text-sm">
                    {part.files.map((f) => (
                      <li key={f.sha256}>{f.name}</li>
                    ))}
                  </ul>
                  <p className="break-words text-sm text-ink-50">
                    {part.recipients
                      .map((r) => `${r.name} <${r.email}>`)
                      .join(" · ")}
                  </p>
                </div>
              ))}
              <p className="mt-3 text-sm">
                {zh
                  ? "每个文件组的收件人均能查看组内全部文件。创建草稿后仍需确认发送。"
                  : "Each group’s recipients can view every file in that group. Sending requires a separate confirmation after draft creation."}
              </p>
            </div>
          )}
          {error && (
            <p role="alert" className="rounded-md bg-amber-50 p-3 text-sm">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className={`${signingButton} !bg-homix-accent !text-white`}
              disabled={busy || (mode !== "custom" && !selected)}
            >
              {busy
                ? zh
                  ? "处理中…"
                  : "Working…"
                : submitted
                  ? zh
                    ? "继续核对本次创建"
                    : "Reconcile this creation"
                  : mode === "custom"
                    ? zh
                      ? "上传并创建草稿"
                      : "Upload and create draft"
                    : preview
                      ? zh
                        ? "确认并创建草稿"
                        : "Confirm and create draft"
                      : zh
                        ? "预览签署包"
                        : "Preview package"}
            </button>
            <p className="text-xs text-ink-50">
              {zh
                ? "此步骤不会发送邀请。"
                : "This step does not send invitations."}
            </p>
          </div>
        </form>
      )}
      {error && (loading || (mode !== "custom" && !packages.length)) && (
        <p role="alert" className="mt-3 text-sm">
          {error}
        </p>
      )}
    </section>
  );
}
