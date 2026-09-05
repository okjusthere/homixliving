import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2, FileText, ShieldCheck, UserRoundCheck } from "lucide-react";
import { auth } from "@/auth";
import { HomixMark } from "@/components/homix/brand-mark";
import { tone } from "@/components/homix/tokens";

export const metadata: Metadata = {
  title: "Join Homix | Agent Application",
  description: "Start or continue your application to join Homix.",
};

const COPY = {
  en: {
    eyebrow: "Homix agent application",
    title: "Build your next chapter with Homix.",
    lead: "Create your application with a Google account, then complete your license details, commission-plan selection, agreement, and onboarding steps in one place.",
    continue: "Start or continue application",
    privacy: "Your application is private and is reviewed only by the Homix recruiting and operations team.",
    language: "中文",
    preparation: "What to prepare",
    items: [
      ["Basic profile", "Your legal name, phone number, and real estate license information."],
      ["Business path", "Your brokerage entity, practice focus, commission plan, and team preference."],
      ["Final steps", "Review your agreement, complete the applicable fee, and submit for activation."],
    ],
    already: "Already an active Homix agent?",
    signIn: "Go to agent login",
    inactiveTitle: "This account is inactive.",
    inactiveBody: "Please contact Homix before starting another application with this Google account.",
    contact: "Contact Homix",
  },
  zh: {
    eyebrow: "Homix 经纪人申请",
    title: "在 Homix，开启职业发展的下一阶段。",
    lead: "使用 Google 账号创建申请，并在一个流程中完成执照资料、佣金方案选择、协议签署与入职手续。",
    continue: "开始或继续申请",
    privacy: "申请资料仅供 Homix 招聘与运营团队审核，不会公开展示。",
    language: "EN",
    preparation: "申请前请准备",
    items: [
      ["基本资料", "法定姓名、联系电话和纽约州房地产执照信息。"],
      ["业务选择", "挂靠公司、业务方向、佣金方案和团队意向。"],
      ["完成入职", "核对协议、完成适用费用，并提交公司审核激活。"],
    ],
    already: "已经是 Homix 在职经纪人？",
    signIn: "前往经纪人登录",
    inactiveTitle: "此账号目前已停用。",
    inactiveBody: "使用该 Google 账号重新申请前，请先联系 Homix。",
    contact: "联系 Homix",
  },
} as const;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PublicJoinPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const locale = first(query.lang) === "zh" ? "zh" : "en";
  const t = COPY[locale];
  const session = await auth();

  if (session?.user?.isAdmin || session?.user?.accountStatus === "active") redirect("/");
  if (session?.user?.accountStatus === "pending") redirect("/pending");

  const source = first(query.source) === "homix-web" ? "homix-web" : "direct";
  const startParams = new URLSearchParams({ source, lang: locale });
  const requestedPlan = first(query.plan);
  if (requestedPlan === "solo" || requestedPlan === "solo_pro" || requestedPlan === "team_member") {
    startParams.set("plan", requestedPlan);
  }
  const campaign = first(query.campaign) || first(query.utm_campaign);
  if (campaign && /^[a-z0-9_-]{1,64}$/i.test(campaign)) startParams.set("campaign", campaign);

  const inactive = session?.user?.accountStatus === "inactive";
  const icons = [UserRoundCheck, FileText, CheckCircle2];
  const otherLocale = locale === "zh" ? "en" : "zh";
  const languageParams = new URLSearchParams(startParams);
  languageParams.set("lang", otherLocale);

  return (
    <main className="min-h-screen px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between">
          <HomixMark size={34} />
          <Link
            href={`/join?${languageParams.toString()}`}
            className="text-sm font-medium hover:opacity-60"
            style={{ color: tone.ink70 }}
          >
            {t.language}
          </Link>
        </header>

        <div className="grid gap-12 pb-12 pt-14 lg:grid-cols-[1.08fr_0.92fr] lg:items-start lg:gap-20 lg:pt-24">
          <section>
            <p className="text-[11px] font-medium uppercase" style={{ color: tone.ink50, letterSpacing: "0.14em" }}>
              {t.eyebrow}
            </p>
            <h1 className="mt-5 max-w-2xl font-serif text-5xl leading-[1.05] sm:text-6xl" style={{ color: tone.ink, letterSpacing: 0 }}>
              {t.title}
            </h1>
            <p className="mt-7 max-w-xl text-base leading-7 sm:text-lg" style={{ color: tone.ink70 }}>
              {t.lead}
            </p>

            {inactive ? (
              <div className="mt-9 border-l-2 py-1 pl-5" style={{ borderColor: tone.rose }}>
                <h2 className="text-lg font-medium" style={{ color: tone.ink }}>{t.inactiveTitle}</h2>
                <p className="mt-2 text-sm leading-6" style={{ color: tone.ink70 }}>{t.inactiveBody}</p>
                <a className="mt-4 inline-flex items-center gap-2 text-sm font-medium" style={{ color: tone.ink }} href="mailto:homix@homixny.com">
                  {t.contact}<ArrowRight className="size-4" aria-hidden />
                </a>
              </div>
            ) : (
              <div className="mt-9">
                <Link
                  href={`/join/start?${startParams.toString()}`}
                  className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-85"
                  style={{ background: tone.ink }}
                >
                  {t.continue}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
                <div className="mt-4 flex max-w-lg gap-2 text-xs leading-5" style={{ color: tone.ink50 }}>
                  <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{t.privacy}</span>
                </div>
              </div>
            )}
          </section>

          <aside className="border-t pt-7 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0" style={{ borderColor: tone.line }}>
            <h2 className="font-serif text-2xl" style={{ color: tone.ink }}>{t.preparation}</h2>
            <div className="mt-7 space-y-7">
              {t.items.map(([title, body], index) => {
                const Icon = icons[index];
                return (
                  <div key={title} className="grid grid-cols-[32px_1fr] gap-4">
                    <div className="flex size-8 items-center justify-center rounded-full" style={{ background: tone.paperDeep, color: tone.ink70 }}>
                      <Icon className="size-4" aria-hidden />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium" style={{ color: tone.ink }}>{title}</h3>
                      <p className="mt-1 text-sm leading-6" style={{ color: tone.ink50 }}>{body}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-9 border-t pt-6 text-sm" style={{ borderColor: tone.line, color: tone.ink50 }}>
              <span>{t.already}</span>{" "}
              <Link href="/login" className="font-medium underline underline-offset-4" style={{ color: tone.ink }}>
                {t.signIn}
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
