"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, FilterTabs } from "@/components/homix/page-kit";
import { useLocale } from "@/lib/i18n-client";
import type { SigningPackage } from "@/lib/signing-contract";
import { errorText, signingButton, signingInput } from "./client";

type Connection = {
  id: string;
  scope: "customer" | "company";
  ownerAgentId: number | null;
  companyKey: string | null;
  nativeEmail: string;
  teamUrl: string;
  revokedAt: string | null;
};
type Person = {
  id: number;
  name: string;
  email: string;
  accountStatus: string;
  isAdmin: boolean;
};
type Template = {
  id: string;
  title: string;
  files: { id: string; title: string }[];
  roles: { id: number; name: string; role: string; order: number | null }[];
  fields: {
    id: number;
    label: string;
    type: string;
    readOnly: boolean;
    itemId: string;
    recipientId: number;
  }[];
};
type DraftPart = {
  templateId: string;
  title: string;
  roles: {
    key: string;
    templateRecipientId: number;
    actor: "owner" | "company" | "customer";
    label: string;
  }[];
  prefill: {
    key: string;
    templateFieldId: number;
    required: boolean;
    label: string;
  }[];
};
async function adminFetch<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    `/api/admin/signing/${path}`,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "SIGNING_UNAVAILABLE");
  return result as T;
}

export function SigningAdministration() {
  const zh = useLocale() === "zh";
  const [tab, setTab] = useState("packages"),
    [packages, setPackages] = useState<SigningPackage[]>([]),
    [connections, setConnections] = useState<Connection[]>([]),
    [people, setPeople] = useState<Person[]>([]);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<"customer" | "company">("customer"),
    [agentId, setAgentId] = useState(""),
    [company, setCompany] = useState("homix_realty"),
    [token, setToken] = useState(""),
    [proofId, setProofId] = useState(""),
    [notes, setNotes] = useState(""),
    [isolation, setIsolation] = useState(false);
  const [connectionId, setConnectionId] = useState("");
  const [webhook, setWebhook] = useState<{
    path: string;
    header: string;
    secret: string;
  } | null>(null);
  const [source, setSource] = useState(""),
    [templates, setTemplates] = useState<{ id: string; title: string }[]>([]),
    [templatePage, setTemplatePage] = useState(1),
    [templatePages, setTemplatePages] = useState(1),
    [templateId, setTemplateId] = useState(""),
    [template, setTemplate] = useState<Template | null>(null);
  const [draftPart, setDraftPart] = useState<DraftPart | null>(null),
    [parts, setParts] = useState<DraftPart[]>([]);
  const [scenario, setScenario] = useState("buyer"),
    [packageKey, setPackageKey] = useState(""),
    [version, setVersion] = useState(1),
    [title, setTitle] = useState(""),
    [plan, setPlan] = useState(""),
    [libor, setLibor] = useState("");
  const [retire, setRetire] = useState<{
      kind: "packages" | "connections";
      id: string;
      title: string;
    } | null>(null),
    [reason, setReason] = useState("");
  const load = useCallback(async () => {
    const [p, c, a] = await Promise.all([
      adminFetch<{ items: SigningPackage[] }>("packages"),
      adminFetch<{ items: Connection[] }>("connections"),
      fetch("/api/agents", { cache: "no-store" }).then(async (r) => {
        if (!r.ok) throw new Error("AGENTS_UNAVAILABLE");
        return r.json() as Promise<Person[]>;
      }),
    ]);
    setPackages(p.items);
    setConnections(c.items);
    setPeople(a.filter((person) => person.accountStatus === "active"));
  }, []);
  useEffect(() => {
    load().catch((e) => setError(errorText(e, zh)));
  }, [load, zh]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e, zh));
    } finally {
      setBusy(false);
    }
  }
  async function register() {
    await adminFetch(
      connectionId ? `connections/${connectionId}/rotate` : "connections",
      {
        scope,
        agentId: Number(agentId),
        companyKey: company,
        token,
        proofEnvelopeId: proofId,
        isolationNotes: notes,
        isolationConfirmed: isolation,
      },
    );
    setToken("");
    setProofId("");
    setIsolation(false);
    setConnectionId("");
    await load();
    setNotice(
      zh
        ? "签署账号已核验并关联。请配置该空间的事件回调。"
        : "Signing account verified and connected. Configure its webhook next.",
    );
  }
  async function listTemplates(id: string, page = 1) {
    setSource(id);
    setTemplate(null);
    setDraftPart(null);
    setTemplateId("");
    if (!id) {
      setTemplates([]);
      return;
    }
    const result = await adminFetch<{
      items: { id: string; title: string }[];
      page: number;
      totalPages: number;
    }>(`connections/${id}/templates?page=${page}`);
    setTemplates(result.items);
    setTemplatePage(result.page);
    setTemplatePages(result.totalPages);
  }
  async function inspectTemplate() {
    const result = await adminFetch<Template>(
      `connections/${source}/templates?templateId=${encodeURIComponent(templateId)}`,
    );
    setTemplate(result);
    setDraftPart({
      templateId: result.id,
      title: result.title,
      roles: result.roles.map((r, index) => ({
        key: `${scenario === "onboarding" || scenario === "team_leader" ? (index === 0 ? "agent" : "company") : "recipient"}${scenario === "buyer" || scenario === "seller" ? `_${index + 1}` : ""}`,
        templateRecipientId: r.id,
        actor:
          scenario === "onboarding" || scenario === "team_leader"
            ? index === 0
              ? "owner"
              : "company"
            : "customer",
        label: r.name || `${zh ? "签署人" : "Recipient"} ${index + 1}`,
      })),
      prefill: [],
    });
  }
  async function publish() {
    const connection = connections.find((c) => c.id === source);
    if (!connection?.companyKey || !parts.length)
      throw new Error("INVALID_REQUEST");
    await adminFetch("packages", {
      packageKey,
      version,
      title,
      scenario,
      companyKey: connection.companyKey,
      selectors: {
        ...(plan ? { plan } : {}),
        ...(libor ? { liborMembershipStatus: libor } : {}),
      },
      parts,
    });
    setParts([]);
    setDraftPart(null);
    setTemplate(null);
    await load();
    setNotice(
      zh
        ? "新版本已发布，文件与字段指纹已固定。"
        : "New version published with pinned document and field fingerprints.",
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={zh ? "内容与文件" : "Content and documents"}
        title={zh ? "签署管理" : "Signing management"}
        description={
          zh
            ? "维护公司签署包和账号关联。模板及签署字段在 Documenso 编辑。"
            : "Manage company packages and account connections. Edit templates and fields in Documenso."
        }
      />
      <FilterTabs
        value={tab}
        onChange={setTab}
        options={[
          { id: "packages", label: zh ? "签署包" : "Packages" },
          { id: "connections", label: zh ? "签署账号" : "Signing accounts" },
        ]}
      />
      {error && (
        <p role="alert" className="rounded-md bg-amber-50 p-4 text-sm">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-md bg-green-50 p-4 text-sm">
          {notice}
        </p>
      )}
      {retire && (
        <section className="rounded-lg border border-line bg-white p-4">
          <p>
            {zh ? "确认停用" : "Confirm retirement"}：{retire.title}
          </p>
          <p className="mt-2 text-sm text-ink-50">
            {retire.kind === "packages"
              ? zh
                ? "停止新建时使用此版本，已创建的合同保持可查。"
                : "Stop using this version for new requests. Existing documents remain available."
              : zh
                ? "停用后，此空间的同步和操作会停止；Documenso 中的成员权限需要另外撤销。"
                : "Synchronization and operations for this connection will stop. Revoke native membership separately."}
          </p>
          {retire.kind === "connections" && (
            <label className="mt-3 block text-sm">
              {zh ? "原因" : "Reason"}
              <input
                className={signingInput}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          )}
          <div className="mt-4 flex gap-2">
            <button
              disabled={
                busy ||
                (retire.kind === "connections" && reason.trim().length < 5)
              }
              className={signingButton}
              onClick={() =>
                void action(async () => {
                  await adminFetch(
                    `${retire.kind}/${retire.id}/${retire.kind === "packages" ? "retire" : "revoke"}`,
                    { reason },
                  );
                  setRetire(null);
                  setReason("");
                  await load();
                })
              }
            >
              {zh ? "确认停用" : "Confirm"}
            </button>
            <button
              disabled={busy}
              className={signingButton}
              onClick={() => setRetire(null)}
            >
              {zh ? "取消" : "Cancel"}
            </button>
          </div>
        </section>
      )}
      {tab === "connections" ? (
        <>
          <section className="overflow-hidden rounded-lg border border-line bg-white">
            <ul className="divide-y divide-line">
              {connections.map((connection) => (
                <li
                  key={connection.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <div>
                    <p className="font-medium">
                      {connection.scope === "company"
                        ? `${zh ? "公司 / HR" : "Company / HR"} · ${connection.companyKey}`
                        : people.find((p) => p.id === connection.ownerAgentId)
                            ?.name || `#${connection.ownerAgentId}`}
                    </p>
                    <p className="break-all text-sm text-ink-50">
                      {connection.nativeEmail} · {connection.teamUrl}
                      {connection.revokedAt
                        ? zh
                          ? " · 已停用"
                          : " · Revoked"
                        : ""}
                    </p>
                  </div>
                  {!connection.revokedAt && (
                    <div className="flex gap-2">
                      <button
                        disabled={busy}
                        className={signingButton}
                        onClick={() =>
                          void action(async () =>
                            setWebhook(
                              await adminFetch(
                                `connections/${connection.id}/webhook-configuration`,
                              ),
                            ),
                          )
                        }
                      >
                        {zh ? "回调设置" : "Webhook setup"}
                      </button>
                      <button
                        disabled={busy}
                        className={signingButton}
                        onClick={() =>
                          setRetire({
                            kind: "connections",
                            id: connection.id,
                            title: connection.nativeEmail,
                          })
                        }
                      >
                        {zh ? "停用" : "Revoke"}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {!connections.length && (
              <p className="p-6 text-sm text-ink-50">
                {zh
                  ? "尚未关联签署空间。先建立公司 / HR 空间，再关联需要编辑客户文档的经纪人。"
                  : "No signing spaces are connected. Set up the company / HR space first, then connect agents who edit client documents."}
              </p>
            )}
          </section>
          {webhook && (
            <section className="rounded-lg border border-line bg-white p-4">
              <h2 className="font-medium">
                {zh
                  ? "在对应 Documenso 团队配置 Webhook"
                  : "Configure the webhook in this Documenso team"}
              </h2>
              <p className="my-3 text-sm">
                {zh
                  ? "使用 eSign API 的公网域名加以下路径，选择文档及签署人事件，并将密钥填入 Documenso 的 Secret。"
                  : "Use the public eSign API origin with this path, select document and recipient events, and paste the secret into Documenso’s Secret field."}
              </p>
              <p className="break-all text-sm">{webhook.path}</p>
              <label className="mt-3 block text-sm">
                Secret
                <input
                  readOnly
                  type="password"
                  className={signingInput}
                  value={webhook.secret}
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <button
                className={`${signingButton} mt-3`}
                onClick={() => setWebhook(null)}
              >
                {zh ? "关闭密钥显示" : "Close secret"}
              </button>
            </section>
          )}
          <section className="rounded-lg border border-line bg-white p-5">
            <h2 className="mb-3 font-medium">
              {zh ? "关联签署账号" : "Connect signing account"}
            </h2>
            <p className="mb-4 text-sm leading-6 text-ink-50">
              {zh
                ? "先在 Documenso 建立独立团队：普通经纪人只加入自己的客户团队，HR 团队仅加入公司管理员；关闭继承全体成员、启用文档所有权委托，并使用 ADMIN 文档可见性。用对应用户创建一份验证草稿后，在此关联。"
                : "Create isolated teams in Documenso: each agent joins only their client team; HR is restricted to company administrators. Disable inherited members, enable ownership delegation, and use ADMIN document visibility. Create a verification draft owned by the mapped user, then connect it here."}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(register);
              }}
              className="space-y-4"
            >
              <label className="block text-sm">
                {zh
                  ? "新关联 / 更新已有账号凭据"
                  : "New connection / update existing credentials"}
                <select
                  disabled={busy}
                  className={signingInput}
                  value={connectionId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setConnectionId(id);
                    setToken("");
                    setProofId("");
                    setIsolation(false);
                    const existing = connections.find((c) => c.id === id);
                    if (existing) {
                      setScope(existing.scope);
                      setCompany(existing.companyKey || "homix_realty");
                      setAgentId(
                        String(
                          existing.ownerAgentId ||
                            people.find(
                              (p) =>
                                p.email.toLowerCase() === existing.nativeEmail,
                            )?.id ||
                            "",
                        ),
                      );
                    }
                  }}
                >
                  <option value="">
                    {zh ? "建立新关联" : "Create a new connection"}
                  </option>
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nativeEmail} · {c.teamUrl}
                      {c.revokedAt ? (zh ? "（恢复）" : " (restore)") : ""}
                    </option>
                  ))}
                </select>
              </label>
              {connectionId && (
                <p className="text-sm text-ink-50">
                  {zh
                    ? "重新核验同一人员、同一原生团队后更新凭据，已有任务仍可继续。"
                    : "Reverify the same person and native team to replace credentials and retain existing requests."}
                </p>
              )}
              <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm">
                  {zh ? "用途" : "Purpose"}
                  <select
                    disabled={Boolean(connectionId)}
                    className={signingInput}
                    value={scope}
                    onChange={(e) => {
                      setScope(e.target.value as typeof scope);
                      setAgentId("");
                    }}
                  >
                    <option value="customer">
                      {zh ? "经纪人客户文件" : "Agent client documents"}
                    </option>
                    <option value="company">
                      {zh ? "公司 / HR 合同" : "Company / HR contracts"}
                    </option>
                  </select>
                </label>
                <label className="text-sm">
                  {zh ? "Portal 账号" : "Portal account"}
                  <select
                    required
                    className={signingInput}
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value)}
                  >
                    <option value="">
                      {zh ? "选择人员" : "Select person"}
                    </option>
                    {people
                      .filter((p) => scope !== "company" || p.isAdmin)
                      .map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name} · {person.email}
                        </option>
                      ))}
                  </select>
                </label>
                {scope === "company" && (
                  <label className="text-sm">
                    {zh ? "法律实体" : "Legal entity"}
                    <select
                      disabled={Boolean(connectionId)}
                      className={signingInput}
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                    >
                      <option value="homix_realty">Homix Realty</option>
                      <option value="homix_living">Homix Living</option>
                    </select>
                  </label>
                )}
                <label className="text-sm">
                  {zh ? "此团队的 API token" : "This team’s API token"}
                  <input
                    type="password"
                    autoComplete="off"
                    required
                    className={signingInput}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  {zh
                    ? "验证草稿的 Documenso ID"
                    : "Verification draft’s Documenso ID"}
                  <input
                    required
                    className={signingInput}
                    value={proofId}
                    onChange={(e) => setProofId(e.target.value)}
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  {zh
                    ? "权限核验记录（至少 20 个字符）"
                    : "Isolation verification notes (at least 20 characters)"}
                  <textarea
                    required
                    minLength={20}
                    className={signingInput}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
                <label className="flex items-start gap-2 text-sm sm:col-span-2">
                  <input
                    required
                    type="checkbox"
                    checked={isolation}
                    onChange={(e) => setIsolation(e.target.checked)}
                    className="mt-1"
                  />
                  {zh
                    ? "已用不同经纪人账号核验：不能查看对方文件或 HR 合同；所选账号拥有验证草稿。"
                    : "Verified with different agent accounts: neither can access the other’s files or HR documents, and the selected account owns the verification draft."}
                </label>
              </fieldset>
              <button disabled={busy} className={signingButton} type="submit">
                {connectionId
                  ? zh
                    ? "核验并更新凭据"
                    : "Verify and update credentials"
                  : zh
                    ? "核验并关联"
                    : "Verify and connect"}
              </button>
            </form>
          </section>
        </>
      ) : (
        <>
          <section className="overflow-hidden rounded-lg border border-line bg-white">
            <ul className="divide-y divide-line">
              {packages.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <div>
                    <p className="font-medium">
                      {item.title} · v{item.version}
                    </p>
                    <p className="mt-1 text-sm text-ink-50">
                      {item.company_key} ·{" "}
                      {item.definition.reduce((n, p) => n + p.files.length, 0)}{" "}
                      {zh ? "份文件" : "files"} · {item.definition.length}{" "}
                      {zh ? "组收件人" : "recipient groups"}
                    </p>
                  </div>
                  <button
                    className={signingButton}
                    disabled={busy}
                    onClick={() =>
                      setRetire({
                        kind: "packages",
                        id: item.id,
                        title: item.title,
                      })
                    }
                  >
                    {zh ? "停用此版本" : "Retire version"}
                  </button>
                </li>
              ))}
            </ul>
            {!packages.length && (
              <p className="p-6 text-sm text-ink-50">
                {zh
                  ? "尚未发布签署包。先在 Documenso 设置公司选定的真实合同和签署字段。"
                  : "No packages are published. Prepare the company’s approved documents and fields in Documenso first."}
              </p>
            )}
          </section>
          <section className="rounded-lg border border-line bg-white p-5">
            <h2 className="mb-4 font-medium">
              {zh ? "发布签署包版本" : "Publish a package version"}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(publish);
              }}
              className="space-y-5"
            >
              <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm">
                  {zh ? "公司模板空间" : "Company template space"}
                  <select
                    required
                    value={source}
                    className={signingInput}
                    onChange={(e) => {
                      setParts([]);
                      void action(() => listTemplates(e.target.value));
                    }}
                  >
                    <option value="">
                      {zh ? "选择公司空间" : "Select company space"}
                    </option>
                    {connections
                      .filter((c) => c.scope === "company" && !c.revokedAt)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.companyKey} · {c.nativeEmail}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="text-sm">
                  {zh ? "使用场景" : "Scenario"}
                  <select
                    className={signingInput}
                    value={scenario}
                    onChange={(e) => {
                      setScenario(e.target.value);
                      setPlan(
                        e.target.value === "team_leader" ? "solo_pro" : "",
                      );
                      setLibor("");
                      setParts([]);
                      setDraftPart(null);
                    }}
                  >
                    <option value="buyer">{zh ? "买家包" : "Buyer"}</option>
                    <option value="seller">{zh ? "卖家包" : "Seller"}</option>
                    <option value="onboarding">
                      {zh ? "经纪人入职" : "Agent onboarding"}
                    </option>
                    <option value="team_leader">
                      {zh ? "团队负责人" : "Team leader"}
                    </option>
                  </select>
                </label>
                <label className="text-sm">
                  {zh ? "显示名称" : "Display title"}
                  <input
                    required
                    className={signingInput}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  {zh
                    ? "固定用途编号（如 buyer-standard）"
                    : "Stable package key (e.g. buyer-standard)"}
                  <input
                    required
                    pattern="[a-zA-Z0-9][a-zA-Z0-9_.:-]*"
                    className={signingInput}
                    value={packageKey}
                    onChange={(e) => setPackageKey(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  {zh ? "新版本号" : "New version number"}
                  <input
                    required
                    min={1}
                    type="number"
                    className={signingInput}
                    value={version}
                    onChange={(e) => setVersion(Number(e.target.value))}
                  />
                </label>
                {(scenario === "onboarding" || scenario === "team_leader") && (
                  <>
                    <label className="text-sm">
                      {zh ? "适用计划" : "Applicable plan"}
                      <select
                        required
                        disabled={scenario === "team_leader"}
                        className={signingInput}
                        value={plan}
                        onChange={(e) => setPlan(e.target.value)}
                      >
                        <option value="">
                          {zh ? "选择计划" : "Select plan"}
                        </option>
                        <option value="solo">Solo</option>
                        <option value="solo_pro">Solo Pro</option>
                        <option value="team_member">Team Member</option>
                      </select>
                    </label>
                    <label className="text-sm">
                      {zh ? "LIBOR 适用情况" : "LIBOR membership selector"}
                      <select
                        className={signingInput}
                        value={libor}
                        onChange={(e) => setLibor(e.target.value)}
                      >
                        <option value="">
                          {zh ? "不适用" : "Not applicable"}
                        </option>
                        <option value="existing_member">
                          {zh ? "现有会员" : "Existing member"}
                        </option>
                        <option value="apply_new">
                          {zh ? "新会员" : "New member"}
                        </option>
                      </select>
                    </label>
                  </>
                )}
              </fieldset>
              {source && (
                <div className="space-y-3 rounded-md bg-paper p-4">
                  <label className="block text-sm">
                    {zh ? "原生模板" : "Native template"}
                    <select
                      className={signingInput}
                      value={templateId}
                      onChange={(e) => setTemplateId(e.target.value)}
                    >
                      <option value="">
                        {zh ? "选择模板" : "Select template"}
                      </option>
                      {templates.map((t) => (
                        <option value={t.id} key={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy || !templateId}
                      className={signingButton}
                      onClick={() => void action(inspectTemplate)}
                    >
                      {zh ? "读取角色与字段" : "Load roles and fields"}
                    </button>
                    {templatePage > 1 && (
                      <button
                        type="button"
                        disabled={busy}
                        className={signingButton}
                        onClick={() =>
                          void action(() =>
                            listTemplates(source, templatePage - 1),
                          )
                        }
                      >
                        {zh ? "上一页模板" : "Previous templates"}
                      </button>
                    )}
                    {templatePage < templatePages && (
                      <button
                        type="button"
                        disabled={busy}
                        className={signingButton}
                        onClick={() =>
                          void action(() =>
                            listTemplates(source, templatePage + 1),
                          )
                        }
                      >
                        {zh ? "下一页模板" : "More templates"}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-ink-50">
                    {zh
                      ? "模板放在公司团队根目录。每个模板作为一组相同收件人可见的文件；不同可见范围请添加另一组。"
                      : "Keep templates in the company team root. Each template is a file group visible to all its recipients; use another group for a different audience."}
                  </p>
                </div>
              )}
              {draftPart && template && (
                <div className="space-y-4 rounded-md border border-line p-4">
                  <h3 className="font-medium">{draftPart.title}</h3>
                  <p className="text-sm text-ink-50">
                    {template.files.map((f) => f.title).join(" · ")}
                  </p>
                  {draftPart.roles.map((role, index) => (
                    <div
                      className="grid gap-3 sm:grid-cols-3"
                      key={role.templateRecipientId}
                    >
                      <label className="text-xs">
                        {role.label} ·{" "}
                        {zh ? "业务角色编号" : "Business role key"}
                        <input
                          className={signingInput}
                          value={role.key}
                          onChange={(e) =>
                            setDraftPart({
                              ...draftPart,
                              roles: draftPart.roles.map((r, i) =>
                                i === index ? { ...r, key: e.target.value } : r,
                              ),
                            })
                          }
                        />
                      </label>
                      <label className="text-xs">
                        {zh ? "显示名称" : "Role label"}
                        <input
                          className={signingInput}
                          value={role.label}
                          onChange={(e) =>
                            setDraftPart({
                              ...draftPart,
                              roles: draftPart.roles.map((r, i) =>
                                i === index
                                  ? { ...r, label: e.target.value }
                                  : r,
                              ),
                            })
                          }
                        />
                      </label>
                      <label className="text-xs">
                        {zh ? "身份来源" : "Identity source"}
                        <select
                          className={signingInput}
                          value={role.actor}
                          onChange={(e) =>
                            setDraftPart({
                              ...draftPart,
                              roles: draftPart.roles.map((r, i) =>
                                i === index
                                  ? {
                                      ...r,
                                      actor: e.target.value as typeof r.actor,
                                    }
                                  : r,
                              ),
                            })
                          }
                        >
                          <option value="owner">
                            {zh ? "本人经纪人" : "Current agent"}
                          </option>
                          <option value="company">
                            {zh ? "公司签署人" : "Company signer"}
                          </option>
                          <option value="customer">
                            {zh ? "填写客户" : "Entered client"}
                          </option>
                        </select>
                      </label>
                    </div>
                  ))}
                  {template.fields.map((field) => {
                    const configured = draftPart.prefill.find(
                      (p) => p.templateFieldId === field.id,
                    );
                    return (
                      <div
                        key={field.id}
                        className="grid items-end gap-3 border-t border-line pt-3 sm:grid-cols-3"
                      >
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={Boolean(configured)}
                            onChange={(e) =>
                              setDraftPart({
                                ...draftPart,
                                prefill: e.target.checked
                                  ? [
                                      ...draftPart.prefill,
                                      {
                                        key: `field_${field.id}`,
                                        templateFieldId: field.id,
                                        label:
                                          field.label || `Field ${field.id}`,
                                        required: true,
                                      },
                                    ]
                                  : draftPart.prefill.filter(
                                      (p) => p.templateFieldId !== field.id,
                                    ),
                              })
                            }
                          />
                          {field.label || `#${field.id}`} · {field.type}
                        </label>
                        {configured && (
                          <>
                            <label className="text-xs">
                              {zh ? "资料字段编号" : "Business field key"}
                              <input
                                className={signingInput}
                                value={configured.key}
                                onChange={(e) =>
                                  setDraftPart({
                                    ...draftPart,
                                    prefill: draftPart.prefill.map((p) =>
                                      p.templateFieldId === field.id
                                        ? { ...p, key: e.target.value }
                                        : p,
                                    ),
                                  })
                                }
                              />
                            </label>
                            <label className="text-xs">
                              {zh ? "用户填写时的名称" : "Input label"}
                              <input
                                className={signingInput}
                                value={configured.label}
                                onChange={(e) =>
                                  setDraftPart({
                                    ...draftPart,
                                    prefill: draftPart.prefill.map((p) =>
                                      p.templateFieldId === field.id
                                        ? { ...p, label: e.target.value }
                                        : p,
                                    ),
                                  })
                                }
                              />
                            </label>
                          </>
                        )}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    disabled={busy}
                    className={signingButton}
                    onClick={() => {
                      setParts([...parts, draftPart]);
                      setDraftPart(null);
                      setTemplate(null);
                    }}
                  >
                    {zh ? "加入此文件组" : "Add this document group"}
                  </button>
                </div>
              )}
              {parts.length > 0 && (
                <div className="space-y-3">
                  {parts.map((part, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between gap-3 rounded-md bg-paper p-3 text-sm"
                    >
                      <span>
                        {index + 1}. {part.title} ·{" "}
                        {part.roles.map((r) => r.label).join(" / ")}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        className={signingButton}
                        onClick={() =>
                          setParts(parts.filter((_, i) => i !== index))
                        }
                      >
                        {zh ? "移除" : "Remove"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="submit"
                disabled={busy || !parts.length}
                className={`${signingButton} !bg-homix-accent !text-white`}
              >
                {zh ? "核验并发布新版本" : "Verify and publish version"}
              </button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
