"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Btn } from "@/components/homix/primitives";
import { HomixMark } from "@/components/homix/brand-mark";
import { tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";
import { canRestartAgreement } from "@/lib/agreement-recovery-policy";
import { refreshApprovalSession } from "./approval-session";

const M = {
  en: {
    inactiveTitle: "Account inactive",
    pendingTitle: "Complete your onboarding",
    inactiveBody: "This account has been deactivated. Contact a Homix administrator if you believe this is a mistake.",
    pendingBody: "Confirm your details, sign your agreement, then pay online for automatic activation. An administrator verifies offline payments and activates those accounts.",
    inactiveHint: "Your historical deals and payment records remain retained by the company.",
    pendingHint: "Your progress is saved. This page checks automatically and opens your workspace when your access is ready.",
    checking: "Checking…",
    signOut: "Sign out",
    setupTitle: "Complete your setup",
    setupHint: "Choose the facts once. Homix will apply the agreed commission rules after activation.",
    track: "Development track",
    solo: "Solo · 85/15 · $12K cap",
    soloPro: "Solo Pro · 100% · $3,650/year",
    teamMember: "Team Member · 90/10 · $10K Homix cap",
    team: "Team",
    selectTeam: "Select your team",
    sponsor: "Sponsor / who introduced you",
    noSponsor: "No sponsor",
    term: "Affiliation term",
    oneYear: "$288 · 1 year",
    twoYears: "$500 · 2 years prepaid",
    saveSetup: "Submit setup",
    savingSetup: "Submitting…",
    setupSaved: "Setup submitted. Your agreement will be sent automatically.",
    teamRequestPending: (team: string) => `Team request sent to ${team}. Continue after the Team Leader accepts it.`,
    teamRequestDeclined: (team: string, reason: string | null) =>
      `${team} did not accept this request.${reason ? ` Reason: ${reason}` : " Choose another team or a solo plan."}`,
    setupFailed: "Could not save setup.",
    legalName: "Legal name",
    phone: "Phone",
    license: "License number",
    company: "Licensed company",
    selectCompany: "Select licensed company",
    companyFirst: "1. Choose your licensed company",
    companyFirstHint: "This choice determines the legal agreement, MLS obligations, and available teams.",
    realtyRequirement: "Requires LIBOR/OneKey membership and the related fees.",
    livingRequirement: "Does not require LIBOR/OneKey membership.",
    liborStatus: "LIBOR membership status",
    liborStatusHint: "Existing members skip the new-member LIBOR application. Homix Realty information is prefilled for new applications.",
    selectLiborStatus: "Select your LIBOR status",
    applyNewLibor: "I need to apply for LIBOR membership",
    existingLiborMember: "I am already a LIBOR member",
    liborStatusRequired: "Choose whether you need a new LIBOR application.",
    companyAcknowledgement: "I understand that Homix Realty Inc. requires LIBOR/OneKey membership and related fees; Homix Living Inc. does not require LIBOR/OneKey.",
    companyAcknowledgementRequired: "Confirm the company and LIBOR/OneKey requirement before continuing.",
    practice: "Practice",
    rental: "Rental",
    sales: "Sales",
    both: "Rental and sales",
    invitedRoute: (source: string) => `Invitation applied · ${source.toUpperCase()} · locked details cannot be changed`,
    agreementTitle: "Affiliation agreement",
    continueSigning: "Continue signing",
    resendSigning: "Resend signing email",
    openingSigning: "Opening…",
    resumeHint: "Signing opens in a new tab. Saved progress is retained; return here for payment.",
    resendHint: "The reminder opens the same agreement. Your saved progress is retained.",
    agreementHint: "Your submitted facts are inserted into the agreement. Review and sign before payment.",
    sendAgreement: "Retry sending agreement",
    restartAgreement: "Create a new agreement and send",
    restartAgreementHint: "The previous agreement was declined, voided or expired. Start a new agreement using your submitted details. Any payment already received will be retained.",
    finalizationFailed: "Your signatures are retained, but the final document could not be generated. Contact an administrator for recovery.",
    sendingAgreement: "Sending agreement…",
    agreementFailed: "The agreement could not be sent. Check the information above and try again.",
    agreementPreparing: "Preparing your approved agreement…",
    agreementSent: "Agreement sent. Open the secure link in your email, then return here.",
    agreementCompleted: "Agreement signed",
    agentSignatureCompleted: "Your signature is complete. Company countersign can continue while you pay.",
    agreementUnavailable: "eSign is not configured yet. An administrator can continue the current manual process.",
    payAnnualFee: "Pay affiliation fee",
    paymentReceived: "Payment received",
    finalReview: "Payment received. Your Portal access is activating automatically.",
    offlineReview: "Your offline payment has been verified. An administrator will review and activate your account.",
    teamTermsTitle: "Team terms included in your agreement",
    standardTeamSplit: "Standard team split",
    sourcedTeamSplit: "Team-sourced split",
    annualTeamCap: "Annual member team cap",
    noTeamCap: "No cap",
    teamTermsRenewal: "These terms stay fixed for your current anniversary cycle. Later team changes begin at your next anniversary unless you sign an amendment.",
  },
  zh: {
    inactiveTitle: "账号已停用",
    pendingTitle: "办理入职",
    inactiveBody: "此账号已被停用。如有疑问，请联系 Homix 管理员。",
    pendingBody: "确认资料、本人签署后，线上付款即可自动开通；线下付款由管理员核验后审批开通。",
    inactiveHint: "公司仍会保留你的历史成交与付款记录。",
    pendingHint: "办理进度会保留。本页自动检查状态，开通后直接进入工作台。",
    checking: "正在检查…",
    signOut: "退出登录",
    setupTitle: "完成入职选择",
    setupHint: "资料只需填写一次；开通后系统会应用已确认的分佣、封顶和团队规则。",
    track: "发展路径",
    solo: "独立经纪人 · 85/15 · $12K 封顶",
    soloPro: "独立经纪人 Pro · 100% · $3,650/年",
    teamMember: "团队成员 · 90/10 · Homix $10K 封顶",
    team: "所属团队",
    selectTeam: "请选择团队",
    sponsor: "Sponsor / 介绍人",
    noSponsor: "无 Sponsor",
    term: "挂靠期限",
    oneYear: "$288 · 1 年",
    twoYears: "$500 · 2 年预付",
    saveSetup: "提交入职资料",
    savingSetup: "正在提交…",
    setupSaved: "资料已提交，系统将自动发送入职协议。",
    teamRequestPending: (team: string) => `已申请加入 ${team}，Team Leader 接受后即可继续签署协议。`,
    teamRequestDeclined: (team: string, reason: string | null) =>
      `${team} 未接受本次申请。${reason ? `原因：${reason}` : "你可以选择其他团队或独立经纪人方案。"}`,
    setupFailed: "无法保存入职资料。",
    legalName: "法定姓名",
    phone: "电话",
    license: "执照号码",
    company: "持牌公司",
    selectCompany: "请选择持牌公司",
    companyFirst: "1. 选择持牌公司",
    companyFirstHint: "公司选择决定合同主体、MLS 要求和可加入的团队。",
    realtyRequirement: "需要办理 LIBOR/OneKey 会员并承担相关费用。",
    livingRequirement: "不要求办理 LIBOR/OneKey 会员。",
    liborStatus: "LIBOR 会员状态",
    liborStatusHint: "已有会员无需重复填写入会申请；新申请时系统会预填 Homix Realty 公司资料。",
    selectLiborStatus: "请选择 LIBOR 会员状态",
    applyNewLibor: "我需要申请 LIBOR 会员",
    existingLiborMember: "我已经是 LIBOR 会员",
    liborStatusRequired: "请选择是否需要新办 LIBOR 会员。",
    companyAcknowledgement: "我理解 Homix Realty Inc. 要求办理 LIBOR/OneKey 会员及相关费用；Homix Living Inc. 不要求 LIBOR/OneKey。",
    companyAcknowledgementRequired: "请先选择公司并确认 LIBOR/OneKey 要求。",
    practice: "业务范围",
    rental: "租赁",
    sales: "买卖",
    both: "租赁与买卖",
    invitedRoute: (source: string) => `已应用邀请 · ${source.toUpperCase()} · 被锁定的资料不可修改`,
    agreementTitle: "挂靠协议",
    continueSigning: "继续签署",
    resendSigning: "重发签署邮件",
    openingSigning: "正在打开…",
    resumeHint: "在新标签页继续原合同，已保存进度会保留。签署后回到本页付款。",
    resendHint: "提醒邮件会打开同一份合同，已保存进度会保留。",
    agreementHint: "系统会把已提交的信息带入协议；请先阅读签署，再支付费用。",
    sendAgreement: "重试发送协议",
    restartAgreement: "重新生成并发送协议",
    restartAgreementHint: "原协议已拒签、作废或过期。可使用已提交的资料重新生成协议；已支付的费用会保留。",
    finalizationFailed: "签名已保留，但最终文件生成失败。请联系管理员恢复文件，无需重新签署。",
    sendingAgreement: "正在发送协议…",
    agreementFailed: "协议发送失败，请检查上方资料后重试。",
    agreementPreparing: "正在生成已审核版本的协议…",
    agreementSent: "协议已发送，请打开邮箱中的安全链接签署，然后返回本页。",
    agreementCompleted: "协议已签署",
    agentSignatureCompleted: "你已完成签署；公司会签可继续进行，现在即可付款。",
    agreementUnavailable: "eSign 尚未配置，管理员仍可按现有人工流程处理。",
    payAnnualFee: "支付挂靠费用",
    paymentReceived: "费用已支付",
    finalReview: "费用已收到，系统正在自动开通 Portal 权限。",
    offlineReview: "线下收款已核验，等待管理员审批开通账号。",
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
  companyId: "homix_realty" | "homix_living" | null;
  requestable: boolean;
  compensationConfig: TeamTerms | null;
};

type CompanyOption = {
  id: "homix_realty" | "homix_living";
  legalName: string;
  address: string;
  requiresLiborOneKey: boolean;
};

type TeamJoinRequest = {
  id: number;
  teamId: number;
  teamName: string;
  status: "pending" | "accepted" | "declined" | "cancelled" | "superseded";
  decisionReason: string | null;
};

export function PendingApprovalClient({
  accountStatus,
  limitedCapabilities = [],
}: {
  accountStatus: "pending" | "active" | "inactive";
  limitedCapabilities?: string[];
}) {
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const [setupLoading, setSetupLoading] = useState(accountStatus === "pending");
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [showSubmittedSetup, setShowSubmittedSetup] = useState(false);
  const [setupMessage, setSetupMessage] = useState("");
  const [plan, setPlan] = useState("solo");
  const [teamId, setTeamId] = useState("");
  const [sponsorId, setSponsorId] = useState("");
  const [termMonths, setTermMonths] = useState("12");
  const [legalName, setLegalName] = useState("");
  const [phone, setPhone] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licensedCompany, setLicensedCompany] = useState("");
  const [liborMembershipStatus, setLiborMembershipStatus] = useState<"apply_new" | "existing_member" | "">("");
  const [companyRequirementsAcknowledged, setCompanyRequirementsAcknowledged] = useState(false);
  const [practice, setPractice] = useState("both");
  const [routingLocks, setRoutingLocks] = useState({
    plan: false,
    team: false,
    sponsor: false,
    term: false,
    company: false,
  });
  const [onboardingSource, setOnboardingSource] = useState("direct");
  const [agreementStatus, setAgreementStatus] = useState("not_started");
  const [contractSatisfied, setContractSatisfied] = useState(false);
  const [manualContract, setManualContract] = useState<{ id: string; source: string } | null>(null);
  const [agreementAgentSignedAt, setAgreementAgentSignedAt] = useState<string | null>(null);
  const [paymentChannel, setPaymentChannel] = useState<string | null>(null);
  const [agreementDocuments, setAgreementDocuments] = useState<Array<{ id: string; name: string; originalUrl: string; signedUrl: string | null }>>([]);
  const [paymentStatus, setPaymentStatus] = useState("pending");
  const [paymentProduct, setPaymentProduct] = useState<string | null>(null);
  const [esignConfigured, setEsignConfigured] = useState(false);
  const [agreementLoading, setAgreementLoading] = useState(false);
  const [agreementError, setAgreementError] = useState("");
  const [accessAction, setAccessAction] = useState<"continue" | "resend" | null>(null);
  const [accessMessage, setAccessMessage] = useState("");
  const [signingFallbackUrl, setSigningFallbackUrl] = useState<string | null>(null);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [frozenTeamTerms, setFrozenTeamTerms] = useState<TeamTerms | null>(null);
  const [teamJoinRequest, setTeamJoinRequest] = useState<TeamJoinRequest | null>(null);
  const [sponsors, setSponsors] = useState<Array<{ id: number; name: string }>>([]);
  const checkedOnce = useRef(false);
  const checkInFlight = useRef(false);
  const agreementRequestInFlight = useRef(false);
  const agreementAutoStartAttempted = useRef(false);
  const paymentRedirectStarted = useRef(false);
  const effectiveStatus = session?.user?.accountStatus ?? accountStatus;
  const lang = useLocale();
  const t = M[lang];

  const refreshProfile = useCallback(async () => {
    try {
      const response = await fetch("/api/onboarding/profile", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const request = (data.teamJoinRequest || null) as TeamJoinRequest | null;
      setTeamJoinRequest(request);
      setSetupComplete(Boolean(data.profile?.onboardingCompletedAt));
        const profileCompanyId = data.profile?.licensedCompanyId || "";
        const routedCompanyId = data.routing?.locks?.company
          ? data.routing?.licensedCompanyId || ""
          : "";
        const effectiveCompanyId = routedCompanyId || profileCompanyId;
        setPlan(data.profile?.plan || "solo");
        setTeamId(data.profile?.teamId ? String(data.profile.teamId) : "");
        setSponsorId(data.profile?.referredByAgentId ? String(data.profile.referredByAgentId) : "");
        setTermMonths(String(data.profile?.affiliationTermMonths || 12));
        setLegalName(data.profile?.legalName || "");
        setPhone(data.profile?.phone || "");
        setLicenseNumber(data.profile?.licenseNumber || "");
        setLicensedCompany(effectiveCompanyId);
        setLiborMembershipStatus(data.profile?.liborMembershipStatus || "");
        setCompanyRequirementsAcknowledged(Boolean(
          data.profile?.companyRequirementsAcknowledged &&
          profileCompanyId === effectiveCompanyId,
        ));
        setPractice(data.profile?.practice || "both");
        setFrozenTeamTerms(data.profile?.teamTerms || null);
        setRoutingLocks({
          plan: Boolean(data.routing?.locks?.plan),
          team: Boolean(data.routing?.locks?.team),
          sponsor: Boolean(data.routing?.locks?.sponsor),
          term: Boolean(data.routing?.locks?.term),
          company: Boolean(data.routing?.locks?.company),
        });
        setOnboardingSource(data.routing?.source || "direct");
        if (data.routing?.locked) {
          setPlan(data.routing.plan || "solo");
          setTeamId(data.routing.teamId ? String(data.routing.teamId) : "");
          setSponsorId(data.routing.referredByAgentId ? String(data.routing.referredByAgentId) : "");
          setTermMonths(String(data.routing.affiliationTermMonths || 12));
        }
        setAgreementStatus(data.profile?.agreementStatus || "not_started");
        setAgreementAgentSignedAt(data.profile?.agreementAgentSignedAt || null);
        setPaymentStatus(data.profile?.paymentStatus || "pending");
        setTeams(data.teams || []);
        setCompanies(data.companies || []);
        setSponsors(data.sponsors || []);
      if (request?.status === "pending") {
        setPlan("team_member");
        setTeamId(String(request.teamId));
        setSetupMessage(t.teamRequestPending(request.teamName));
      } else if (request?.status === "declined" && !data.profile?.onboardingCompletedAt) {
        setSetupMessage(t.teamRequestDeclined(request.teamName, request.decisionReason));
      } else if (data.profile?.onboardingCompletedAt) {
        setSetupMessage(t.setupSaved);
      }
    } catch {
      setSetupMessage(t.setupFailed);
    } finally {
      setSetupLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (accountStatus !== "pending") return;
    void refreshProfile();
  }, [accountStatus, refreshProfile]);

  useEffect(() => {
    if (teamJoinRequest?.status !== "pending") return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshProfile();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [refreshProfile, teamJoinRequest?.status]);

  const saveSetup = async () => {
    if (!licensedCompany || !companyRequirementsAcknowledged) {
      setSetupMessage(t.companyAcknowledgementRequired);
      return;
    }
    if (licensedCompany === "homix_realty" && !liborMembershipStatus) {
      setSetupMessage(t.liborStatusRequired);
      return;
    }
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
          licensedCompanyId: licensedCompany,
          liborMembershipStatus: licensedCompany === "homix_realty" ? liborMembershipStatus : null,
          companyRequirementsAcknowledged,
          practice,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error();
      if (data.requiresTeamApproval && data.teamJoinRequest) {
        const request = {
          ...data.teamJoinRequest,
          teamName: teams.find((team) => team.id === data.teamJoinRequest.teamId)?.name || t.team,
        } as TeamJoinRequest;
        setTeamJoinRequest(request);
        setSetupMessage(t.teamRequestPending(request.teamName));
      } else {
        setTeamJoinRequest(null);
        agreementAutoStartAttempted.current = false;
        setSetupComplete(true);
        setSetupMessage(t.setupSaved);
        await refreshAgreement();
      }
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
      setAgreementAgentSignedAt(data.agreementAgentSignedAt || null);
      setContractSatisfied(Boolean(data.contractSatisfied));
      setManualContract(data.manualContract || null);
      setPaymentStatus(data.paymentStatus || "pending");
      setPaymentChannel(data.paymentChannel || null);
      setPaymentProduct(data.paymentProduct || null);
    } catch (error) {
      console.error("Unable to load onboarding agreement", error);
    }
  }, []);

  const startAgreement = useCallback(async (recover = false) => {
    if (agreementRequestInFlight.current) return false;
    agreementRequestInFlight.current = true;
    setAgreementLoading(true);
    setAgreementError("");
    try {
      const response = await fetch("/api/onboarding/agreement", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: recover ? "recover" : "prepare" }) });
      if (!response.ok) throw new Error();
      await refreshAgreement();
      return true;
    } catch {
      setAgreementError(t.agreementFailed);
      return false;
    } finally {
      agreementRequestInFlight.current = false;
      setAgreementLoading(false);
    }
  }, [refreshAgreement, t.agreementFailed]);

  useEffect(() => {
    if (agreementStatus === "not_started") return;
    let cancelled = false;
    void fetch("/api/onboarding/agreement/documents", { cache: "no-store" }).then(async (response) => {
      if (response.ok && !cancelled) setAgreementDocuments((await response.json()).documents || []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [agreementStatus]);

  const recoverSigning = async (action: "continue" | "resend") => {
    if (accessAction) return;
    // Reserve the tab during the click. Keep onboarding open to poll signature
    // progress and continue to payment, including on mobile browsers.
    const signingTab = action === "continue" ? window.open("about:blank", "_blank") : null;
    if (signingTab) signingTab.opener = null;
    setAccessAction(action);
    setAccessMessage("");
    setSigningFallbackUrl(null);
    try {
      const response = await fetch("/api/onboarding/agreement/access", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) {
        signingTab?.close();
        const messages: Record<string, [string, string]> = {
          TOO_MANY_REQUESTS: ["操作较频繁，请稍后再试；重发邮件间隔为五分钟。", "Please wait before trying again. Signing emails can be resent once every five minutes."],
          ALREADY_SIGNED: ["你已完成签署，正在更新入职进度。", "You have already signed. Refreshing your onboarding progress."],
          AGREEMENT_EXPIRED: ["签署链接已过期，请重发签署邮件续期，已保存的签名会保留。", "This signing link expired. Resend the invitation to renew it; saved signatures are retained."],
          SIGNER_MISMATCH: ["合同签署邮箱与账号不一致，请联系管理员核对。", "The signing email does not match this account. Contact your administrator."],
          EMAIL_RESUME_REQUIRED: ["请使用签署邮件中的链接，也可点击重发签署邮件。", "Use the signing email link, or request a new signing email."],
        };
        const message = messages[data.code] || ["暂时无法连接签署服务，请稍后重试。原合同和进度仍保留。", "Unable to connect to signing. Try again; your agreement and saved progress are retained."];
        setAccessMessage(message[lang === "zh" ? 0 : 1]);
        await refreshAgreement();
      } else if (action === "continue" && typeof data.url === "string") {
        if (signingTab && !signingTab.closed) signingTab.location.replace(data.url);
        else setSigningFallbackUrl(data.url);
      } else {
        setAccessMessage(lang === "zh" ? `签署邮件已发送至 ${data.email}，请使用最新邮件。` : `Signing email sent to ${data.email}. Open the newest message.`);
      }
    } catch {
      signingTab?.close();
      setAccessMessage(lang === "zh" ? "连接失败，请稍后重试。" : "Connection failed. Please try again.");
    } finally { setAccessAction(null); }
  };

  useEffect(() => {
    if (accountStatus === "pending") void refreshAgreement();
  }, [accountStatus, refreshAgreement]);

  useEffect(() => {
    if (agreementStatus !== "preparing" && agreementStatus !== "sent") return;
    const interval = window.setInterval(() => void refreshAgreement(), 15_000);
    return () => window.clearInterval(interval);
  }, [agreementStatus, refreshAgreement]);

  useEffect(() => {
    if (
      accountStatus !== "pending" ||
      !setupComplete ||
      contractSatisfied ||
      !esignConfigured ||
      agreementStatus !== "not_started" ||
      teamJoinRequest?.status === "pending" ||
      agreementAutoStartAttempted.current
    ) {
      return;
    }
    agreementAutoStartAttempted.current = true;
    void startAgreement();
  }, [
    accountStatus,
    agreementStatus,
    esignConfigured,
    contractSatisfied,
    setupComplete,
    startAgreement,
    teamJoinRequest?.status,
  ]);

  useEffect(() => {
    if (
      accountStatus !== "pending" ||
      !contractSatisfied ||
      paymentStatus === "paid" ||
      !paymentProduct ||
      paymentRedirectStarted.current
    ) {
      return;
    }
    paymentRedirectStarted.current = true;
    router.replace(`/pay?product=${encodeURIComponent(paymentProduct)}&onboarding=1`);
  }, [accountStatus, contractSatisfied, paymentProduct, paymentStatus, router]);

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

  const refreshApproval = useCallback(async () => {
    if (checkInFlight.current) return;
    checkInFlight.current = true;
    try {
      const refreshed = await refreshApprovalSession(update);
      redirectIfApproved(refreshed || session);
    } catch (error) {
      console.error("Unable to refresh approval status", error);
    } finally {
      checkInFlight.current = false;
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
    void refreshApproval();
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
      if (document.visibilityState === "visible") void refreshApproval();
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

  const selectedTeamTerms = frozenTeamTerms
    || teams.find((team) => String(team.id) === teamId)?.compensationConfig
    || null;
  const availableTeams = teams.filter((team) => team.companyId === licensedCompany);
  const selectedCompany = companies.find((company) => company.id === licensedCompany) || null;

  return (
    <div className="flex min-h-[100svh] items-start justify-center px-3 py-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:min-h-screen sm:items-center sm:px-6 sm:py-8 sm:pb-8">
      <div className="w-full max-w-2xl">
        {limitedCapabilities.length > 0 && accountStatus === "pending" && <a href="/limited" className="mb-4 block rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">{lang === "zh" ? "部分工作台功能已临时开放，入职待办仍需完成。进入有限工作台 →" : "Temporary capabilities are available while onboarding remains outstanding. Open workspace →"}</a>}
        <div className="mb-5 flex justify-center sm:mb-8">
          <HomixMark size={36} />
        </div>

        <div
          className="rounded-xl p-4 text-center sm:rounded-2xl sm:p-8"
          style={{ background: tone.card, border: `1px solid ${tone.line}` }}
        >
          <div
            className="mb-3 text-[32px] sm:text-[40px]"
            style={{ lineHeight: 1 }}
            aria-hidden
          >
            {effectiveStatus === "inactive" ? "–" : "⏳"}
          </div>
          <h1
            className="font-serif text-[27px] sm:text-[30px]"
            style={{
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
            <div className="mt-5 min-w-0 rounded-none border-0 bg-transparent p-0 text-left sm:mt-6 sm:rounded-xl sm:border sm:border-line sm:bg-paper sm:p-5">
              <h2 className="font-serif text-[22px]" style={{ color: tone.ink }}>{setupComplete ? (lang === "zh" ? "入职资料已提交" : "Details submitted") : t.setupTitle}</h2>
              <p className="mt-1 text-[12px]" style={{ color: tone.ink50 }}>{setupComplete ? `${legalName || session?.user.name || ""} · ${selectedCompany?.legalName || licensedCompany}` : t.setupHint}</p>
              {setupComplete && <button type="button" className="mt-3 text-sm underline underline-offset-4" aria-expanded={showSubmittedSetup} aria-controls="pending-submitted-details" onClick={() => setShowSubmittedSetup(!showSubmittedSetup)}>{showSubmittedSetup ? (lang === "zh" ? "收起资料" : "Hide details") : (lang === "zh" ? "查看已提交资料" : "Review submitted details")}</button>}
              {(routingLocks.plan || routingLocks.team || routingLocks.sponsor || routingLocks.term || routingLocks.company) && (
                <p className="mt-3 rounded-lg px-3 py-2 text-[12px]" style={{ background: tone.paperDeep, color: tone.green }}>
                  {t.invitedRoute(onboardingSource)}
                </p>
              )}
              {setupLoading ? (
                <p className="mt-5 text-[13px]" style={{ color: tone.ink50 }}>{t.checking}</p>
              ) : (
                <div id="pending-submitted-details" className={`mt-4 min-w-0 gap-3 sm:mt-5 sm:grid-cols-2 sm:gap-4 ${setupComplete && !showSubmittedSetup ? "hidden" : "grid"}`}>
                  <div className="grid min-w-0 gap-3 rounded-lg p-3 sm:col-span-2 sm:p-4" style={{ background: tone.paperDeep, border: `1px solid ${tone.line}` }}>
                    <div>
                      <div className="text-[13px] font-medium" style={{ color: tone.ink }}>{t.companyFirst}</div>
                      <p className="mt-1 text-[11px] leading-5" style={{ color: tone.ink50 }}>{t.companyFirstHint}</p>
                    </div>
                    <select
                      value={licensedCompany}
                      onChange={(event) => {
                        setLicensedCompany(event.target.value);
                        setTeamId("");
                        setLiborMembershipStatus("");
                        setCompanyRequirementsAcknowledged(false);
                      }}
                      disabled={routingLocks.company || agreementStatus !== "not_started"}
                      className="h-11 w-full min-w-0 rounded-lg bg-white px-3 text-base disabled:opacity-60"
                      style={{ border: `1px solid ${tone.line}`, color: tone.ink }}
                    >
                      <option value="">{t.selectCompany}</option>
                      {companies.map((company) => (
                        <option key={company.id} value={company.id}>{company.legalName}</option>
                      ))}
                    </select>
                    {selectedCompany && (
                      <p className="text-[12px] leading-5" style={{ color: selectedCompany.requiresLiborOneKey ? tone.amber : tone.green }}>
                        {selectedCompany.requiresLiborOneKey ? t.realtyRequirement : t.livingRequirement}
                        <br />{selectedCompany.address}
                      </p>
                    )}
                    {selectedCompany?.requiresLiborOneKey && (
                      <label className="grid gap-1 text-[12px]" style={{ color: tone.ink70 }}>
                        {t.liborStatus}
                        <select
                          value={liborMembershipStatus}
                          onChange={(event) => setLiborMembershipStatus(event.target.value as "apply_new" | "existing_member" | "")}
                          disabled={agreementStatus !== "not_started"}
                          className="h-11 w-full min-w-0 rounded-lg bg-white px-3 text-base disabled:opacity-60"
                          style={{ border: `1px solid ${tone.line}`, color: tone.ink }}
                        >
                          <option value="">{t.selectLiborStatus}</option>
                          <option value="apply_new">{t.applyNewLibor}</option>
                          <option value="existing_member">{t.existingLiborMember}</option>
                        </select>
                        <span className="text-[11px] leading-5" style={{ color: tone.ink50 }}>
                          {t.liborStatusHint}
                        </span>
                      </label>
                    )}
                    <label className="flex min-w-0 items-start gap-3 text-[12px] leading-5" style={{ color: tone.ink70 }}>
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={companyRequirementsAcknowledged}
                        onChange={(event) => setCompanyRequirementsAcknowledged(event.target.checked)}
                        disabled={!licensedCompany || agreementStatus !== "not_started"}
                      />
                      <span className="min-w-0">{t.companyAcknowledgement}</span>
                    </label>
                  </div>
                  <label className="grid gap-1 text-[12px]" style={{ color: tone.ink70 }}>
                    {t.legalName}
                    <input value={legalName} onChange={(event) => setLegalName(event.target.value)} disabled={agreementStatus !== "not_started"} className="h-11 w-full min-w-0 rounded-lg bg-white px-3 text-base disabled:opacity-60" style={{ border: `1px solid ${tone.line}`, color: tone.ink }} />
                  </label>
                  <label className="grid gap-1 text-[12px]" style={{ color: tone.ink70 }}>
                    {t.phone}
                    <input value={phone} onChange={(event) => setPhone(event.target.value)} disabled={agreementStatus !== "not_started"} inputMode="tel" className="h-11 w-full min-w-0 rounded-lg bg-white px-3 text-base disabled:opacity-60" style={{ border: `1px solid ${tone.line}`, color: tone.ink }} />
                  </label>
                  <label className="grid gap-1 text-[12px]" style={{ color: tone.ink70 }}>
                    {t.license}
                    <input value={licenseNumber} onChange={(event) => setLicenseNumber(event.target.value)} disabled={agreementStatus !== "not_started"} className="h-11 w-full min-w-0 rounded-lg bg-white px-3 text-base disabled:opacity-60" style={{ border: `1px solid ${tone.line}`, color: tone.ink }} />
                  </label>
                  <label className="grid gap-1 text-[12px] sm:col-span-2" style={{ color: tone.ink70 }}>
                    {t.practice}
                    <select value={practice} onChange={(event) => setPractice(event.target.value)} disabled={agreementStatus !== "not_started"} className="h-11 w-full min-w-0 rounded-lg bg-white px-3 text-base disabled:opacity-60" style={{ border: `1px solid ${tone.line}`, color: tone.ink }}>
                      <option value="rental">{t.rental}</option>
                      <option value="sales">{t.sales}</option>
                      <option value="both">{t.both}</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-[12px]" style={{ color: tone.ink70 }}>
                    {t.track}
                    <select value={plan} onChange={(event) => setPlan(event.target.value)} disabled={routingLocks.plan || agreementStatus !== "not_started"} className="h-11 w-full min-w-0 rounded-lg bg-white px-3 text-base disabled:opacity-60" style={{ border: `1px solid ${tone.line}`, color: tone.ink }}>
                      <option value="solo">{t.solo}</option>
                      <option value="solo_pro">{t.soloPro}</option>
                      <option value="team_member">{t.teamMember}</option>
                    </select>
                  </label>
                  {plan === "team_member" ? (
                    <label className="grid gap-1 text-[12px]" style={{ color: tone.ink70 }}>
                      {t.team}
                      <select value={teamId} onChange={(event) => setTeamId(event.target.value)} disabled={routingLocks.team || agreementStatus !== "not_started"} className="h-11 w-full min-w-0 rounded-lg bg-white px-3 text-base disabled:opacity-60" style={{ border: `1px solid ${tone.line}`, color: tone.ink }}>
                        <option value="">{t.selectTeam}</option>
                        {availableTeams.map((team) => (
                          <option
                            key={team.id}
                            value={team.id}
                            disabled={!team.requestable && !routingLocks.team}
                          >
                            {team.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label className="grid gap-1 text-[12px]" style={{ color: tone.ink70 }}>
                      {t.term}
                      <select value={plan === "solo_pro" ? "12" : termMonths} onChange={(event) => setTermMonths(event.target.value)} disabled={plan === "solo_pro" || routingLocks.term || agreementStatus !== "not_started"} className="h-11 w-full min-w-0 rounded-lg bg-white px-3 text-base disabled:opacity-60" style={{ border: `1px solid ${tone.line}`, color: tone.ink }}>
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
                    <select value={sponsorId} onChange={(event) => setSponsorId(event.target.value)} disabled={routingLocks.sponsor || agreementStatus !== "not_started"} className="h-11 w-full min-w-0 rounded-lg bg-white px-3 text-base disabled:opacity-60" style={{ border: `1px solid ${tone.line}`, color: tone.ink }}>
                      <option value="">{t.noSponsor}</option>
                      {sponsors.map((sponsor) => <option key={sponsor.id} value={sponsor.id}>{sponsor.name}</option>)}
                    </select>
                  </label>
                  <Btn variant="primary" className="justify-center sm:col-span-2" onClick={() => void saveSetup()} disabled={setupSaving || agreementStatus !== "not_started"}>
                    {setupSaving ? t.savingSetup : t.saveSetup}
                  </Btn>
                  {setupMessage && (
                    <p
                      className="text-center text-[12px] sm:col-span-2"
                      style={{
                        color: setupMessage === t.setupSaved
                          ? tone.green
                          : teamJoinRequest?.status === "pending"
                            ? tone.amber
                            : tone.rose,
                      }}
                    >
                      {setupMessage}
                    </p>
                  )}
                </div>
              )}

              {setupComplete && teamJoinRequest?.status !== "pending" && (
                <div className="mt-5 border-t pt-5" style={{ borderColor: tone.line }}>
                  <h3 className="font-serif text-[20px]" style={{ color: tone.ink }}>{t.agreementTitle}</h3>
                  <p className="mt-1 text-[12px]" style={{ color: tone.ink50 }}>{t.agreementHint}</p>
                  {manualContract ? (
                    <p className="mt-3 text-sm text-green-800">{lang === "zh" ? "线下 / 历史合同已核验，无需重复电子签署。" : "Offline / historical contract verified. No duplicate electronic signature is required."} <a className="underline" target="_blank" rel="noopener noreferrer" href={`/api/onboarding/contracts/${manualContract.id}`}>{lang === "zh" ? "查看已签合同 ↗" : "View signed contract ↗"}</a></p>
                  ) : !esignConfigured ? (
                    <p className="mt-3 text-[12px]" style={{ color: tone.amber }}>{t.agreementUnavailable}</p>
                  ) : agreementStatus === "completed" ? (
                    <p className="mt-3 text-[13px]" style={{ color: tone.green }}>{t.agreementCompleted}</p>
                  ) : canRestartAgreement(agreementStatus) ? (
                    <div className="mt-3">
                      <p className="text-[12px]" style={{ color: tone.rose }}>{agreementStatus === "expired" ? (lang === "zh" ? "签署链接已过期，续期会保留原合同和已保存的签名。" : "Renew this link to keep the original agreement and saved signatures.") : t.restartAgreementHint}</p>
                      <Btn variant="primary" className="mt-3 w-full justify-center" disabled={agreementLoading} onClick={() => void startAgreement(true)}>
                        {agreementLoading ? t.sendingAgreement : agreementStatus === "expired" ? (lang === "zh" ? "重发并续期签署链接" : "Renew signing link") : t.restartAgreement}
                      </Btn>
                      {agreementError && <p className="mt-2 text-[12px]" style={{ color: tone.rose }}>{agreementError}</p>}
                    </div>
                  ) : agreementStatus === "failed" ? (
                    <p className="mt-3 text-[12px]" style={{ color: tone.rose }}>{t.finalizationFailed}</p>
                  ) : agreementAgentSignedAt ? (
                    <p className="mt-3 text-[13px]" style={{ color: tone.green }}>{t.agentSignatureCompleted}</p>
                  ) : agreementStatus === "preparing" ? (
                    <div className="mt-3">
                      <p className="text-[12px]" style={{ color: tone.amber }}>{t.agreementPreparing}</p>
                      <Btn variant="outline" className="mt-3 w-full justify-center" disabled={agreementLoading} onClick={() => void startAgreement()}>{t.sendAgreement}</Btn>
                      {agreementError && <p className="mt-2 text-[12px]" style={{ color: tone.rose }}>{agreementError}</p>}
                    </div>
                  ) : agreementStatus === "sent" ? (
                    <div className="mt-3 space-y-3">
                      <p className="text-[12px]" style={{ color: tone.ink70 }}>{t.resumeHint}</p>
                      <Btn variant="primary" className="w-full justify-center" disabled={accessAction !== null} onClick={() => void recoverSigning("continue")}>
                        {accessAction === "continue" ? t.openingSigning : t.continueSigning}
                      </Btn>
                      <Btn variant="outline" className="w-full justify-center" disabled={accessAction !== null} onClick={() => void recoverSigning("resend")}>{t.resendSigning}</Btn>
                      <p className="text-[12px]" style={{ color: tone.ink50 }}>{t.resendHint}</p>
                      {accessMessage && <p role="status" className="text-[13px]" style={{ color: tone.ink }}>{accessMessage}</p>}
                      {signingFallbackUrl && <a className="admin-control justify-center" href={signingFallbackUrl} target="_blank" rel="noopener noreferrer">{lang === "zh" ? "点击打开签署页面 ↗" : "Open signing page ↗"}</a>}
                    </div>
                  ) : (
                    <div className="mt-3">
                      {agreementLoading ? (
                        <p className="text-[12px]" style={{ color: tone.amber }}>{t.sendingAgreement}</p>
                      ) : agreementError ? (
                        <>
                          <p className="text-[12px]" style={{ color: tone.rose }}>{agreementError}</p>
                          <Btn variant="outline" className="mt-3 w-full justify-center" onClick={() => void startAgreement()}>
                            {t.sendAgreement}
                          </Btn>
                        </>
                      ) : (
                        <p className="text-[12px]" style={{ color: tone.amber }}>{t.agreementPreparing}</p>
                      )}
                    </div>
                  )}
                  {agreementDocuments.map((document) => <a key={document.id} className="mt-3 block text-sm underline underline-offset-4" href={document.signedUrl || document.originalUrl} target="_blank" rel="noopener noreferrer">{document.signedUrl ? (lang === "zh" ? "查看已签合同" : "View signed agreement") : (lang === "zh" ? "查看原合同（未含签名）" : "View original agreement (without signatures)")} · {document.name}</a>)}
                  {contractSatisfied && paymentProduct && paymentStatus !== "paid" && (
                    <Btn variant="primary" className="mt-4 w-full justify-center" onClick={() => router.push(`/pay?product=${encodeURIComponent(paymentProduct)}&onboarding=1`)}>
                      {t.payAnnualFee}
                    </Btn>
                  )}
                  {paymentStatus === "paid" && (
                    <p className="mt-3 text-[13px]" style={{ color: tone.green }}>{t.paymentReceived}</p>
                  )}
                  {contractSatisfied && (paymentStatus === "paid" || !paymentProduct) && (
                    <p className="mt-3 text-[12px]" style={{ color: tone.ink70 }}>{paymentChannel === "offline" ? t.offlineReview : t.finalReview}</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-6 grid gap-2">
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
