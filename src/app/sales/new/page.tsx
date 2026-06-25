"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Btn, Card, EditorialInput, Icons, LabeledField, Pill } from "@/components/homix/primitives";
import { PageHeader, CardHeader } from "@/components/homix/page-kit";
import { DealBreakdownBar } from "@/components/homix/deal-breakdown";
import { fmtMoney, tone } from "@/components/homix/tokens";
import { computeCommission } from "@/lib/commission";
import {
  SALE_REPRESENTATION_OPTIONS,
  SALE_STAGE_OPTIONS,
  type SaleRepresentation,
  type SaleStage,
} from "@/lib/sales";
import type { Agent } from "@/db/schema";
import { useLocale } from "@/lib/i18n-client";

const M = {
  en: {
    back: "Back",
    eyebrow: "Create",
    title: "New sale",
    cancel: "Cancel",
    saving: "Saving…",
    saveSale: "Save Sale",
    transaction: "Transaction",
    representation: "Representation",
    stage: "Stage",
    contractDate: "Contract date",
    closingDate: "Closing date",
    property: "Property",
    address: "Address *",
    addressPlaceholder: "Street address, unit",
    city: "City",
    state: "State",
    zip: "ZIP",
    propertyType: "Property type",
    propertyTypePlaceholder: "Condo, co-op, house...",
    mls: "MLS #",
    fileId: "File ID",
    parties: "Parties",
    buyerNames: "Buyer name(s)",
    buyerNamesPlaceholder: "Use commas for multiple buyers",
    sellerNames: "Seller name(s)",
    sellerNamesPlaceholder: "Use commas for multiple sellers",
    agents: "Agents",
    primaryAgent: "Primary agent *",
    agent: "Agent",
    selectAgent: "Select agent",
    sharePct: "Share %",
    primary: "Primary",
    remove: "Remove",
    addAgent: "Add agent",
    totalShare: "Total share",
    commission: "Commission",
    purchasePrice: "Purchase price",
    grossCommission: "Gross commission",
    referralAmount: "Referral amount",
    brokerageFee: "Brokerage/admin fee",
    outsideContacts: "Outside Contacts",
    listingAgent: "Listing agent",
    listingAgentEmail: "Listing agent email",
    listingBrokerage: "Listing brokerage",
    cooperatingAgent: "Cooperating agent",
    cooperatingAgentEmail: "Cooperating agent email",
    cooperatingBrokerage: "Cooperating brokerage",
    closingContacts: "Closing Contacts",
    buyerAttorney: "Buyer attorney",
    sellerAttorney: "Seller attorney",
    titleCompany: "Title company",
    lender: "Lender",
    escrowHolder: "Escrow holder",
    notes: "Notes",
    saleSummary: "Sale Summary",
    propertyAddress: "Property address",
    locationPending: "Location pending",
    closingSet: "Closing set",
    grossCommissionLabel: "Gross Commission",
    netSplitBase: "Net split base",
    errAddressRequired: "Property address is required",
    errAgentSelected: "Every sale agent must be selected",
    errAgentsUnique: "Sale agents must be unique",
    errOnePrimary: "Exactly one primary agent is required",
    errSharesTotal: "Agent shares must total 100%",
    saleCreated: "Sale created",
    saveFailed: "Save failed",
  },
  zh: {
    back: "返回",
    eyebrow: "新建",
    title: "买卖交易",
    cancel: "取消",
    saving: "保存中…",
    saveSale: "保存交易",
    transaction: "交易",
    representation: "代理方",
    stage: "阶段",
    contractDate: "合同日期",
    closingDate: "过户日期",
    property: "房产",
    address: "地址 *",
    addressPlaceholder: "街道地址、单元",
    city: "城市",
    state: "州",
    zip: "邮编",
    propertyType: "房产类型",
    propertyTypePlaceholder: "公寓、合作公寓、独栋……",
    mls: "MLS 编号",
    fileId: "档案编号",
    parties: "交易方",
    buyerNames: "买家姓名",
    buyerNamesPlaceholder: "多位买家请用逗号分隔",
    sellerNames: "卖家姓名",
    sellerNamesPlaceholder: "多位卖家请用逗号分隔",
    agents: "经纪人",
    primaryAgent: "主经纪人 *",
    agent: "经纪人",
    selectAgent: "选择经纪人",
    sharePct: "分成 %",
    primary: "主经纪人",
    remove: "删除",
    addAgent: "添加经纪人",
    totalShare: "分成合计",
    commission: "佣金",
    purchasePrice: "成交价",
    grossCommission: "总佣金",
    referralAmount: "转介费金额",
    brokerageFee: "经纪/管理费",
    outsideContacts: "外部联系人",
    listingAgent: "挂牌经纪人",
    listingAgentEmail: "挂牌经纪人邮箱",
    listingBrokerage: "挂牌经纪公司",
    cooperatingAgent: "合作经纪人",
    cooperatingAgentEmail: "合作经纪人邮箱",
    cooperatingBrokerage: "合作经纪公司",
    closingContacts: "过户联系人",
    buyerAttorney: "买方律师",
    sellerAttorney: "卖方律师",
    titleCompany: "产权公司",
    lender: "贷款机构",
    escrowHolder: "托管方",
    notes: "备注",
    saleSummary: "交易摘要",
    propertyAddress: "房产地址",
    locationPending: "地点待定",
    closingSet: "过户已定",
    grossCommissionLabel: "总佣金",
    netSplitBase: "净分成基数",
    errAddressRequired: "房产地址为必填项",
    errAgentSelected: "请为每位经纪人选择人选",
    errAgentsUnique: "交易经纪人不能重复",
    errOnePrimary: "必须且只能有一位主经纪人",
    errSharesTotal: "经纪人分成合计必须为 100%",
    saleCreated: "交易已创建",
    saveFailed: "保存失败",
  },
} as const;

type SaleParticipantInput = {
  agentId: number | null;
  sharePct: number;
  isPrimary: boolean;
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function SelectShell({
  value,
  onChange,
  children,
}: {
  value: string | number;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-10 rounded-lg px-3 text-[13.5px] outline-none"
      style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink }}
    >
      {children}
    </select>
  );
}

export default function NewSalePage() {
  const router = useRouter();
  const t = M[useLocale()];
  const { data: session } = useSession();
  const [agents, setAgents] = useState<Array<{ agent: Agent; teamName: string | null }>>([]);
  const [saving, setSaving] = useState(false);

  const [representationType, setRepresentationType] = useState<SaleRepresentation>("buyer_rep");
  const [stage, setStage] = useState<SaleStage>("pre_contract");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("NY");
  const [zip, setZip] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [mlsNumber, setMlsNumber] = useState("");
  const [fileId, setFileId] = useState("");
  const [buyerNames, setBuyerNames] = useState("");
  const [sellerNames, setSellerNames] = useState("");
  const [contractDate, setContractDate] = useState("");
  const [closingDate, setClosingDate] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [grossCommission, setGrossCommission] = useState("");
  const [referralAmount, setReferralAmount] = useState("");
  const [brokerageFee, setBrokerageFee] = useState("");
  const [listingAgentName, setListingAgentName] = useState("");
  const [listingAgentEmail, setListingAgentEmail] = useState("");
  const [listingBrokerage, setListingBrokerage] = useState("");
  const [cooperatingAgentName, setCooperatingAgentName] = useState("");
  const [cooperatingAgentEmail, setCooperatingAgentEmail] = useState("");
  const [cooperatingBrokerage, setCooperatingBrokerage] = useState("");
  const [buyerAttorney, setBuyerAttorney] = useState("");
  const [sellerAttorney, setSellerAttorney] = useState("");
  const [titleCompany, setTitleCompany] = useState("");
  const [lenderName, setLenderName] = useState("");
  const [escrowHolder, setEscrowHolder] = useState("");
  const [notes, setNotes] = useState("");
  const [saleParticipants, setSaleParticipants] = useState<SaleParticipantInput[]>([
    { agentId: null, sharePct: 100, isPrimary: true },
  ]);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((rows) => setAgents(rows));
  }, []);

  useEffect(() => {
    if (saleParticipants[0]?.agentId || agents.length === 0) return;
    const currentAgentId = session?.user?.agentId;
    const defaultAgent =
      agents.find((row) => row.agent.id === currentAgentId)?.agent ||
      agents[0]?.agent;
    if (defaultAgent) {
      setSaleParticipants([{ agentId: defaultAgent.id, sharePct: 100, isPrimary: true }]);
    }
  }, [agents, saleParticipants, session?.user?.agentId]);

  const selectedParticipants = useMemo(
    () =>
      saleParticipants.map((participant) => ({
        ...participant,
        agent: agents.find((row) => row.agent.id === participant.agentId)?.agent || null,
      })),
    [agents, saleParticipants]
  );

  const shareTotal = selectedParticipants.reduce((sum, participant) => sum + Number(participant.sharePct || 0), 0);
  const referral = Number(referralAmount || 0);
  const brokerage = Number(brokerageFee || 0);
  const commissionBase = Math.max(0, Number(grossCommission || 0) - referral - brokerage);
  const breakdown = useMemo(
    () =>
      computeCommission({
        totalCommission: commissionBase,
        agents: selectedParticipants
          .filter((participant) => participant.agent)
          .map((participant) => ({
            agentId: participant.agent!.id,
            name: participant.agent!.name,
            sharePct: Number(participant.sharePct || 0),
            splitPct: Number(participant.agent!.splitPct || 0),
            isPrimary: participant.isPrimary,
          })),
      }),
    [commissionBase, selectedParticipants]
  );

  const updateParticipant = (
    index: number,
    patch: Partial<SaleParticipantInput>
  ) => {
    setSaleParticipants((prev) =>
      prev.map((participant, i) =>
        i === index ? { ...participant, ...patch } : participant
      )
    );
  };

  const setPrimaryParticipant = (index: number) => {
    setSaleParticipants((prev) =>
      prev.map((participant, i) => ({ ...participant, isPrimary: i === index }))
    );
  };

  const addParticipant = () => {
    setSaleParticipants((prev) => [...prev, { agentId: null, sharePct: 0, isPrimary: false }]);
  };

  const removeParticipant = (index: number) => {
    setSaleParticipants((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (!next.some((participant) => participant.isPrimary) && next[0]) {
        next[0] = { ...next[0], isPrimary: true };
      }
      return next.length > 0 ? next : [{ agentId: null, sharePct: 100, isPrimary: true }];
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyAddress.trim()) return toast.error(t.errAddressRequired);
    if (selectedParticipants.some((participant) => !participant.agentId)) {
      return toast.error(t.errAgentSelected);
    }
    if (new Set(selectedParticipants.map((participant) => participant.agentId)).size !== selectedParticipants.length) {
      return toast.error(t.errAgentsUnique);
    }
    if (selectedParticipants.filter((participant) => participant.isPrimary).length !== 1) {
      return toast.error(t.errOnePrimary);
    }
    if (Math.abs(shareTotal - 100) > 0.01) {
      return toast.error(t.errSharesTotal);
    }

    setSaving(true);
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          representationType,
          stage,
          propertyAddress,
          city,
          state,
          zip,
          propertyType,
          mlsNumber,
          fileId,
          buyerNames,
          sellerNames,
          contractDate,
          closingDate,
          purchasePrice: purchasePrice ? Number(purchasePrice) : null,
          grossCommission: Number(grossCommission || 0),
          referralAmount: referralAmount ? Number(referralAmount) : null,
          brokerageFee: brokerageFee ? Number(brokerageFee) : null,
          listingAgentName,
          listingAgentEmail,
          listingBrokerage,
          cooperatingAgentName,
          cooperatingAgentEmail,
          cooperatingBrokerage,
          buyerAttorney,
          sellerAttorney,
          titleCompany,
          lenderName,
          escrowHolder,
          notes,
          agents: selectedParticipants.map((participant) => ({
            agentId: participant.agentId,
            sharePct: Number(participant.sharePct || 0),
            isPrimary: participant.isPrimary,
          })),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const saleDeal = await res.json();
      toast.success(t.saleCreated);
      router.push(`/sales/${saleDeal.id}`);
    } catch {
      toast.error(t.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-7">
      <div className="space-y-4">
        <Link href="/sales" className="flex w-fit items-center gap-1.5 text-[12.5px]" style={{ color: tone.ink50 }}>
          <Icons.Back /> {t.back}
        </Link>
        <PageHeader
          eyebrow={t.eyebrow}
          title={t.title}
          actions={
            <>
              <Btn variant="outline" onClick={() => router.back()}>
                {t.cancel}
              </Btn>
              <Btn variant="primary" icon={<Icons.Check />} type="submit" disabled={saving}>
                {saving ? t.saving : t.saveSale}
              </Btn>
            </>
          }
        />
      </div>

      <div className="grid gap-8" style={{ gridTemplateColumns: "minmax(0, 1fr) 520px" }}>
        <div className="space-y-6">
          <Card>
            <CardHeader title={t.transaction} />
            <div className="p-6 grid grid-cols-2 gap-4">
              <LabeledField label={t.representation}>
                <SelectShell value={representationType} onChange={(value) => setRepresentationType(value as SaleRepresentation)}>
                  {SALE_REPRESENTATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </SelectShell>
              </LabeledField>
              <LabeledField label={t.stage}>
                <SelectShell value={stage} onChange={(value) => setStage(value as SaleStage)}>
                  {SALE_STAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </SelectShell>
              </LabeledField>
              <LabeledField label={t.contractDate}>
                <EditorialInput value={contractDate} onChange={setContractDate} type="date" mono />
              </LabeledField>
              <LabeledField label={t.closingDate}>
                <EditorialInput value={closingDate} onChange={setClosingDate} type="date" mono />
              </LabeledField>
            </div>
          </Card>

          <Card>
            <CardHeader title={t.property} />
            <div className="p-6 grid grid-cols-2 gap-4">
              <LabeledField label={t.address} wide>
                <EditorialInput value={propertyAddress} onChange={setPropertyAddress} placeholder={t.addressPlaceholder} />
              </LabeledField>
              <LabeledField label={t.city}>
                <EditorialInput value={city} onChange={setCity} />
              </LabeledField>
              <LabeledField label={t.state}>
                <EditorialInput value={state} onChange={setState} mono />
              </LabeledField>
              <LabeledField label={t.zip}>
                <EditorialInput value={zip} onChange={setZip} mono />
              </LabeledField>
              <LabeledField label={t.propertyType}>
                <EditorialInput value={propertyType} onChange={setPropertyType} placeholder={t.propertyTypePlaceholder} />
              </LabeledField>
              <LabeledField label={t.mls}>
                <EditorialInput value={mlsNumber} onChange={setMlsNumber} mono />
              </LabeledField>
              <LabeledField label={t.fileId}>
                <EditorialInput value={fileId} onChange={setFileId} mono />
              </LabeledField>
            </div>
          </Card>

          <Card>
            <CardHeader title={t.parties} />
            <div className="p-6 grid grid-cols-2 gap-4">
              <LabeledField label={t.buyerNames} wide>
                <EditorialInput value={buyerNames} onChange={setBuyerNames} placeholder={t.buyerNamesPlaceholder} />
              </LabeledField>
              <LabeledField label={t.sellerNames} wide>
                <EditorialInput value={sellerNames} onChange={setSellerNames} placeholder={t.sellerNamesPlaceholder} />
              </LabeledField>
            </div>
          </Card>

          <Card>
            <CardHeader title={t.agents} />
            <div className="p-6 space-y-4">
              {saleParticipants.map((participant, index) => (
                <div
                  key={index}
                  className="rounded-xl p-4 space-y-4"
                  style={{ background: tone.paper, border: `1px solid ${tone.lineSoft}` }}
                >
                  <div className="grid grid-cols-[1fr_120px_auto] gap-3 items-end">
                    <LabeledField label={participant.isPrimary ? t.primaryAgent : t.agent}>
                      <SelectShell
                        value={participant.agentId || ""}
                        onChange={(value) =>
                          updateParticipant(index, {
                            agentId: Number(value) || null,
                          })
                        }
                      >
                        <option value="">{t.selectAgent}</option>
                        {agents.map(({ agent, teamName }) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name} {teamName ? `· ${teamName}` : ""}
                          </option>
                        ))}
                      </SelectShell>
                    </LabeledField>
                    <LabeledField label={t.sharePct}>
                      <EditorialInput
                        value={participant.sharePct}
                        onChange={(value) => updateParticipant(index, { sharePct: Number(value) })}
                        type="number"
                        mono
                      />
                    </LabeledField>
                    <div className="flex items-center gap-2 pb-1">
                      <button
                        type="button"
                        onClick={() => setPrimaryParticipant(index)}
                        className="h-9 px-3 rounded-md text-[12px]"
                        style={{
                          background: participant.isPrimary ? tone.accentSoft : tone.card,
                          border: `1px solid ${participant.isPrimary ? tone.accent : tone.line}`,
                          color: participant.isPrimary ? tone.accent : tone.ink70,
                        }}
                      >
                        {t.primary}
                      </button>
                      {saleParticipants.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeParticipant(index)}
                          className="h-9 px-3 rounded-md text-[12px]"
                          style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.rose }}
                        >
                          {t.remove}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Btn variant="outline" size="sm" icon={<Icons.Plus />} onClick={addParticipant}>
                  {t.addAgent}
                </Btn>
                <div
                  className="text-[12px] font-mono"
                  style={{ color: Math.abs(shareTotal - 100) > 0.01 ? tone.rose : tone.ink50 }}
                >
                  {t.totalShare} {shareTotal}%
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title={t.commission} />
            <div className="p-6 grid grid-cols-2 gap-4">
              <LabeledField label={t.purchasePrice}>
                <EditorialInput value={purchasePrice} onChange={setPurchasePrice} type="number" prefix="$" mono />
              </LabeledField>
              <LabeledField label={t.grossCommission}>
                <EditorialInput value={grossCommission} onChange={setGrossCommission} type="number" prefix="$" mono />
              </LabeledField>
              <LabeledField label={t.referralAmount}>
                <EditorialInput value={referralAmount} onChange={setReferralAmount} type="number" prefix="$" mono />
              </LabeledField>
              <LabeledField label={t.brokerageFee}>
                <EditorialInput value={brokerageFee} onChange={setBrokerageFee} type="number" prefix="$" mono />
              </LabeledField>
            </div>
          </Card>

          <Card>
            <CardHeader title={t.outsideContacts} />
            <div className="p-6 grid grid-cols-2 gap-4">
              <LabeledField label={t.listingAgent}>
                <EditorialInput value={listingAgentName} onChange={setListingAgentName} />
              </LabeledField>
              <LabeledField label={t.listingAgentEmail}>
                <EditorialInput value={listingAgentEmail} onChange={setListingAgentEmail} mono />
              </LabeledField>
              <LabeledField label={t.listingBrokerage} wide>
                <EditorialInput value={listingBrokerage} onChange={setListingBrokerage} />
              </LabeledField>
              <LabeledField label={t.cooperatingAgent}>
                <EditorialInput value={cooperatingAgentName} onChange={setCooperatingAgentName} />
              </LabeledField>
              <LabeledField label={t.cooperatingAgentEmail}>
                <EditorialInput value={cooperatingAgentEmail} onChange={setCooperatingAgentEmail} mono />
              </LabeledField>
              <LabeledField label={t.cooperatingBrokerage} wide>
                <EditorialInput value={cooperatingBrokerage} onChange={setCooperatingBrokerage} />
              </LabeledField>
            </div>
          </Card>

          <Card>
            <CardHeader title={t.closingContacts} />
            <div className="p-6 grid grid-cols-2 gap-4">
              <LabeledField label={t.buyerAttorney}>
                <EditorialInput value={buyerAttorney} onChange={setBuyerAttorney} />
              </LabeledField>
              <LabeledField label={t.sellerAttorney}>
                <EditorialInput value={sellerAttorney} onChange={setSellerAttorney} />
              </LabeledField>
              <LabeledField label={t.titleCompany}>
                <EditorialInput value={titleCompany} onChange={setTitleCompany} />
              </LabeledField>
              <LabeledField label={t.lender}>
                <EditorialInput value={lenderName} onChange={setLenderName} />
              </LabeledField>
              <LabeledField label={t.escrowHolder} wide>
                <EditorialInput value={escrowHolder} onChange={setEscrowHolder} />
              </LabeledField>
            </div>
          </Card>

          <Card>
            <CardHeader title={t.notes} />
            <div className="p-6">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full rounded-lg p-3 text-[13.5px] outline-none"
                style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink, resize: "vertical" }}
              />
            </div>
          </Card>
        </div>

        <div>
          <div className="sticky top-24 space-y-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.16em]" style={{ color: tone.ink50 }}>
              {t.saleSummary}
            </div>
            <Card>
              <div className="p-6">
                <div className="font-serif" style={{ fontSize: 30, color: tone.ink, lineHeight: 1 }}>
                  {propertyAddress || t.propertyAddress}
                </div>
                <div className="mt-2 text-[13px]" style={{ color: tone.ink70 }}>
                  {[city, state, zip].filter(Boolean).join(", ") || t.locationPending}
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Pill tone="accent">{SALE_REPRESENTATION_OPTIONS.find((option) => option.value === representationType)?.label}</Pill>
                  <Pill tone="neutral">{SALE_STAGE_OPTIONS.find((option) => option.value === stage)?.label}</Pill>
                  {closingDate && <Pill tone="draft">{t.closingSet}</Pill>}
                </div>

                <div className="mt-8 rounded-lg p-4" style={{ background: tone.paper }}>
                  <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: tone.ink50 }}>
                    {t.grossCommissionLabel}
                  </div>
                  <div className="mt-2 font-serif" style={{ fontSize: 44, color: tone.ink, lineHeight: 1 }}>
                    ${fmtMoney(Number(grossCommission || 0))}
                  </div>
                  <div className="mt-2 text-[12px] font-mono" style={{ color: tone.ink50 }}>
                    {t.netSplitBase} ${fmtMoney(commissionBase)}
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-3">
                  {selectedParticipants.filter((participant) => participant.agent).map((participant) => (
                    <div key={participant.agent!.id} className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center font-serif" style={{ background: tone.accentSoft, color: tone.accent }}>
                        {initials(participant.agent!.name)}
                      </div>
                      <div>
                        <div className="text-[12.5px]" style={{ color: tone.ink }}>
                          {participant.agent!.name}
                        </div>
                        <div className="text-[11px]" style={{ color: tone.ink50 }}>
                          {participant.sharePct}% share · {Number(participant.agent!.splitPct || 0)}% split
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-8">
                  <DealBreakdownBar breakdown={breakdown} />
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </form>
  );
}
