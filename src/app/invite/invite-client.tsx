"use client";

import { useState } from "react";
import { ArrowRight, Check, Copy, CreditCard, FileSignature, Link2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Btn, Card } from "@/components/homix/primitives";
import { PageHeader } from "@/components/homix/page-kit";
import { tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";
import { AdvancedInvitation, type InvitationOptions } from "./advanced-invitation";

const M = {
  en: {
    eyebrow: "Grow with Homix", title: "Invite to join",
    description: "Invite an agent you believe in. Share one personal link, and let them take the next step.",
    reward: "Lifetime referral fee", headline: "A good introduction keeps giving.",
    lead: "Earn 10% of eligible revenue Homix receives from the agents you refer, including future qualifying transactions and plan renewals.",
    lifetime: "Lifetime means the reward continues with qualifying revenue over the referred agent’s relationship with Homix, under the applicable agreement. It is not limited to their first deal or first year.",
    basisTitle: "How the 10% works",
    basis: "Transaction rewards use Homix’s Company Dollar and Source Fee. Eligible membership and Solo Pro annual fees also earn 10% when settled, including renewals. Transaction fees, license-transfer charges, and the agent’s take-home commission are excluded.",
    example: "For example", exampleBody: "When Homix receives $1,000 in eligible revenue from your referred agent, your referral reward is $100.",
    note: "Rewards follow actual settlement and the signed agreement. An invitation alone does not create a payable reward.",
    linkTitle: "Your personal invitation", sponsor: "Inviter", linkLead: "One link for all your introductions. Return here whenever you need to copy it again.",
    create: "Get my invitation link", creating: "Preparing your link…", copy: "Copy invitation link", copied: "Invitation link copied", copyFailed: "Could not copy. Select the link and copy it manually.",
    failed: "Could not prepare your link. Please try again.", inactive: "Personal invitations are available once your agent account is active.",
    perks: ["Reusable, with no 30-day expiry", "No recipient email required", "You are automatically recorded as the sponsor"],
    freedom: "Your invitee chooses their company and plan during onboarding. They can apply to a team with its leader’s approval; your referral remains attached.",
    stepsTitle: "One link. The complete joining process.", stepsLead: "Your invitee follows the existing self-service application, with their progress saved along the way.",
    steps: [
      ["Open & sign in", "Open your link and use Google to start or continue an application."],
      ["Complete a profile", "Enter personal and license details, then select a company and plan."],
      ["Sign electronically", "Review the applicable agreements and complete eSign."],
      ["Pay & activate", "Pay the applicable desk or membership fee and required onboarding charges. Eligible online applications activate after settlement; offline payments and exceptions go through review."],
    ],
  },
  zh: {
    eyebrow: "与 Homix 一起成长", title: "邀请加入",
    description: "把你认可的经纪人介绍给 Homix。分享专属链接，让对方自己完成加入。",
    reward: "Lifetime referral fee · 长期推荐奖励", headline: "一次介绍，持续分享成长。",
    lead: "你推荐的经纪人为 Homix 带来符合条件的收入，你可获得其中 10% 的推荐奖励，涵盖后续符合条件的交易与方案续费。",
    lifetime: "Lifetime 指在被推荐人与 Homix 的合作期间，按照适用协议，持续对符合条件的收入计提奖励，不限于第一笔成交或第一年。",
    basisTitle: "10% 怎么计算",
    basis: "交易奖励以 Homix 的公司分成（Company Dollar）与来源费（Source Fee）为基数；符合条件的会员费、Solo Pro 年费及后续续费，在结算后同样计提 10%。交易手续费、执照转入费和经纪人到手佣金不计入这一基数。",
    example: "举个例子", exampleBody: "被推荐人带来 $1,000 的 Homix 符合条件收入，你的推荐奖励为 $100。",
    note: "奖励以实际结算及已签协议为准。发出邀请本身不会产生应付奖励。",
    linkTitle: "你的专属邀请链接", sponsor: "邀请人", linkLead: "一个链接可以反复分享。每次想邀请新人，回到这里复制即可。",
    create: "获取我的邀请链接", creating: "正在准备链接…", copy: "复制邀请链接", copied: "邀请链接已复制", copyFailed: "复制失败，请选中链接手动复制。",
    failed: "暂时无法准备链接，请重试。", inactive: "经纪人账号开通后即可使用个人邀请。",
    perks: ["可以反复使用，无 30 天过期限制", "无需提前填写对方邮箱", "系统自动记录你为介绍人"],
    freedom: "对方在入职时自行选择公司和方案，也可申请加入团队并由团队负责人接受；推荐关系仍归属于你。",
    stepsTitle: "从一个链接，完成整套加入流程。", stepsLead: "对方进入现有的自助入职流程，已提交的进度会保存，方便继续办理。",
    steps: [
      ["打开链接并登录", "使用你的邀请链接，通过 Google 创建或继续申请。"],
      ["填写个人资料", "补齐个人与执照信息，选择挂靠公司及佣金方案。"],
      ["完成电子签约", "查看适用协议，通过 eSign 完成签署。"],
      ["支付费用并开通", "支付适用台费或会员费及必要入职费用。符合条件的线上申请结算后自动开通；线下付款及例外情况进入审核。"],
    ],
  },
} as const;

export function InviteClient({ name, canRefer, initialPath, options }: {
  name: string; canRefer: boolean; initialPath: string | null; options: InvitationOptions;
}) {
  const locale = useLocale();
  const t = M[locale];
  const [path, setPath] = useState(initialPath);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [manualUrl, setManualUrl] = useState("");

  async function prepareLink() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/onboarding/referral-link", { method: "POST" });
      const data = await response.json();
      if (!response.ok || typeof data.path !== "string") throw new Error();
      setPath(data.path);
    } catch { setError(t.failed); }
    finally { setBusy(false); }
  }

  async function copyLink() {
    if (!path) return;
    const url = new URL(path, window.location.origin);
    url.searchParams.set("lang", locale);
    setManualUrl(url.toString());
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      toast.success(t.copied);
    } catch { toast.error(t.copyFailed); }
  }

  const stepIcons = [Link2, UserRound, FileSignature, CreditCard];
  return <div className="space-y-8">
    <PageHeader eyebrow={t.eyebrow} title={t.title} description={t.description} />
    <div className="grid items-start gap-5 lg:grid-cols-[1.15fr_1fr]">
      <section className="rounded-2xl p-6 sm:p-9" style={{ background: tone.accentSoft, color: tone.ink }}>
        <p className="text-[11px] font-medium uppercase tracking-[0.12em]" style={{ color: tone.accent }}>{t.reward}</p>
        <div className="mt-4 font-serif text-[100px] leading-none tracking-[-0.05em] sm:text-[128px]" style={{ color: tone.accent }}>10<span className="text-[58px]">%</span></div>
        <h2 className="mt-5 font-serif text-[27px] leading-snug sm:text-[32px]">{t.headline}</h2>
        <p className="mt-4 text-[14px] leading-7" style={{ color: tone.ink70 }}>{t.lead}</p>
        <p className="mt-5 border-t pt-5 text-[12px] leading-6" style={{ borderColor: `${tone.accent}30`, color: tone.ink70 }}>{t.lifetime}</p>
      </section>
      <Card className="p-6 sm:p-8">
        <h2 className="font-serif text-[26px]" style={{ color: tone.ink }}>{t.linkTitle}</h2>
        <p className="mt-2 text-[13px] leading-6" style={{ color: tone.ink50 }}>{t.linkLead}</p>
        <div className="my-6 border-y py-4 text-[13px]" style={{ borderColor: tone.lineSoft, color: tone.ink50 }}>{t.sponsor}<span className="ml-3 font-medium" style={{ color: tone.ink }}>{name}</span></div>
        <ul className="mb-6 space-y-3">
          {t.perks.map((perk) => <li key={perk} className="flex items-start gap-2 text-[13px]" style={{ color: tone.ink70 }}><Check size={16} className="mt-0.5 shrink-0" style={{ color: tone.accent }} aria-hidden />{perk}</li>)}
        </ul>
        {!canRefer ? <p className="text-[13px]" style={{ color: tone.ink50 }}>{t.inactive}</p> : path ? <>
          <Btn variant="primary" className="w-full justify-center" icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={() => void copyLink()}>{t.copy}</Btn>
          {manualUrl && <input aria-label={t.linkTitle} readOnly value={manualUrl} onFocus={(event) => event.target.select()} className="mt-3 h-11 w-full rounded-lg border px-3 font-mono text-[11px]" style={{ borderColor: tone.line, color: tone.ink70, background: tone.paper }} />}
        </> : <Btn variant="primary" className="w-full justify-center" disabled={busy} icon={<ArrowRight size={16} />} onClick={() => void prepareLink()}>{busy ? t.creating : t.create}</Btn>}
        {error && <p role="alert" className="mt-3 text-[13px]" style={{ color: tone.rose }}>{error}</p>}
        <p className="mt-5 text-[12px] leading-6" style={{ color: tone.ink50 }}>{t.freedom}</p>
      </Card>
    </div>
    <section className="grid gap-6 border-y py-7 md:grid-cols-[1.3fr_1fr]" style={{ borderColor: tone.line }}>
      <div><h2 className="font-serif text-[23px]">{t.basisTitle}</h2><p className="mt-3 text-[13px] leading-7" style={{ color: tone.ink70 }}>{t.basis}</p></div>
      <div className="rounded-xl p-5" style={{ background: tone.paperDeep }}><p className="text-[11px] uppercase tracking-wider" style={{ color: tone.ink50 }}>{t.example}</p><p className="mt-2 text-[15px] leading-7">{t.exampleBody}</p><p className="mt-3 text-[12px] leading-6" style={{ color: tone.ink50 }}>{t.note}</p></div>
    </section>
    <section>
      <h2 className="font-serif text-[27px]">{t.stepsTitle}</h2>
      <p className="mt-2 text-[13px] leading-6" style={{ color: tone.ink50 }}>{t.stepsLead}</p>
      <ol className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {t.steps.map(([title, body], index) => {
          const Icon = stepIcons[index];
          return <li key={title} className="border-t pt-4" style={{ borderColor: tone.line }}><div className="flex items-center justify-between" style={{ color: tone.accent }}><span className="font-mono text-[12px]">0{index + 1}</span><Icon size={18} aria-hidden /></div><h3 className="mt-4 text-[14px] font-medium">{title}</h3><p className="mt-2 text-[12px] leading-6" style={{ color: tone.ink50 }}>{body}</p></li>;
        })}
      </ol>
    </section>
    {(options.isAdmin || options.teams.length > 0) && <AdvancedInvitation options={options} />}
  </div>;
}
