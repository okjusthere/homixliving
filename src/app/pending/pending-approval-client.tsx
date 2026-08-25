"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Btn } from "@/components/homix/primitives";
import { HomixMark } from "@/components/homix/brand-mark";
import { tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";

const M = {
  en: {
    inactiveTitle: "Account inactive",
    pendingTitle: "Pending approval",
    inactiveBody: "This account has been deactivated. Contact a Homix administrator if you believe this is a mistake.",
    pendingBody: "Your account has been created. An admin needs to activate it before you can start working.",
    inactiveHint: "Your historical deals and payment records remain retained by the company.",
    pendingHint: "This page checks automatically. Once approved, you will enter Homix Agents without signing out.",
    checking: "Checking approval…",
    check: "Check approval",
    signOut: "Sign out",
    setupTitle: "Complete your setup",
    setupHint: "Choose the facts once. Homix will apply the commission rules automatically after approval.",
    track: "Development track",
    solo: "Solo · 85/15 · $12K cap",
    soloPro: "Solo Pro · 100% · $3,650/year",
    teamMember: "Team Member · 90/10 · $10K Homix cap",
    holding: "Holding / Non-Producing",
    team: "Team",
    selectTeam: "Select your team",
    sponsor: "Sponsor / who introduced you",
    noSponsor: "No sponsor",
    term: "Affiliation term",
    oneYear: "$288 · 1 year",
    twoYears: "$500 · 2 years prepaid",
    saveSetup: "Submit setup",
    setupSaved: "Setup submitted. An admin can now approve the account.",
    setupFailed: "Could not save setup.",
    legalName: "Legal name",
    phone: "Phone",
    license: "License number",
    company: "Licensed company",
    selectCompany: "Select licensed company",
    practice: "Practice",
    rental: "Rental",
    sales: "Sales",
    both: "Rental and sales",
    invitedRoute: (source: string) => `Invitation applied · ${source.toUpperCase()} · locked details cannot be changed`,
    agreementTitle: "Affiliation agreement",
    agreementHint: "Your submitted facts are inserted into the agreement. Review and sign before payment.",
    sendAgreement: "Send agreement to my email",
    agreementPreparing: "Preparing your approved agreement…",
    agreementSent: "Agreement sent. Open the secure link in your email, then return here.",
    agreementCompleted: "Agreement signed",
    agreementUnavailable: "eSign is not configured yet. An administrator can continue the current manual process.",
    payAnnualFee: "Pay affiliation fee",
    paymentReceived: "Payment received",
    finalReview: "Agreement and payment are complete. Homix will finish license and account activation.",
    teamTermsTitle: "Team terms included in your agreement",
    standardTeamSplit: "Standard team split",
    sourcedTeamSplit: "Team-sourced split",
    annualTeamCap: "Annual member team cap",
    noTeamCap: "No cap",
    teamTermsRenewal: "These terms stay fixed for your current anniversary cycle. Later team changes begin at your next anniversary unless you sign an amendment.",
  },
  zh: {
    inactiveTitle: "账号已停用",
    pendingTitle: "等待管理员批准",
    inactiveBody: "此账号已被停用。如有疑问，请联系 Homix 管理员。",
    pendingBody: "账号已创建，管理员批准后即可开始使用。",
    inactiveHint: "公司仍会保留你的历史成交与付款记录。",
    pendingHint: "本页会自动检查状态；批准后无需退出登录，将直接进入 Homix Agents。",
    checking: "正在检查…",
    check: "检查批准状态",
    signOut: "退出登录",
    setupTitle: "完成入职选择",
    setupHint: "只需填写一次事实；批准后系统会自动套用分佣、封顶和团队规则。",
    track: "发展路径",
    solo: "独立经纪人 · 85/15 · $12K 封顶",
    soloPro: "独立经纪人 Pro · 100% · $3,650/年",
    teamMember: "团队成员 · 90/10 · Homix $10K 封顶",
    holding: "执照挂靠 / 暂不展业",
    team: "所属团队",
    selectTeam: "请选择团队",
    sponsor: "Sponsor / 介绍人",
    noSponsor: "无 Sponsor",
    term: "挂靠期限",
    oneYear: "$288 · 1 年",
    twoYears: "$500 · 2 年预付",
    saveSetup: "提交入职资料",
    setupSaved: "资料已提交，管理员现在可以直接批准。",
    setupFailed: "无法保存入职资料。",
    legalName: "法定姓名",
    phone: "电话",
    license: "执照号码",
    company: "持牌公司",
    selectCompany: "请选择持牌公司",
    practice: "业务范围",
    rental: "租赁",
    sales: "买卖",
    both: "租赁与买卖",
    invitedRoute: (source: string) => `已应用邀请 · ${source.toUpperCase()} · 被锁定的资料不可修改`,
    agreementTitle: "挂靠协议",
    agreementHint: "系统会把已提交的信息带入协议；请先阅读签署，再支付费用。",
    sendAgreement: "发送协议到我的邮箱",
    agreementPreparing: "正在生成已审核版本的协议…",
    agreementSent: "协议已发送，请打开邮箱中的安全链接签署，然后返回本页。",
    agreementCompleted: "协议已签署",
    agreementUnavailable: "eSign 尚未配置，管理员仍可按现有人工流程处理。",
    payAnnualFee: "支付挂靠费用",
    paymentReceived: "费用已支付",
    finalReview: "协议和付款均已完成，Homix 将完成执照及账号激活。",
    teamTermsTitle: "协议中的团队分佣条款",
    standardTeamSplit: "一般团队分成",
    sourcedTeamSplit: "TL 提供客源分成",
    annualTeamCap: "成员年度团队封顶",
    noTeamCap: "不封顶",
    teamTermsRenewal: "本条款在当前周年周期内保持不变；后续团队方案从下一周年开始，除非你另行签署变更协议。",
  },
} as const;

type TeamTerms = {
  id: number;
  defaultTeamSplitPct: number;
  teamLeadSplitPct: number;
  teamCapCents: number | null;
};

type TeamOption = {
  id: number;
  name: string;
  compensationConfig: TeamTerms | null;
};

export function PendingApprovalClient({
  initialIsApproved,
  accountStatus,
}: {
  initialIsApproved: boolean;
  accountStatus: "pending" | "active" | "inactive";
}) {
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const [checking, setChecking] = useState(initialIsApproved);
  const [setupLoading, setSetupLoading] = useState(accountStatus === "pending");
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupMessage, setSetupMessage] = useState("");
  const [plan, setPlan] = useState("solo");
  const [teamId, setTeamId] = useState("");
  const [sponsorId, setSponsorId] = useState("");
  const [termMonths, setTermMonths] = useState("12");
  const [legalName, setLegalName] = useState("");
  const [phone, setPhone] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licensedCompany, setLicensedCompany] = useState("");
  const [practice, setPractice] = useState("both");
  const [routingLocks, setRoutingLocks] = useState({
    plan: false,
    team: false,
    sponsor: false,
    term: false,
  });
  const [onboardingSource, setOnboardingSource] = useState("direct");
  const [agreementStatus, setAgreementStatus] = useState("not_started");
  const [paymentStatus, setPaymentStatus] = useState("pending");
  const [paymentProduct, setPaymentProduct] = useState<string | null>(null);
  const [esignConfigured, setEsignConfigured] = useState(false);
  const [agreementLoading, setAgreementLoading] = useState(false);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [frozenTeamTerms, setFrozenTeamTerms] = useState<TeamTerms | null>(null);
  const [sponsors, setSponsors] = useState<Array<{ id: number; name: string }>>([]);
  const checkedOnce = useRef(false);
  const checkInFlight = useRef(false);
  const effectiveStatus = session?.user?.accountStatus ?? accountStatus;
  const t = M[useLocale()];

  useEffect(() => {
    if (accountStatus !== "pending") return;
    fetch("/api/onboarding/profile")
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((data) => {
        setPlan(data.profile?.plan || "solo");
        setTeamId(data.profile?.teamId ? String(data.profile.teamId) : "");
        setSponsorId(data.profile?.referredByAgentId ? String(data.profile.referredByAgentId) : "");
        setTermMonths(String(data.profile?.affiliationTermMonths || 12));
        setLegalName(data.profile?.legalName || "");
        setPhone(data.profile?.phone || "");
        setLicenseNumber(data.profile?.licenseNumber || "");
        setLicensedCompany(data.profile?.licensedCompany || "");
        setPractice(data.profile?.practice || "both");
        setFrozenTeamTerms(data.profile?.teamTerms || null);
        setRoutingLocks({
          plan: Boolean(data.routing?.locks?.plan),
          team: Boolean(data.routing?.locks?.team),
          sponsor: Boolean(data.routing?.locks?.sponsor),
          term: Boolean(data.routing?.locks?.term),
        });
        setOnboardingSource(data.routing?.source || "direct");
        if (data.routing?.locked) {
          setPlan(data.routing.plan || "solo");
          setTeamId(data.routing.teamId ? String(data.routing.teamId) : "");
          setSponsorId(data.routing.referredByAgentId ? String(data.routing.referredByAgentId) : "");
          setTermMonths(String(data.routing.affiliationTermMonths || 12));
        }
        setAgreementStatus(data.profile?.agreementStatus || "not_started");
        setPaymentStatus(data.profile?.paymentStatus || "pending");
        setTeams(data.teams || []);
        setSponsors(data.sponsors || []);
        if (data.profile?.onboardingCompletedAt) setSetupMessage(t.setupSaved);
      })
      .catch(() => setSetupMessage(t.setupFailed))
      .finally(() => setSetupLoading(false));
  }, [accountStatus, t.setupFailed, t.setupSaved]);

  const saveSetup = async () => {
    if (plan === "team_member" && !teamId) {
      setSetupMessage(t.selectTeam);
      return;
    }
    setSetupSaving(true);
    setSetupMessage("");
    try {
      const response = await fetch("/api/onboarding/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plan,
          teamId: plan === "team_member" ? teamId : null,
          referredByAgentId: sponsorId || null,
          affiliationTermMonths: termMonths,
          legalName,
          phone,
          licenseNumber,
          licensedCompany,
          practice,
        }),
      });
      if (!response.ok) throw new Error();
      setSetupMessage(t.setupSaved);
      await refreshAgreement();
    } catch {
      setSetupMessage(t.setupFailed);
    } finally {
      setSetupSaving(false);
    }
  };

  const refreshAgreement = useCallback(async () => {
    try {
      const response = await fetch("/api/onboarding/agreement", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      setEsignConfigured(Boolean(data.configured));
      setAgreementStatus(data.agreementStatus || "not_started");
      setPaymentStatus(data.paymentStatus || "pending");
      setPaymentProduct(data.paymentProduct || null);
    } catch (error) {
      console.error("Unable to load onboarding agreement", error);
    }
  }, []);

  const startAgreement = async () => {
    setAgreementLoading(true);
    try {
      const response = await fetch("/api/onboarding/agreement", { method: "POST" });
      if (!response.ok) throw new Error();
      await refreshAgreement();
    } catch {
      setSetupMessage(t.setupFailed);
    } finally {
      setAgreementLoading(false);
    }
  };

  useEffect(() => {
    if (accountStatus === "pending") void refreshAgreement();
  }, [accountStatus, refreshAgreement]);

  useEffect(() => {
    if (agreementStatus !== "preparing" && agreementStatus !== "sent") return;
    const interval = window.setInterval(() => void refreshAgreement(), 15_000);
    return () => window.clearInterval(interval);
  }, [agreementStatus, refreshAgreement]);

  const redirectIfApproved = useCallback(
    (effectiveSession: typeof session) => {
      if (effectiveSession?.user.isAdmin || effectiveSession?.user.accountStatus === "active") {
        router.replace("/");
        router.refresh();
        return true;
      }

      return false;
    },
    [router]
  );

  const refreshApproval = useCallback(async (showProgress = true) => {
    if (checkInFlight.current) return;
    checkInFlight.current = true;
    if (showProgress) setChecking(true);
    try {
      const refreshed = await update();
      redirectIfApproved(refreshed || session);
    } catch (error) {
      console.error("Unable to refresh approval status", error);
    } finally {
      checkInFlight.current = false;
      if (showProgress) setChecking(false);
    }
  }, [redirectIfApproved, session, update]);

  useEffect(() => {
    if (status === "loading") return;

    if (status === "unauthenticated" || !session?.user?.email) {
      router.replace("/login");
      return;
    }

    if (checkedOnce.current) return;
    checkedOnce.current = true;

    // Approval changes live in the DB, but proxy reads the JWT cookie.
    // Refresh immediately so a previously approved user does not bounce
    // between /pending and /. Ongoing checks are scoped to this page below.
    void refreshApproval(false);
  }, [refreshApproval, router, session, session?.user?.email, status]);

  useEffect(() => {
    if (
      status !== "authenticated" ||
      !session?.user?.email ||
      effectiveStatus !== "pending"
    ) {
      return;
    }

    const checkNow = () => {
      if (document.visibilityState === "visible") void refreshApproval(false);
    };
    const interval = window.setInterval(checkNow, 15_000);
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") checkNow();
    };

    window.addEventListener("focus", checkNow);
    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", checkNow);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [effectiveStatus, refreshApproval, session?.user?.email, status]);

  const selectedTeamTerms = agreementStatus !== "not_started" && frozenTeamTerms
    ? frozenTeamTerms
    : teams.find((team) => String(team.id) === teamId)?.compensationConfig || null;

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-2xl">
        <div className="flex justify-center mb-8">
          <HomixMark size={36} />
        </div>

        <div
          className="rounded-2xl p-8 text-center"
          style={{ background: tone.card, border: `1px solid ${tone.line}` }}
        >
          <div
            className="text-[40px] mb-3"
            style={{ lineHeight: 1 }}
            aria-hidden
          >
            {effectiveStatus === "inactive" ? "–" : "⏳"}
          </div>
          <h1
            className="font-serif"
            style={{
              fontSize: 30,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              color: tone.ink,
              marginBottom: 12,
            }}
          >
            {effectiveStatus === "inactive" ? t.inactiveTitle : t.pendingTitle}
          </h1>
          <p className="text-[14px]" style={{ color: tone.ink70 }}>
            {effectiveStatus === "inactive"
              ? t.inactiveBody
              : t.pendingBody}
          </p>
          <p className="text-[12px] mt-4" style={{ color: tone.ink50 }}>
            {effectiveStatus === "inactive"
              ? t.inactiveHint
              : t.pendingHint}
          </p>

          {effectiveStatus === "pending" && (
            <div className="mt-6 rounded-xl p-4 text-left sm:p-5" style={{ background: tone.paper, border: `1px solid ${tone.line}` }}>
              <h2 className="font-serif text-[22px]" style={{ color: tone.ink }}>{t.setupTitle}</h2>
              <p className="mt-1 text-[12px]" style={{ color: tone.ink50 }}>{t.setupHint}</p>
              {(routingLocks.plan || routingLocks.team || routingLocks.sponsor || routingLocks.term) && (
                <p className="mt-3 rounded-lg px-3 py-2 text-[12px]" style={{ background: tone.paperDeep, color: tone.green }}>
                  {t.invitedRoute(onboardingSource)}
                </p>
              )}
              {setupLoading ? (
                <p className="mt-5 text-[13px]" style={{ color: tone.ink50 }}>{t.checking}</p>
              ) : (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1 text-[12px]" style={{ color: tone.ink70 }}>
                    {t.legalName}
                    <input value={legalName} onChange={(event) => setLegalName(event.target.value)} disabled={agreementStatus !== "not_started"} className="h-11 rounded-lg bg-white px-3 text-[13px] disabled:opacity-60" style={{ border: `1px solid ${tone.line}`, color: tone.ink }} />
                  </label>
                  <label className="grid gap-1 text-[12px]" style={{ color: tone.ink70 }}>
                    {t.phone}
                    <input value={phone} onChange={(event) => setPhone(event.target.value)} disabled={agreementStatus !== "not_started"} inputMode="tel" className="h-11 rounded-lg bg-white px-3 text-[13px] disabled:opacity-60" style={{ border: `1px solid ${tone.line}`, color: tone.ink }} />
                  </label>
                  <label className="grid gap-1 text-[12px]" style={{ color: tone.ink70 }}>
                    {t.license}
                    <input value={licenseNumber} onChange={(event) => setLicenseNumber(event.target.value)} disabled={agreementStatus !== "not_started"} className="h-11 rounded-lg bg-white px-3 text-[13px] disabled:opacity-60" style={{ border: `1px solid ${tone.line}`, color: tone.ink }} />
                  </label>
                  <label className="grid gap-1 text-[12px]" style={{ color: tone.ink70 }}>
                    {t.company}
                    <select value={licensedCompany} onChange={(event) => setLicensedCompany(event.target.value)} disabled={agreementStatus !== "not_started"} className="h-11 rounded-lg bg-white px-3 text-[13px] disabled:opacity-60" style={{ border: `1px solid ${tone.line}`, color: tone.ink }}>
                      <option value="">{t.selectCompany}</option>
                      <option value="Homix Realty Inc.">Homix Realty Inc.</option>
                      <option value="Homix Living Inc.">Homix Living Inc.</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-[12px] sm:col-span-2" style={{ color: tone.ink70 }}>
                    {t.practice}
                    <select value={practice} onChange={(event) => setPractice(event.target.value)} disabled={agreementStatus !== "not_started"} className="h-11 rounded-lg bg-white px-3 text-[13px] disabled:opacity-60" style={{ border: `1px solid ${tone.line}`, color: tone.ink }}>
                      <option value="rental">{t.rental}</option>
                      <option value="sales">{t.sales}</option>
                      <option value="both">{t.both}</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-[12px]" style={{ color: tone.ink70 }}>
                    {t.track}
                    <select value={plan} onChange={(event) => setPlan(event.target.value)} disabled={routingLocks.plan || agreementStatus !== "not_started"} className="h-11 rounded-lg bg-white px-3 text-[13px] disabled:opacity-60" style={{ border: `1px solid ${tone.line}`, color: tone.ink }}>
                      <option value="solo">{t.solo}</option>
                      <option value="solo_pro">{t.soloPro}</option>
                      <option value="team_member">{t.teamMember}</option>
                      <option value="holding">{t.holding}</option>
                    </select>
                  </label>
                  {plan === "team_member" ? (
                    <label className="grid gap-1 text-[12px]" style={{ color: tone.ink70 }}>
                      {t.team}
                      <select value={teamId} onChange={(event) => setTeamId(event.target.value)} disabled={routingLocks.team || agreementStatus !== "not_started"} className="h-11 rounded-lg bg-white px-3 text-[13px] disabled:opacity-60" style={{ border: `1px solid ${tone.line}`, color: tone.ink }}>
                        <option value="">{t.selectTeam}</option>
                        {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                      </select>
                    </label>
                  ) : (
                    <label className="grid gap-1 text-[12px]" style={{ color: tone.ink70 }}>
                      {t.term}
                      <select value={plan === "solo_pro" ? "12" : termMonths} onChange={(event) => setTermMonths(event.target.value)} disabled={plan === "solo_pro" || routingLocks.term || agreementStatus !== "not_started"} className="h-11 rounded-lg bg-white px-3 text-[13px] disabled:opacity-60" style={{ border: `1px solid ${tone.line}`, color: tone.ink }}>
                        <option value="12">{plan === "solo_pro" ? "$3,650 · 1 year" : t.oneYear}</option>
                        {plan !== "solo_pro" && <option value="24">{t.twoYears}</option>}
                      </select>
                    </label>
                  )}
                  {plan === "team_member" && selectedTeamTerms && (
                    <div
                      className="rounded-lg p-4 sm:col-span-2"
                      style={{ background: tone.paperDeep, border: `1px solid ${tone.line}` }}
                    >
                      <div className="text-[12px] font-medium" style={{ color: tone.ink }}>
                        {t.teamTermsTitle}
                      </div>
                      <dl className="mt-3 grid grid-cols-1 gap-3 text-[12px] sm:grid-cols-3">
                        <div>
                          <dt style={{ color: tone.ink50 }}>{t.standardTeamSplit}</dt>
                          <dd className="mt-1 font-mono text-[15px]" style={{ color: tone.ink }}>
                            {selectedTeamTerms.defaultTeamSplitPct}%
                          </dd>
                        </div>
                        <div>
                          <dt style={{ color: tone.ink50 }}>{t.sourcedTeamSplit}</dt>
                          <dd className="mt-1 font-mono text-[15px]" style={{ color: tone.ink }}>
                            {selectedTeamTerms.teamLeadSplitPct}%
                          </dd>
                        </div>
                        <div>
                          <dt style={{ color: tone.ink50 }}>{t.annualTeamCap}</dt>
                          <dd className="mt-1 font-mono text-[15px]" style={{ color: tone.ink }}>
                            {selectedTeamTerms.teamCapCents == null
                              ? t.noTeamCap
                              : `$${(selectedTeamTerms.teamCapCents / 100).toLocaleString()}`}
                          </dd>
                        </div>
                      </dl>
                      <p className="mt-3 text-[11px] leading-5" style={{ color: tone.ink50 }}>
                        {t.teamTermsRenewal}
                      </p>
                    </div>
                  )}
                  <label className="grid gap-1 text-[12px] sm:col-span-2" style={{ color: tone.ink70 }}>
                    {t.sponsor}
                    <select value={sponsorId} onChange={(event) => setSponsorId(event.target.value)} disabled={routingLocks.sponsor || agreementStatus !== "not_started"} className="h-11 rounded-lg bg-white px-3 text-[13px] disabled:opacity-60" style={{ border: `1px solid ${tone.line}`, color: tone.ink }}>
                      <option value="">{t.noSponsor}</option>
                      {sponsors.map((sponsor) => <option key={sponsor.id} value={sponsor.id}>{sponsor.name}</option>)}
                    </select>
                  </label>
                  <Btn variant="primary" className="justify-center sm:col-span-2" onClick={() => void saveSetup()} disabled={setupSaving || agreementStatus !== "not_started"}>
                    {setupSaving ? t.checking : t.saveSetup}
                  </Btn>
                  {setupMessage && <p className="text-center text-[12px] sm:col-span-2" style={{ color: setupMessage === t.setupSaved ? tone.green : tone.rose }}>{setupMessage}</p>}
                </div>
              )}

              {setupMessage === t.setupSaved && (
                <div className="mt-5 border-t pt-5" style={{ borderColor: tone.line }}>
                  <h3 className="font-serif text-[20px]" style={{ color: tone.ink }}>{t.agreementTitle}</h3>
                  <p className="mt-1 text-[12px]" style={{ color: tone.ink50 }}>{t.agreementHint}</p>
                  {!esignConfigured ? (
                    <p className="mt-3 text-[12px]" style={{ color: tone.amber }}>{t.agreementUnavailable}</p>
                  ) : agreementStatus === "completed" ? (
                    <p className="mt-3 text-[13px]" style={{ color: tone.green }}>{t.agreementCompleted}</p>
                  ) : agreementStatus === "preparing" ? (
                    <p className="mt-3 text-[12px]" style={{ color: tone.amber }}>{t.agreementPreparing}</p>
                  ) : agreementStatus === "sent" ? (
                    <p className="mt-3 text-[12px]" style={{ color: tone.green }}>{t.agreementSent}</p>
                  ) : (
                    <Btn variant="outline" className="mt-4 w-full justify-center" onClick={() => void startAgreement()} disabled={agreementLoading}>
                      {agreementLoading ? t.checking : t.sendAgreement}
                    </Btn>
                  )}
                  {agreementStatus === "completed" && paymentProduct && paymentStatus !== "paid" && (
                    <Btn variant="primary" className="mt-4 w-full justify-center" onClick={() => router.push(`/pay?product=${encodeURIComponent(paymentProduct)}`)}>
                      {t.payAnnualFee}
                    </Btn>
                  )}
                  {paymentStatus === "paid" && (
                    <p className="mt-3 text-[13px]" style={{ color: tone.green }}>{t.paymentReceived}</p>
                  )}
                  {agreementStatus === "completed" && (paymentStatus === "paid" || !paymentProduct) && (
                    <p className="mt-3 text-[12px]" style={{ color: tone.ink70 }}>{t.finalReview}</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-6 grid gap-2">
            {effectiveStatus === "pending" && (
              <Btn
                variant="primary"
                size="md"
                type="button"
                className="w-full justify-center"
                onClick={() => void refreshApproval(true)}
                disabled={checking}
              >
                {checking ? t.checking : t.check}
              </Btn>
            )}
            <Btn
              variant="outline"
              size="md"
              type="button"
              className="w-full justify-center"
              onClick={() => void signOut({ redirectTo: "/login" })}
            >
              {t.signOut}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
