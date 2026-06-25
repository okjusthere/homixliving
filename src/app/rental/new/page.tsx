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
import { SOURCE_OPTIONS, type DealSource } from "@/lib/sources";
import { companySplitPct, normalizeSplitPct, splitLabel } from "@/lib/splits";
import { useLocale } from "@/lib/i18n-client";
import type { Agent, Building, Deal } from "@/db/schema";

const M = {
  en: {
    nameRegionRequired: "Name and region are required",
    buildingAdded: "added",
    couldNotAddBuilding: "Could not add building",
    couldNotLoadRental: "Could not load rental",
    couldNotLoadForm: "Could not load form data",
    selectBuilding: "Please select a building",
    unitRequired: "Unit is required",
    tenantNameRequired: "Tenant name is required",
    commissionRequired: "Commission is required",
    everyAgentSelected: "Every rental agent must be selected",
    agentsUnique: "Rental agents must be unique",
    onePrimary: "Exactly one primary agent is required",
    sharesTotal: "Agent shares must total 100%",
    rentalUpdated: "Rental updated",
    rentalCreated: "Rental created",
    saveFailed: "Save failed",
    loading: "Loading…",
    eyebrowEdit: "Edit",
    eyebrowCreate: "Create",
    titleEdit: "Edit rental",
    titleNew: "New rental",
    back: "Back",
    cancel: "Cancel",
    saving: "Saving…",
    saveChanges: "Save Changes",
    saveRental: "Save Rental",
    building: "Building",
    change: "Change",
    searchBuildings: "Search buildings...",
    addNew: "Add new",
    noMatches: "No matches.",
    addAsNew1: "Add ",
    addAsNew2: " as a new building",
    tenantLease: "Tenant & Lease",
    unit: "Unit *",
    moveInDate: "Move-in date",
    tenantName: "Tenant name *",
    fullNames: "Full name(s)",
    tenantEmail: "Tenant email",
    tenantPhone: "Tenant phone",
    apartmentAddress: "Apartment address",
    leaseLength: "Lease length",
    monthlyRent: "Monthly rent",
    agents: "Agents",
    primaryAgent: "Primary agent *",
    agent: "Agent",
    selectAgent: "Select agent",
    sharePct: "Share %",
    primary: "Primary",
    remove: "Remove",
    split: "Split",
    agentKeeps: "Agent keeps",
    homixKeeps: "Homix keeps",
    addAgent: "Add agent",
    totalShare: "Total share",
    referral: "Referral",
    hasReferrer: "Has referrer",
    referrerName: "Referrer name",
    referrerNamePlaceholder: "e.g. Jane Smith / NYU housing office",
    type: "Type",
    percent: "Percent",
    flat: "Flat",
    amount: "Amount",
    paymentMethod: "Payment method",
    paymentHint: "How to pay this referrer once Homix collects from the building. Free-text — Zelle, ACH, wire, etc.",
    commission: "Commission",
    totalCommissionLabel: "Total commission *",
    referrer: "Referrer",
    homix: "Homix",
    agentDealShare: "deal share",
    splitSuffix: "split",
    source: "Source",
    sourceSubtitle: "客源来自哪里？— 帮我们分析渠道转化",
    notes: "Notes",
    rentalSummary: "Rental Summary",
    selectBuildingPlaceholder: "Select building",
    unitWord: "Unit",
    tenantWord: "Tenant",
    shareWord: "share",
    totalCommissionSummary: "Total Commission",
    referralPill: "Referral",
    agentsPill: "agents",
    moveInSet: "Move-in set",
    newBuilding: "New building",
    addABuilding: "Add a building",
    name: "Name *",
    namePlaceholder: "e.g. The Octagon",
    region: "Region *",
    regionPlaceholder: "e.g. NJ, BK, LIC",
    managementCompany: "Management company",
    managementPlaceholder: "e.g. Greystar",
    contactEmail: "Contact email",
    billToCompany: "Bill to (company)",
    billToCompanyPlaceholder: "Who the invoice is billed to",
    billToAddress: "Bill to (address)",
    billToAddressPlaceholder: "Mailing address for invoices",
    fillRestLater: "You can fill the rest later in the Buildings directory.",
    adding: "Adding…",
    addBuilding: "Add building",
  },
  zh: {
    nameRegionRequired: "请填写楼盘名称和区域",
    buildingAdded: "已添加",
    couldNotAddBuilding: "无法添加楼盘",
    couldNotLoadRental: "无法加载租约信息",
    couldNotLoadForm: "无法加载表单数据",
    selectBuilding: "请选择楼盘",
    unitRequired: "请填写单元",
    tenantNameRequired: "请填写租客姓名",
    commissionRequired: "请填写佣金",
    everyAgentSelected: "每一栏都需选择经纪人",
    agentsUnique: "经纪人不能重复",
    onePrimary: "须有且仅有一位主理经纪人",
    sharesTotal: "经纪人分成合计必须为 100%",
    rentalUpdated: "租赁已更新",
    rentalCreated: "租赁已创建",
    saveFailed: "保存失败",
    loading: "加载中…",
    eyebrowEdit: "编辑",
    eyebrowCreate: "创建",
    titleEdit: "编辑租赁",
    titleNew: "新建租赁",
    back: "返回",
    cancel: "取消",
    saving: "保存中…",
    saveChanges: "保存修改",
    saveRental: "保存租赁",
    building: "楼盘",
    change: "更改",
    searchBuildings: "搜索楼盘...",
    addNew: "新建",
    noMatches: "无匹配楼盘。",
    addAsNew1: "将 ",
    addAsNew2: " 添加为新楼盘",
    tenantLease: "租客与租约",
    unit: "单元 *",
    moveInDate: "入住日期",
    tenantName: "租客姓名 *",
    fullNames: "全名（可多人）",
    tenantEmail: "租客邮箱",
    tenantPhone: "租客电话",
    apartmentAddress: "公寓地址",
    leaseLength: "租约时长",
    monthlyRent: "月租",
    agents: "经纪人",
    primaryAgent: "主理经纪人 *",
    agent: "经纪人",
    selectAgent: "选择经纪人",
    sharePct: "分成 %",
    primary: "主理",
    remove: "删除",
    split: "分成",
    agentKeeps: "经纪人所得",
    homixKeeps: "Homix 所得",
    addAgent: "添加经纪人",
    totalShare: "分成合计",
    referral: "推荐",
    hasReferrer: "有推荐人",
    referrerName: "推荐人姓名",
    referrerNamePlaceholder: "如：Jane Smith / NYU 住房办公室",
    type: "类型",
    percent: "百分比",
    flat: "固定金额",
    amount: "金额",
    paymentMethod: "付款方式",
    paymentHint: "Homix 向楼盘收款后如何向该推荐人付款。自由填写——Zelle、ACH、电汇等。",
    commission: "佣金",
    totalCommissionLabel: "总佣金 *",
    referrer: "推荐人",
    homix: "Homix",
    agentDealShare: "交易分成",
    splitSuffix: "分成",
    source: "来源",
    sourceSubtitle: "客源来自哪里？— 帮我们分析渠道转化",
    notes: "备注",
    rentalSummary: "租赁摘要",
    selectBuildingPlaceholder: "选择楼盘",
    unitWord: "单元",
    tenantWord: "租客",
    shareWord: "分成",
    totalCommissionSummary: "总佣金",
    referralPill: "推荐",
    agentsPill: "位经纪人",
    moveInSet: "已设入住日期",
    newBuilding: "新建楼盘",
    addABuilding: "添加楼盘",
    name: "名称 *",
    namePlaceholder: "如：The Octagon",
    region: "区域 *",
    regionPlaceholder: "如：NJ、BK、LIC",
    managementCompany: "物业管理公司",
    managementPlaceholder: "如：Greystar",
    contactEmail: "联系邮箱",
    billToCompany: "账单抬头（公司）",
    billToCompanyPlaceholder: "发票开给谁",
    billToAddress: "账单地址",
    billToAddressPlaceholder: "发票邮寄地址",
    fillRestLater: "其余信息可稍后在楼盘目录中补全。",
    adding: "添加中…",
    addBuilding: "添加楼盘",
  },
} as const;

type DealParticipantInput = {
  agentId: number | null;
  sharePct: number;
  isPrimary: boolean;
};

type RentalDealPayload = {
  deal: Deal;
  building: Building | null;
  agents: Array<{
    agent: Agent;
    sharePct: number;
    isPrimary: boolean;
  }>;
};

type RentalDealFormPageProps = {
  mode?: "new" | "edit";
  dealId?: string;
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function RentalDealFormPage({ mode = "new", dealId }: RentalDealFormPageProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const t = M[useLocale()];
  const isEdit = mode === "edit";
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [agents, setAgents] = useState<Array<{ agent: Agent; teamName: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [buildingSearch, setBuildingSearch] = useState("");

  const [buildingId, setBuildingId] = useState<number | null>(null);
  const [showAddBuilding, setShowAddBuilding] = useState(false);
  const [addingBuilding, setAddingBuilding] = useState(false);
  const [newBuildingName, setNewBuildingName] = useState("");
  const [newBuildingRegion, setNewBuildingRegion] = useState("");
  const [newBuildingMgmt, setNewBuildingMgmt] = useState("");
  const [newBuildingBillTo, setNewBuildingBillTo] = useState("");
  const [newBuildingBillToAddress, setNewBuildingBillToAddress] = useState("");
  const [newBuildingContactEmail, setNewBuildingContactEmail] = useState("");

  const resetAddBuilding = () => {
    setNewBuildingName("");
    setNewBuildingRegion("");
    setNewBuildingMgmt("");
    setNewBuildingBillTo("");
    setNewBuildingBillToAddress("");
    setNewBuildingContactEmail("");
  };

  const handleAddBuilding = async () => {
    if (!newBuildingName.trim() || !newBuildingRegion.trim()) {
      toast.error(t.nameRegionRequired);
      return;
    }
    setAddingBuilding(true);
    try {
      const res = await fetch("/api/buildings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newBuildingName.trim(),
          region: newBuildingRegion.trim(),
          managementCompany: newBuildingMgmt.trim() || null,
          billToCompany: newBuildingBillTo.trim() || null,
          billToAddress: newBuildingBillToAddress.trim() || null,
          contactEmail: newBuildingContactEmail.trim() || null,
          submissionType: "email",
        }),
      });
      if (!res.ok) throw new Error();
      const created = (await res.json()) as Building;
      setBuildings((prev) => [...prev, created]);
      setBuildingId(created.id);
      toast.success(`${created.name} ${t.buildingAdded}`);
      setShowAddBuilding(false);
      resetAddBuilding();
    } catch {
      toast.error(t.couldNotAddBuilding);
    } finally {
      setAddingBuilding(false);
    }
  };
  const [unit, setUnit] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [tenantEmail, setTenantEmail] = useState("");
  const [tenantPhone, setTenantPhone] = useState("");
  const [apartmentAddress, setApartmentAddress] = useState("");
  const [moveInDate, setMoveInDate] = useState("");
  const [leaseLengthMonths, setLeaseLengthMonths] = useState(12);
  const [rentAmount, setRentAmount] = useState("");
  const [dealParticipants, setDealParticipants] = useState<DealParticipantInput[]>([
    { agentId: null, sharePct: 100, isPrimary: true },
  ]);
  const [hasReferrer, setHasReferrer] = useState(false);
  const [referrerName, setReferrerName] = useState("");
  const [referrerType, setReferrerType] = useState<"percent" | "flat">("percent");
  const [referrerAmount, setReferrerAmount] = useState("");
  const [referrerPaymentInfo, setReferrerPaymentInfo] = useState("");
  const [totalCommission, setTotalCommission] = useState("");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState<DealSource | "">("");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/buildings").then((r) => r.json()),
      fetch("/api/agents").then((r) => r.json()),
      isEdit && dealId
        ? fetch(`/api/rental/${dealId}`).then(async (r) => {
            if (!r.ok) throw new Error(await r.text());
            return (await r.json()) as RentalDealPayload;
          })
        : Promise.resolve(null),
    ]).then(([buildingRows, agentRows, rentalPayload]) => {
      setBuildings(buildingRows);
      setAgents(agentRows);
      if (rentalPayload) {
        const { deal } = rentalPayload;
        setBuildingId(deal.buildingId);
        setUnit(deal.unit || "");
        setTenantName(deal.tenantName || "");
        setTenantEmail(deal.tenantEmail || "");
        setTenantPhone(deal.tenantPhone || "");
        setApartmentAddress(deal.apartmentAddress || "");
        setMoveInDate(deal.moveInDate || "");
        setLeaseLengthMonths(deal.leaseLengthMonths || 12);
        setRentAmount(deal.rentAmount === null ? "" : String(deal.rentAmount));
        setTotalCommission(String(deal.totalCommission || ""));
        setHasReferrer(Boolean(deal.referrerName || deal.referrerType || deal.referrerAmount || deal.referrerPaymentInfo));
        setReferrerName(deal.referrerName || "");
        setReferrerType(deal.referrerType === "flat" ? "flat" : "percent");
        setReferrerAmount(deal.referrerAmount === null ? "" : String(deal.referrerAmount));
        setReferrerPaymentInfo(deal.referrerPaymentInfo || "");
        setNotes(deal.notes || "");
        setSource(SOURCE_OPTIONS.some((opt) => opt.value === deal.source) ? (deal.source as DealSource) : "");
        setDealParticipants(
          rentalPayload.agents.length > 0
            ? rentalPayload.agents.map((participant) => ({
                agentId: participant.agent.id,
                sharePct: Number(participant.sharePct || 0),
                isPrimary: participant.isPrimary,
              }))
            : [{ agentId: null, sharePct: 100, isPrimary: true }]
        );
      } else {
        const initialBuildingId = new URLSearchParams(window.location.search).get("buildingId");
        if (initialBuildingId) setBuildingId(Number(initialBuildingId));
      }
    }).catch(() => {
      toast.error(isEdit ? t.couldNotLoadRental : t.couldNotLoadForm);
      if (isEdit) router.push("/rental");
    }).finally(() => setLoading(false));
    // `t` is read only in the error path; intentionally not a dep so toggling
    // the language doesn't re-load the form and discard edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId, isEdit, router]);

  const selectedBuilding = useMemo(
    () => buildings.find((building) => building.id === buildingId) || null,
    [buildings, buildingId]
  );
  useEffect(() => {
    if (isEdit || dealParticipants[0]?.agentId || agents.length === 0) return;
    const currentAgentId = session?.user?.agentId;
    const defaultAgent =
      agents.find((row) => row.agent.id === currentAgentId)?.agent ||
      agents[0]?.agent;
    if (defaultAgent) {
      setDealParticipants([{ agentId: defaultAgent.id, sharePct: 100, isPrimary: true }]);
    }
  }, [agents, dealParticipants, isEdit, session?.user?.agentId]);

  const selectedParticipants = useMemo(
    () =>
      dealParticipants.map((participant) => ({
        ...participant,
        agent: agents.find((row) => row.agent.id === participant.agentId)?.agent || null,
      })),
    [agents, dealParticipants]
  );

  const primaryAgent = selectedParticipants.find((participant) => participant.isPrimary)?.agent || null;
  const shareTotal = selectedParticipants.reduce((sum, participant) => sum + Number(participant.sharePct || 0), 0);

  useEffect(() => {
    if (!isEdit && selectedBuilding && !apartmentAddress) {
      setApartmentAddress(selectedBuilding.billToAddress || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBuilding?.id, isEdit]);

  const updateParticipant = (
    index: number,
    patch: Partial<DealParticipantInput>
  ) => {
    setDealParticipants((prev) =>
      prev.map((participant, i) =>
        i === index ? { ...participant, ...patch } : participant
      )
    );
  };

  const setPrimaryParticipant = (index: number) => {
    setDealParticipants((prev) =>
      prev.map((participant, i) => ({ ...participant, isPrimary: i === index }))
    );
  };

  const addParticipant = () => {
    setDealParticipants((prev) => [...prev, { agentId: null, sharePct: 0, isPrimary: false }]);
  };

  const removeParticipant = (index: number) => {
    setDealParticipants((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (!next.some((participant) => participant.isPrimary) && next[0]) {
        next[0] = { ...next[0], isPrimary: true };
      }
      return next.length > 0 ? next : [{ agentId: null, sharePct: 100, isPrimary: true }];
    });
  };

  const breakdown = useMemo(
    () =>
      computeCommission({
        totalCommission: Number(totalCommission || 0),
        referrer: hasReferrer
          ? { type: referrerType, amount: Number(referrerAmount || 0) }
          : null,
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
    [hasReferrer, referrerAmount, referrerType, selectedParticipants, totalCommission]
  );

  const filteredBuildings = useMemo(() => {
    if (!buildingSearch) return buildings;
    const q = buildingSearch.toLowerCase();
    return buildings.filter(
      (building) =>
        building.name.toLowerCase().includes(q) ||
        building.region.toLowerCase().includes(q) ||
        (building.managementCompany || "").toLowerCase().includes(q)
    );
  }, [buildingSearch, buildings]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buildingId) return toast.error(t.selectBuilding);
    if (!unit.trim()) return toast.error(t.unitRequired);
    if (!tenantName.trim()) return toast.error(t.tenantNameRequired);
    if (!totalCommission || Number(totalCommission) <= 0) return toast.error(t.commissionRequired);
    if (selectedParticipants.some((participant) => !participant.agentId)) {
      return toast.error(t.everyAgentSelected);
    }
    if (new Set(selectedParticipants.map((participant) => participant.agentId)).size !== selectedParticipants.length) {
      return toast.error(t.agentsUnique);
    }
    if (selectedParticipants.filter((participant) => participant.isPrimary).length !== 1) {
      return toast.error(t.onePrimary);
    }
    if (Math.abs(shareTotal - 100) > 0.01) {
      return toast.error(t.sharesTotal);
    }

    setSaving(true);
    try {
      if (isEdit && !dealId) throw new Error("Missing rental id");
      const res = await fetch(isEdit ? `/api/rental/${dealId}` : "/api/rental", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingId,
          unit,
          tenantName,
          tenantEmail,
          tenantPhone,
          apartmentAddress,
          moveInDate,
          leaseStartDate: moveInDate,
          leaseLengthMonths,
          rentAmount: rentAmount ? Number(rentAmount) : null,
          totalCommission: Number(totalCommission),
          licensedCompany: primaryAgent?.licensedCompany,
          agents: selectedParticipants.map((participant) => ({
            agentId: participant.agentId,
            sharePct: Number(participant.sharePct || 0),
            isPrimary: participant.isPrimary,
          })),
          referrerName: hasReferrer ? referrerName.trim() || null : null,
          referrerType: hasReferrer ? referrerType : null,
          referrerAmount: hasReferrer ? Number(referrerAmount || 0) : null,
          referrerPaymentInfo: hasReferrer ? referrerPaymentInfo.trim() || null : null,
          source: source || null,
          notes,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const deal = await res.json();
      toast.success(isEdit ? t.rentalUpdated : t.rentalCreated);
      router.push(`/rental/${isEdit ? dealId : deal.id}`);
    } catch {
      toast.error(t.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-[13px]" style={{ color: tone.ink50 }}>
        {t.loading}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-7">
      <PageHeader
        eyebrow={isEdit ? t.eyebrowEdit : t.eyebrowCreate}
        title={isEdit ? t.titleEdit : t.titleNew}
        actions={
          <>
            <Link href={isEdit && dealId ? `/rental/${dealId}` : "/rental"}>
              <Btn variant="ghost" icon={<Icons.Back />}>
                {t.back}
              </Btn>
            </Link>
            <Btn variant="outline" onClick={() => router.back()}>
              {t.cancel}
            </Btn>
            <Btn variant="primary" icon={<Icons.Check />} type="submit" disabled={saving}>
              {saving ? t.saving : isEdit ? t.saveChanges : t.saveRental}
            </Btn>
          </>
        }
      />

      <div className="grid gap-8" style={{ gridTemplateColumns: "minmax(0, 1fr) 520px" }}>
        <div className="space-y-6">
          <Card>
            <CardHeader title={t.building} />
            <div className="p-6 space-y-4">
              {selectedBuilding ? (
                <div className="flex items-center justify-between rounded-lg p-4" style={{ background: tone.accentSoft, border: `1px solid ${tone.accent}` }}>
                  <div>
                    <div className="font-serif" style={{ fontSize: 20, color: tone.ink }}>
                      {selectedBuilding.name}
                    </div>
                    <div className="text-[12px] mt-1" style={{ color: tone.ink70 }}>
                      {selectedBuilding.region}
                      {selectedBuilding.managementCompany && ` · ${selectedBuilding.managementCompany}`}
                    </div>
                  </div>
                  <Btn variant="ghost" size="sm" onClick={() => setBuildingId(null)}>
                    {t.change}
                  </Btn>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 h-10 px-3 rounded-lg" style={{ background: tone.card, border: `1px solid ${tone.line}` }}>
                      <span style={{ color: tone.ink30 }}>
                        <Icons.Search />
                      </span>
                      <input
                        value={buildingSearch}
                        onChange={(e) => setBuildingSearch(e.target.value)}
                        placeholder={t.searchBuildings}
                        className="flex-1 bg-transparent outline-none text-[13.5px]"
                        style={{ color: tone.ink }}
                      />
                    </div>
                    <Btn variant="outline" size="sm" icon={<Icons.Plus />} onClick={() => setShowAddBuilding(true)}>
                      {t.addNew}
                    </Btn>
                  </div>
                  <div className="max-h-72 overflow-y-auto rounded-lg" style={{ border: `1px solid ${tone.line}` }}>
                    {filteredBuildings.length === 0 ? (
                      <div className="px-4 py-8 text-center text-[12.5px]" style={{ color: tone.ink50 }}>
                        {t.noMatches}{" "}
                        <button
                          type="button"
                          onClick={() => {
                            setNewBuildingName(buildingSearch);
                            setShowAddBuilding(true);
                          }}
                          className="underline"
                          style={{ color: tone.accent }}
                        >
                          {t.addAsNew1}&ldquo;{buildingSearch}&rdquo;{t.addAsNew2}
                        </button>
                      </div>
                    ) : (
                      filteredBuildings.slice(0, 60).map((building) => (
                        <button
                          key={building.id}
                          type="button"
                          onClick={() => setBuildingId(building.id)}
                          className="w-full text-left px-4 py-2.5 transition-colors hover:bg-[#FAF7F0]"
                          style={{ borderBottom: `1px solid ${tone.lineSoft}` }}
                        >
                          <div className="text-[13px]" style={{ color: tone.ink }}>
                            {building.name}
                          </div>
                          <div className="text-[11px] mt-0.5" style={{ color: tone.ink50 }}>
                            {building.region}
                            {building.managementCompany && ` · ${building.managementCompany}`}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={t.tenantLease} />
            <div className="p-6 grid grid-cols-2 gap-4">
              <LabeledField label={t.unit}>
                <EditorialInput value={unit} onChange={setUnit} placeholder="12F" />
              </LabeledField>
              <LabeledField label={t.moveInDate}>
                <EditorialInput value={moveInDate} onChange={setMoveInDate} type="date" mono />
              </LabeledField>
              <LabeledField label={t.tenantName} wide>
                <EditorialInput value={tenantName} onChange={setTenantName} placeholder={t.fullNames} />
              </LabeledField>
              <LabeledField label={t.tenantEmail}>
                <EditorialInput value={tenantEmail} onChange={setTenantEmail} mono />
              </LabeledField>
              <LabeledField label={t.tenantPhone}>
                <EditorialInput value={tenantPhone} onChange={setTenantPhone} mono />
              </LabeledField>
              <LabeledField label={t.apartmentAddress} wide>
                <EditorialInput value={apartmentAddress} onChange={setApartmentAddress} />
              </LabeledField>
              <LabeledField label={t.leaseLength}>
                <EditorialInput value={leaseLengthMonths} onChange={(v) => setLeaseLengthMonths(Number(v))} type="number" mono />
              </LabeledField>
              <LabeledField label={t.monthlyRent}>
                <EditorialInput value={rentAmount} onChange={setRentAmount} type="number" prefix="$" mono />
              </LabeledField>
            </div>
          </Card>

          <Card>
            <CardHeader title={t.agents} />
            <div className="p-6 space-y-4">
              {dealParticipants.map((participant, index) => (
                (() => {
                  const selectedAgent = selectedParticipants[index]?.agent || null;
                  const agentSplit = normalizeSplitPct(selectedAgent?.splitPct);
                  return (
                <div
                  key={index}
                  className="rounded-xl p-4 space-y-4"
                  style={{ background: tone.paper, border: `1px solid ${tone.lineSoft}` }}
                >
                  <div className="grid grid-cols-[1fr_120px_auto] gap-3 items-end">
                    <LabeledField label={participant.isPrimary ? t.primaryAgent : t.agent}>
                      <select
                        value={participant.agentId || ""}
                        onChange={(e) =>
                          updateParticipant(index, {
                            agentId: Number(e.target.value) || null,
                          })
                        }
                        className="w-full h-10 rounded-lg px-3 text-[13.5px] outline-none"
                        style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink }}
                      >
                        <option value="">{t.selectAgent}</option>
                        {agents.map(({ agent, teamName }) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name} {teamName ? `· ${teamName}` : ""}
                          </option>
                        ))}
                      </select>
                    </LabeledField>
                    <LabeledField label={t.sharePct}>
                      <EditorialInput
                        value={participant.sharePct}
                        onChange={(v) => updateParticipant(index, { sharePct: Number(v) })}
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
                      {dealParticipants.length > 1 && (
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
                  {selectedAgent && (
                    <div
                      className="grid grid-cols-3 gap-3 rounded-lg p-3"
                      style={{ background: tone.card, border: `1px solid ${tone.line}` }}
                    >
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: tone.ink50 }}>
                          {t.split}
                        </div>
                        <div className="mt-1 font-serif" style={{ fontSize: 24, color: tone.ink }}>
                          {splitLabel(agentSplit)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: tone.green }}>
                          {t.agentKeeps}
                        </div>
                        <div className="mt-1 font-serif" style={{ fontSize: 24, color: tone.green }}>
                          {agentSplit}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: tone.ink50 }}>
                          {t.homixKeeps}
                        </div>
                        <div className="mt-1 font-serif" style={{ fontSize: 24, color: tone.ink }}>
                          {companySplitPct(agentSplit)}%
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                  );
                })()
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
            <CardHeader title={t.referral} />
            <div className="p-6 space-y-4">
              <label className="flex items-center gap-2 text-[13px]" style={{ color: tone.ink70 }}>
                <input type="checkbox" checked={hasReferrer} onChange={(e) => setHasReferrer(e.target.checked)} />
                {t.hasReferrer}
              </label>
              {hasReferrer && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <LabeledField label={t.referrerName}>
                      <EditorialInput
                        value={referrerName}
                        onChange={setReferrerName}
                        placeholder={t.referrerNamePlaceholder}
                      />
                    </LabeledField>
                    <LabeledField label={t.type}>
                      <select value={referrerType} onChange={(e) => setReferrerType(e.target.value as "percent" | "flat")} className="w-full h-10 rounded-lg px-3 text-[13.5px] outline-none" style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink }}>
                        <option value="percent">{t.percent}</option>
                        <option value="flat">{t.flat}</option>
                      </select>
                    </LabeledField>
                    <LabeledField label={t.amount}>
                      <EditorialInput value={referrerAmount} onChange={setReferrerAmount} type="number" prefix={referrerType === "flat" ? "$" : undefined} mono />
                    </LabeledField>
                  </div>
                  <div>
                    <div
                      className="text-[11px] uppercase tracking-[0.1em] mb-2"
                      style={{ color: tone.ink50 }}
                    >
                      {t.paymentMethod}
                    </div>
                    <textarea
                      value={referrerPaymentInfo}
                      onChange={(e) => setReferrerPaymentInfo(e.target.value)}
                      rows={3}
                      placeholder="Zelle: 555-0102&#10;or ACH: Bank XYZ, routing 12345, acct 67890"
                      className="w-full rounded-lg p-3 text-[13.5px] outline-none font-mono"
                      style={{
                        background: tone.card,
                        border: `1px solid ${tone.line}`,
                        color: tone.ink,
                        resize: "vertical",
                      }}
                    />
                    <div
                      className="text-[11.5px] mt-1.5"
                      style={{ color: tone.ink50 }}
                    >
                      {t.paymentHint}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={t.commission} />
            <div className="p-6 space-y-4">
              <LabeledField label={t.totalCommissionLabel}>
                <EditorialInput value={totalCommission} onChange={setTotalCommission} type="number" prefix="$" mono />
              </LabeledField>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg p-4" style={{ background: tone.paper }}>
                  <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: tone.ink50 }}>
                    {t.referrer}
                  </div>
                  <div className="mt-1 font-serif" style={{ fontSize: 26, color: tone.amber }}>
                    ${fmtMoney(breakdown.referrerCut)}
                  </div>
                </div>
                <div className="rounded-lg p-4" style={{ background: tone.greenSoft }}>
                  <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: tone.green }}>
                    {t.agentKeeps}
                  </div>
                  <div className="mt-1 font-serif" style={{ fontSize: 26, color: tone.green }}>
                    ${fmtMoney(breakdown.agentTakeTotal)}
                  </div>
                </div>
                <div className="rounded-lg p-4" style={{ background: tone.paper }}>
                  <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: tone.ink50 }}>
                    {t.homixKeeps}
                  </div>
                  <div className="mt-1 font-serif" style={{ fontSize: 26, color: tone.ink }}>
                    ${fmtMoney(breakdown.companyPoolTotal)}
                  </div>
                </div>
              </div>
              {breakdown.agents.length > 0 && (
                <div className="space-y-2">
                  {breakdown.agents.map((agentBreakdown) => (
                    <div
                      key={agentBreakdown.agentId}
                      className="rounded-lg p-4"
                      style={{ background: tone.card, border: `1px solid ${tone.line}` }}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="font-serif" style={{ fontSize: 20, color: tone.ink }}>
                            {agentBreakdown.name || t.agent}
                          </div>
                          <div className="text-[12px] mt-1" style={{ color: tone.ink50 }}>
                            {agentBreakdown.sharePct}% {t.agentDealShare} · {splitLabel(agentBreakdown.splitPct)} {t.splitSuffix}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-right">
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: tone.green }}>
                              {t.agent}
                            </div>
                            <div className="font-mono text-[13px]" style={{ color: tone.green }}>
                              ${fmtMoney(agentBreakdown.agentTake)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: tone.ink50 }}>
                              {t.homix}
                            </div>
                            <div className="font-mono text-[13px]" style={{ color: tone.ink }}>
                              ${fmtMoney(agentBreakdown.companyPool)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={t.source} subtitle={t.sourceSubtitle} />
            <div className="p-6 grid grid-cols-3 gap-2">
              {SOURCE_OPTIONS.map((opt) => {
                const active = source === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      setSource((prev) => (prev === opt.value ? "" : opt.value))
                    }
                    className="rounded-lg px-3 py-3 flex items-center gap-2 transition-colors text-[13px] text-left"
                    style={{
                      background: active ? tone.accentSoft : tone.card,
                      border: `1px solid ${active ? tone.accent : tone.line}`,
                      color: active ? tone.ink : tone.ink70,
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{opt.emoji}</span>
                    <span className={active ? "font-medium" : ""}>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHeader title={t.notes} />
            <div className="p-6">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-lg p-3 text-[13.5px] outline-none" style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink, resize: "vertical" }} />
            </div>
          </Card>
        </div>

        <div>
          <div className="sticky top-24 space-y-4">
            <div className="text-[11px] uppercase tracking-[0.14em]" style={{ color: tone.ink50 }}>
              {t.rentalSummary}
            </div>
            <Card>
              <div className="p-6">
                <div className="font-serif" style={{ fontSize: 30, color: tone.ink, lineHeight: 1 }}>
                  {selectedBuilding?.name || t.selectBuildingPlaceholder}
                </div>
                <div className="mt-2 text-[13px]" style={{ color: tone.ink70 }}>
                  {t.unitWord} {unit || "—"} · {tenantName || t.tenantWord}
                </div>
                <div className="mt-6 flex items-center gap-3">
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
                          {participant.sharePct}% {t.shareWord} · {splitLabel(participant.agent!.splitPct)} {t.splitSuffix}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-8">
                  <DealBreakdownBar breakdown={breakdown} />
                </div>
                <div className="mt-8 rounded-lg p-4" style={{ background: tone.paper }}>
                  <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: tone.ink50 }}>
                    {t.totalCommissionSummary}
                  </div>
                  <div className="mt-2 font-serif" style={{ fontSize: 44, color: tone.ink, lineHeight: 1 }}>
                    ${fmtMoney(Number(totalCommission || 0))}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {hasReferrer && <Pill tone="draft">{t.referralPill}</Pill>}
                  {selectedParticipants.length > 1 && <Pill tone="neutral">{selectedParticipants.length} {t.agentsPill}</Pill>}
                  {moveInDate && <Pill tone="accent">{t.moveInSet}</Pill>}
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Add new building dialog */}
      {showAddBuilding && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4"
          style={{ background: "rgba(26, 24, 20, 0.45)" }}
          onClick={() => !addingBuilding && setShowAddBuilding(false)}
        >
          <div
            className="rounded-2xl w-full max-w-xl flex flex-col"
            style={{
              background: tone.paper,
              boxShadow: "0 30px 80px -20px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="px-7 py-5 flex items-center justify-between"
              style={{ borderBottom: `1px solid ${tone.line}` }}
            >
              <div>
                <div
                  className="text-[11px] uppercase tracking-[0.14em]"
                  style={{ color: tone.ink50 }}
                >
                  {t.newBuilding}
                </div>
                <div
                  className="font-serif"
                  style={{ fontSize: 22, color: tone.ink, letterSpacing: "-0.01em", marginTop: 2 }}
                >
                  {t.addABuilding}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddBuilding(false)}
                disabled={addingBuilding}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: tone.paperDeep, color: tone.ink70 }}
              >
                ×
              </button>
            </div>

            <div className="px-7 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <LabeledField label={t.name}>
                  <EditorialInput
                    value={newBuildingName}
                    onChange={setNewBuildingName}
                    placeholder={t.namePlaceholder}
                  />
                </LabeledField>
                <LabeledField label={t.region}>
                  <EditorialInput
                    value={newBuildingRegion}
                    onChange={setNewBuildingRegion}
                    placeholder={t.regionPlaceholder}
                  />
                </LabeledField>
                <LabeledField label={t.managementCompany}>
                  <EditorialInput
                    value={newBuildingMgmt}
                    onChange={setNewBuildingMgmt}
                    placeholder={t.managementPlaceholder}
                  />
                </LabeledField>
                <LabeledField label={t.contactEmail}>
                  <EditorialInput
                    value={newBuildingContactEmail}
                    onChange={setNewBuildingContactEmail}
                    placeholder="leasing@..."
                    mono
                  />
                </LabeledField>
                <LabeledField label={t.billToCompany} wide>
                  <EditorialInput
                    value={newBuildingBillTo}
                    onChange={setNewBuildingBillTo}
                    placeholder={t.billToCompanyPlaceholder}
                  />
                </LabeledField>
                <LabeledField label={t.billToAddress} wide>
                  <EditorialInput
                    value={newBuildingBillToAddress}
                    onChange={setNewBuildingBillToAddress}
                    placeholder={t.billToAddressPlaceholder}
                  />
                </LabeledField>
              </div>
              <p className="text-[11.5px]" style={{ color: tone.ink50 }}>
                {t.fillRestLater}
              </p>
            </div>

            <div
              className="px-7 py-4 flex items-center justify-end gap-2"
              style={{ borderTop: `1px solid ${tone.line}`, background: tone.paper }}
            >
              <Btn
                variant="outline"
                onClick={() => setShowAddBuilding(false)}
                disabled={addingBuilding}
              >
                {t.cancel}
              </Btn>
              <Btn
                variant="primary"
                onClick={handleAddBuilding}
                disabled={addingBuilding}
              >
                {addingBuilding ? t.adding : t.addBuilding}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

export default function NewDealPage() {
  return <RentalDealFormPage />;
}
