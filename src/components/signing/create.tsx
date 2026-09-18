"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { X } from "lucide-react";
import { useLocale } from "@/lib/i18n-client";
import type { SigningPackage, SigningRequest } from "@/lib/signing-contract";
import type { SigningCompanyIdentity } from "@/lib/signing-company-identity";
import { SigningPackagePreview } from "./package-preview";
import {
  errorText,
  SigningFetchError,
  signingButton,
  signingFetch,
  signingInput,
} from "./client";

function packageRoles(item?: SigningPackage) {
  return [
    ...new Map(
      item?.definition
        .flatMap((part) => part.roles)
        .map((role) => [role.key, role]) || [],
    ).values(),
  ];
}
function clientCount(item: SigningPackage) {
  return packageRoles(item).filter((role) => role.actor === "customer").length;
}

export function SigningCreate({
  mode,
  onClose,
}: {
  mode: "buyer" | "seller" | "commercial" | "company_file";
  onClose: () => void;
}) {
  const internal = mode === "company_file";
  const zh = useLocale() === "zh",
    router = useRouter(),
    params = useSearchParams(),
    { data: session } = useSession();
  const predecessor = params.get("from") || "";
  const storageKey = `homix-signing-create:${mode}:${predecessor}`;
  const [reissueReason, setReissueReason] = useState("");
  const [packages, setPackages] = useState<SigningPackage[]>([]);
  const [agentIdentity, setAgentIdentity] =
    useState<SigningCompanyIdentity | null>(null);
  const [packageId, setPackageId] = useState("");
  const [title, setTitle] = useState("");
  const [property, setProperty] = useState("");
  const [reference, setReference] = useState("");
  const [recipients, setRecipients] = useState<
    Record<string, { name: string; email: string }>
  >({});
  const [values, setValues] = useState<Record<string, string | string[]>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState<Record<string, unknown> | null>(
    null,
  );
  const selected = packages.find((item) => item.id === packageId);
  const allRoles = packageRoles(selected);
  const roles = allRoles.filter(
    (role) => !role.optional || Object.hasOwn(recipients, role.key),
  );
  const clients = roles.filter((role) => role.actor === "customer");
  const activeRoleKeys = new Set(roles.map((role) => role.key));
  const owner = roles.find((role) => role.actor === "owner");
  const autoValues: Record<string, string> = {
    property_address: property,
    company_name: agentIdentity?.companyName || "",
    company_address: agentIdentity?.companyAddress || "",
    company_mailing_line: agentIdentity?.companyMailingLine || "",
    broker_license: agentIdentity?.brokerLicense || "",
    agent_license: agentIdentity?.agentLicense || "",
    agent_phone: agentIdentity?.agentPhone || "",
    customer_name: recipients[clients[0]?.key]?.name || "",
    customer_1_name: recipients[clients[0]?.key]?.name || "",
    customer_1_email: recipients[clients[0]?.key]?.email || "",
    customer_2_name: recipients[clients[1]?.key]?.name || "",
    customer_2_email: recipients[clients[1]?.key]?.email || "",
    agent_name: agentIdentity?.legalName || "",
    agent_email: owner
      ? recipients[owner.key]?.email || ""
      : session?.user.email || "",
  };
  const merged = new Map<
    string,
    SigningPackage["definition"][number]["prefill"][number]
  >();
  for (const field of selected?.definition.flatMap((part) => part.prefill) ||
    []) {
    if (field.recipientKey && !activeRoleKeys.has(field.recipientKey)) continue;
    merged.set(field.key, {
      ...field,
      required: field.required || Boolean(merged.get(field.key)?.required),
    });
  }
  const fields = [...merged.values()];
  const autoFields = fields.filter(
    (field) =>
      field.valueType === "TEXT" && Object.hasOwn(autoValues, field.key),
  );
  const extraFields = fields.filter((field) => !autoFields.includes(field));
  const propertyRequired = fields.some(
    (field) => field.key === "property_address" && field.required,
  );

  useEffect(() => {
    let live = true;
    signingFetch<{
      items: SigningPackage[];
      agentIdentity: SigningCompanyIdentity | null;
    }>("packages")
      .then(async (data) => {
        if (!live) return;
        setAgentIdentity(data.agentIdentity);
        const catalog = data.items.filter((item) => item.scenario === mode);
        setPackages(catalog);
        const saved = sessionStorage.getItem(storageKey);
        const seed = saved
          ? JSON.parse(saved)
          : predecessor
            ? await signingFetch<{
                packageId: string;
                title: string;
                business: { property: string };
                recipients: Array<{ key: string; name: string; email: string }>;
                values: Record<string, string | string[]>;
                reissueReason?: string;
              }>(`requests/${predecessor}/reissue`)
            : null;
        if (!live || !seed) return;
        setPackageId(
          catalog.some((item) => item.id === seed.packageId)
            ? seed.packageId
            : "",
        );
        setTitle(seed.title);
        setProperty(seed.business.property);
        setRecipients(
          Object.fromEntries(
            seed.recipients.map(
              (person: { key: string; name: string; email: string }) => [
                person.key,
                { name: person.name, email: person.email },
              ],
            ),
          ),
        );
        setValues(seed.values);
        setReference(seed.business?.reference || "");
        setReissueReason(seed.reissueReason || "");
        if (saved) setSubmitted(seed);
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
  }, [mode, zh, predecessor, storageKey]);

  function choosePackage(id: string) {
    const item = packages.find((candidate) => candidate.id === id);
    setPackageId(id);
    if (!predecessor) setValues({});
    setTitle(item?.title || "");
    const next: typeof recipients = {};
    for (const role of packageRoles(item)) {
      if (role.optional && !(predecessor && recipients[role.key])) continue;
      next[role.key] =
        predecessor && recipients[role.key] && role.actor !== "company"
          ? recipients[role.key]
          : role.actor === "owner"
            ? {
                name: agentIdentity?.legalName || "",
                email: agentIdentity?.email || session?.user.email || "",
              }
            : role.actor === "company"
              ? {
                  name: item?.company_signer_name || "",
                  email: item?.company_signer_email || "",
                }
              : { name: "", email: "" };
    }
    setRecipients(next);
  }
  async function prepare() {
    setBusy(true);
    setError("");
    try {
      if (!selected && !submitted) throw new Error("PACKAGE_NOT_AVAILABLE");
      const id = crypto.randomUUID();
      const payload = submitted || {
        title,
        scenario: mode,
        packageId: selected!.id,
        companyKey: agentIdentity?.companyKey,
        idempotencyKey: id,
        externalReference: `workspace:${id}`,
        ...(predecessor
          ? { predecessorRequestId: predecessor, reissueReason }
          : {}),
        business: {
          customer: clients
            .map((role) => recipients[role.key]?.name)
            .filter(Boolean)
            .join(" / ")
            .slice(0, 200),
          property,
          reference,
        },
        recipients: roles.map((role) => ({
          key: role.key,
          ...recipients[role.key],
        })),
        values: {
          ...values,
          ...Object.fromEntries(
            autoFields.map((field) => [field.key, autoValues[field.key]]),
          ),
        },
      };
      sessionStorage.setItem(storageKey, JSON.stringify(payload));
      setSubmitted(payload);
      const task = await signingFetch<SigningRequest>("requests", payload);
      sessionStorage.removeItem(storageKey);
      router.push(`/signing/${task.id}`);
    } catch (e) {
      if (e instanceof SigningFetchError && [400, 403].includes(e.status)) {
        sessionStorage.removeItem(storageKey);
        setSubmitted(null);
      }
      setError(errorText(e, zh));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label={
        internal
          ? "Company File"
          : zh
            ? "准备公司文件包"
            : "Prepare a company package"
      }
      className="rounded-lg border border-line bg-white p-4 sm:p-6"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium">
          {internal
            ? "Company File"
            : zh
              ? "准备公司文件包"
              : "Prepare a company package"}
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
      <p className="mb-5 text-sm text-ink-50">
        {internal
          ? zh
            ? "填写公司内部材料，再核对并由本人确认或签署。此分类不添加客户收件人。"
            : "Prepare an internal company file, then review and approve or sign it yourself. No client recipients are added."
          : zh
            ? "填写每位客户的姓名和邮箱。下一步核对文件，确认发送后，各签署人才会收到自己的邀请。"
            : "Enter each client's name and email. Review the package next; invitations are sent only after you confirm."}
      </p>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {!loading && !agentIdentity?.legalName && (
        <p
          role="alert"
          className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900"
        >
          {zh
            ? "请先在个人档案补齐 Legal name，再准备协议；如已签署过协议，请联系管理员核对。"
            : "Complete your Legal name in My profile before preparing an agreement. Contact the office for an existing signed identity."}{" "}
          <a href="/profile" className="underline">
            {zh ? "个人档案" : "My profile"}
          </a>
        </p>
      )}
      {loading ? (
        <p aria-busy="true">
          {zh ? "读取公司签署包…" : "Loading company packages…"}
        </p>
      ) : !packages.length ? (
        <p className="rounded-md bg-paper p-4 text-sm">
          {zh
            ? "你所属公司尚未发布此类文件包。公司完成模板配置后，即可在这里使用。"
            : "Your company has not published a package for this scenario yet. It will appear here once configured."}
        </p>
      ) : (
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void prepare();
          }}
        >
          {predecessor && (
            <label className="block text-sm">
              {zh ? "重新准备原因" : "Reason for replacement"}
              <input
                className={signingInput}
                required
                minLength={5}
                maxLength={2000}
                disabled={busy || Boolean(submitted)}
                value={reissueReason}
                onChange={(event) => setReissueReason(event.target.value)}
              />
            </label>
          )}
          <fieldset
            disabled={busy || Boolean(submitted)}
            className="space-y-5 disabled:opacity-70"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                {zh ? "公司文件包" : "Company package"}
                <select
                  required
                  className={signingInput}
                  value={packageId}
                  onChange={(event) => choosePackage(event.target.value)}
                >
                  <option value="">
                    {zh ? "选择适用的文件包" : "Choose a package"}
                  </option>
                  {packages.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.catalog_kind === "document"
                        ? zh
                          ? "[单份文件] "
                          : "[Document] "
                        : ""}
                      {item.title} ·{" "}
                      {internal ? (
                        zh ? (
                          "公司内部"
                        ) : (
                          "Internal"
                        )
                      ) : (
                        <>
                          {packageRoles(item).some((role) => role.optional)
                            ? `${packageRoles(item).filter((role) => role.actor === "customer" && !role.optional).length}–${clientCount(item)}`
                            : clientCount(item)}{" "}
                          {zh ? "位客户" : "clients"}
                        </>
                      )}{" "}
                      · v{item.version}
                    </option>
                  ))}
                </select>
              </label>
              {selected && (
                <>
                  {selected.components?.length ? (
                    <div className="rounded-md bg-paper p-3 text-sm sm:col-span-2">
                      <p className="font-medium">
                        {zh ? "包含以下独立文件" : "Included documents"}
                      </p>
                      <ol className="mt-2 space-y-1">
                        {selected.components.map((file, index) => (
                          <li key={file.id}>
                            {index + 1}. {file.title} · v{file.version}
                          </li>
                        ))}
                      </ol>
                      <p className="mt-2 text-ink-50">
                        {zh
                          ? "资料填写一次；每位客户通过一个入口逐份签署，完成件分别保存。"
                          : "Enter details once. Each client reviews and signs the documents through one entry; completed PDFs remain separate."}
                      </p>
                    </div>
                  ) : null}
                  {selected.selectors[zh ? "usageZh" : "usageEn"] && (
                    <p className="rounded-md bg-paper-deep p-3 text-sm sm:col-span-2">
                      {selected.selectors[zh ? "usageZh" : "usageEn"]}
                    </p>
                  )}
                  <SigningPackagePreview
                    key={selected.id}
                    item={selected}
                    zh={zh}
                  />
                  <p className="text-sm text-ink-50 sm:col-span-2">
                    {zh ? "所属公司：" : "Company: "}
                    {agentIdentity?.companyName ||
                      (zh
                        ? "请先在个人档案完善所属公司"
                        : "Complete your company in My profile")}
                  </p>
                  <label className="text-sm">
                    {zh ? "任务名称" : "Request title"}
                    <input
                      required
                      maxLength={200}
                      className={signingInput}
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </label>
                  <label className="text-sm">
                    {zh ? "房产地址" : "Property address"}
                    {!propertyRequired &&
                      (zh ? "（可稍后确定）" : " (optional)")}
                    <input
                      required={propertyRequired}
                      maxLength={500}
                      className={signingInput}
                      value={property}
                      onChange={(event) => setProperty(event.target.value)}
                    />
                  </label>
                </>
              )}
            </div>
            {selected && internal && (
              <label className="block text-sm">
                {zh ? "交易参考号（选填）" : "Transaction reference (optional)"}
                <input
                  className={signingInput}
                  maxLength={200}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </label>
            )}
            {selected && (
              <fieldset className="space-y-3">
                <legend className="mb-2 font-medium">
                  {internal
                    ? zh
                      ? "填报经纪人"
                      : "Preparing agent"
                    : zh
                      ? "签署人"
                      : "Recipients"}
                </legend>
                {roles.map((role) => (
                  <div
                    key={role.key}
                    className="grid gap-3 rounded-md bg-paper p-3 sm:grid-cols-[9rem_1fr_1fr]"
                  >
                    <div className="self-center text-sm">
                      {role.label}
                      {role.optional && (
                        <button
                          type="button"
                          className="ml-2 text-sm underline"
                          onClick={() =>
                            setRecipients((current) => {
                              const next = { ...current };
                              delete next[role.key];
                              return next;
                            })
                          }
                        >
                          {zh ? "移除" : "Remove"}
                        </button>
                      )}
                    </div>
                    <label className="text-xs">
                      {role.actor === "owner"
                        ? "Legal name"
                        : zh
                          ? "姓名"
                          : "Full name"}
                      <input
                        required
                        maxLength={200}
                        readOnly={
                          role.actor === "company" || role.actor === "owner"
                        }
                        className={signingInput}
                        value={
                          role.actor === "owner"
                            ? agentIdentity?.legalName || ""
                            : recipients[role.key]?.name || ""
                        }
                        onChange={(event) =>
                          setRecipients({
                            ...recipients,
                            [role.key]: {
                              ...recipients[role.key],
                              name: event.target.value,
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
                        maxLength={254}
                        readOnly={role.actor === "company"}
                        className={signingInput}
                        value={recipients[role.key]?.email || ""}
                        onChange={(event) =>
                          setRecipients({
                            ...recipients,
                            [role.key]: {
                              ...recipients[role.key],
                              email: event.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  </div>
                ))}
                {allRoles
                  .filter(
                    (role) =>
                      role.optional && !Object.hasOwn(recipients, role.key),
                  )
                  .map((role) => (
                    <button
                      key={role.key}
                      type="button"
                      className={signingButton}
                      onClick={() =>
                        setRecipients((current) => ({
                          ...current,
                          [role.key]: { name: "", email: "" },
                        }))
                      }
                    >
                      {zh ? `添加${role.label}` : `Add ${role.label}`}
                    </button>
                  ))}
                <p className="text-xs text-ink-50">
                  {internal
                    ? zh
                      ? "文件及完成记录按经纪人和所属公司保存，供公司内部使用。"
                      : "The file and completion record are retained for the agent and their company."
                    : zh
                      ? "每位客户用自己的姓名签署。公司持有文件，不代表公司必须签字；签署角色由本文件包决定。"
                      : "Each client signs in their own name. The package defines who signs; company ownership does not add an extra signer."}
                </p>
              </fieldset>
            )}
            {extraFields.length > 0 && (
              <fieldset>
                <legend className="mb-3 font-medium">
                  {zh ? "合同资料" : "Contract details"}
                </legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  {extraFields.map((field) => (
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
                          onChange={(event) =>
                            setValues({
                              ...values,
                              [field.key]: Array.from(
                                event.target.selectedOptions,
                                (option) => option.value,
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
                          onChange={(event) =>
                            setValues({
                              ...values,
                              [field.key]: event.target.value,
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
                          maxLength={10000}
                          className={signingInput}
                          value={String(values[field.key] || "")}
                          onChange={(event) =>
                            setValues({
                              ...values,
                              [field.key]: event.target.value,
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
          <button
            type="submit"
            disabled={
              busy ||
              !agentIdentity?.legalName ||
              !agentIdentity?.companyKey ||
              (!selected && !submitted)
            }
            className={`${signingButton} !bg-homix-accent !text-white`}
          >
            {busy
              ? zh
                ? "正在准备…"
                : "Preparing…"
              : submitted
                ? zh
                  ? "继续本次准备"
                  : "Resume preparation"
                : zh
                  ? "准备并预览文件包"
                  : "Prepare and preview package"}
          </button>
        </form>
      )}
    </section>
  );
}
