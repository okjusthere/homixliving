"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Btn, Card } from "@/components/homix/primitives";
import { CardHeader } from "@/components/homix/page-kit";
import { tone } from "@/components/homix/tokens";
import { AvatarCropper } from "@/components/homix/avatar-cropper";
import type { PublicProfile } from "@/lib/homixweb";
import { useLocale } from "@/lib/i18n-client";

const PLACEHOLDER = "/agent-placeholder-logo.png";
const SOCIAL_KEYS = ["instagram", "xiaohongshu", "douyin", "youtube", "linkedin", "website"] as const;
const SOCIAL_LABEL: Record<string, { en: string; zh: string }> = {
  instagram: { en: "Instagram", zh: "Instagram" },
  xiaohongshu: { en: "Xiaohongshu", zh: "小红书" },
  douyin: { en: "Douyin", zh: "抖音" },
  youtube: { en: "YouTube", zh: "YouTube" },
  linkedin: { en: "LinkedIn", zh: "LinkedIn" },
  website: { en: "Personal website", zh: "个人网站" },
};
const STAT_KEYS = ["years", "transactions", "volume", "areas"] as const;
const STAT_LABEL: Record<string, { en: string; zh: string }> = {
  years: { en: "Years in business", zh: "从业年数" },
  transactions: { en: "Transactions", zh: "成交笔数" },
  volume: { en: "Sales volume", zh: "成交额" },
  areas: { en: "Primary markets", zh: "主打区域" },
};
const STAT_PH: Record<string, string> = {
  years: "10+",
  transactions: "150+",
  volume: "$80M+",
  areas: "Flushing · Long Island · Manhattan",
};

const M = {
  en: {
    unreachable: "The public website is temporarily unavailable. Try again later. If this continues, verify HOMIXWEB_REVALIDATE_URL and AGENTS_REVALIDATE_SECRET.",
    publishFailed: "Unable to create the profile. Please try again.",
    unpublishedTitle: "Public profile not yet published",
    unpublishedOwn: "Your Portal account is not linked to a website advisor profile. Ask an administrator to link an existing profile before creating a new one.",
    unpublishedAdmin: (name: string) => `${name} is not linked to a website advisor profile. Check the website roster for an existing profile before creating a new one.`,
    checkRoster: "Check website roster first",
    createProfile: "No existing profile — create a new one",
    creating: "Creating…",
    visibilityFailed: "Unable to update profile visibility.",
    visibleSaved: "The profile is now visible on the website.",
    hiddenSaved: "You have hidden the profile.",
    saveFailed: "Unable to save. Please try again.",
    saved: "Saved and synced to the public website.",
    visible: "Visible on the public website",
    agentHidden: "Hidden by you",
    adminHidden: "Hidden by an administrator",
    viewProfile: "View public profile",
    hideProfile: "Hide my profile",
    showProfile: "Show my profile again",
    photo: "Headshot",
    photoHint: "A clean headshot on a solid background works best",
    identity: "Identity",
    identityHint: "Managed in your company record inside the Portal",
    name: "Name",
    phone: "Phone",
    license: "License number",
    editIdentity: "Edit identity details",
    websiteBasics: "Website basics",
    title: "Title",
    max80: "Up to 80 characters",
    publicEmail: "Public email",
    publicEmailHint: "Shown to website visitors",
    languages: "Languages",
    commaSeparated: "Comma-separated",
    languagesPlaceholder: "English, Chinese",
    specialties: "Specialties",
    specialtiesPlaceholder: "First-time buyers, investments, school districts",
    showPastDeals: "Show MLS transaction history on my profile",
    about: "About me",
    aboutHint: "Your introduction appears prominently on the profile",
    bioPlaceholder: "Describe your background, service areas, and how you help clients. Up to 600 characters.",
    social: "Social media",
    socialHint: "Enter full links (https://…). Empty fields are hidden.",
    wechatQr: "WeChat QR code",
    removeQr: "Remove QR code",
    removeAfterSave: "The QR code will be removed after saving.",
    undo: "Undo",
    qrHint: "Uploading a new code replaces the current one. Upload a clear, uncropped image.",
    reviews: "Review links",
    reviewsHint: "A link is required to display a source; rating and count are optional.",
    link: "link",
    rating: "Rating",
    reviewCount: "Review count",
    stats: "Performance highlights",
    statsHint: "Optional self-reported figures shown on the profile",
    testimonials: "Client testimonials",
    testimonialsHint: "Up to three; empty entries are hidden.",
    testimonialPlaceholder: (n: number) => `Testimonial ${n} — what a client said about you`,
    authorPlaceholder: "Attribution (optional), e.g. J. Smith",
    unsavedHint: "Saved changes sync immediately to the public website.",
    saving: "Saving…",
    save: "Save and sync",
  },
  zh: {
    unreachable: "暂时无法连接对外网站（www.homixny.com）。请稍后重试；如持续失败，请检查 HOMIXWEB_REVALIDATE_URL 与 AGENTS_REVALIDATE_SECRET。",
    publishFailed: "发布失败，请重试。",
    unpublishedTitle: "尚未发布对外主页",
    unpublishedOwn: "你的 Portal 账号尚未关联官网经纪人档案。请联系管理员关联既有档案；完成后即可在这里编辑并控制显示状态。",
    unpublishedAdmin: (name: string) => `${name} 目前尚未关联官网档案。请先检查官网名册是否已有档案，确认没有后再创建新主页。`,
    checkRoster: "先检查官网名册",
    createProfile: "确认没有既有档案，创建新主页",
    creating: "创建中…",
    visibilityFailed: "无法更新公开状态。",
    visibleSaved: "主页已在官网显示。",
    hiddenSaved: "主页已由你隐藏。",
    saveFailed: "保存失败，请重试。",
    saved: "已保存并同步到对外网站。",
    visible: "已在对外网站公开",
    agentHidden: "已由你隐藏",
    adminHidden: "已由管理员隐藏",
    viewProfile: "查看对外主页",
    hideProfile: "隐藏我的主页",
    showProfile: "重新显示我的主页",
    photo: "头像照片",
    photoHint: "干净纯色背景的证件照效果最好",
    identity: "身份信息",
    identityHint: "来自公司档案，只在 Portal 中维护",
    name: "姓名",
    phone: "电话",
    license: "执照号",
    editIdentity: "修改身份资料",
    websiteBasics: "官网基本资料",
    title: "职称",
    max80: "不超过 80 个字符",
    publicEmail: "对外邮箱",
    publicEmailHint: "展示给访客",
    languages: "语言",
    commaSeparated: "用逗号分隔",
    languagesPlaceholder: "中文、英文",
    specialties: "专长",
    specialtiesPlaceholder: "首次购房、投资物业、学区房",
    showPastDeals: "在主页展示 MLS 历史成交",
    about: "关于我",
    aboutHint: "自我介绍会显示在主页显眼位置",
    bioPlaceholder: "用几句话介绍你的专业背景、服务区域，以及能为客户带来什么。不超过 600 字。",
    social: "社交媒体",
    socialHint: "只填完整链接（https://…），留空的不显示。",
    wechatQr: "微信二维码",
    removeQr: "移除二维码",
    removeAfterSave: "将在保存后移除。",
    undo: "撤销",
    qrHint: "上传新二维码会替换现有图片。二维码不裁剪，请上传清晰完整的图。",
    reviews: "客户评价链接",
    reviewsHint: "填写链接后才显示；评分与数量选填。",
    link: "链接",
    rating: "评分",
    reviewCount: "评价数",
    stats: "业绩数据",
    statsHint: "自填并展示在主页，留空不显示。",
    testimonials: "客户证言",
    testimonialsHint: "最多 3 条，留空不显示。",
    testimonialPlaceholder: (n: number) => `证言 ${n}——客户对你的评价`,
    authorPlaceholder: "署名（选填），如 J. Smith",
    unsavedHint: "改动保存后立即同步到对外网站。",
    saving: "保存中…",
    save: "保存并同步",
  },
} as const;

const fieldStyle = {
  border: `1px solid ${tone.line}`,
  background: tone.card,
  color: tone.ink,
} as const;

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium" style={{ color: tone.ink70 }}>
        {label}
        {hint ? <span className="ml-2 font-normal" style={{ color: tone.ink50 }}>{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="h-10 w-full rounded-lg px-3 text-[13.5px] outline-none"
      style={fieldStyle}
    />
  );
}

export function PublicProfileEditor({
  linked,
  unreachable,
  profile,
  targetAgentId,
  isOwn,
  canCreate,
  agentName,
  agentPhone,
  agentLicense,
  adminPublicId,
}: {
  linked: boolean;
  unreachable: boolean;
  profile: PublicProfile | null;
  targetAgentId: number;
  isOwn: boolean;
  canCreate: boolean;
  agentName: string;
  agentPhone: string | null;
  agentLicense: string | null;
  /** When set, the admin console is editing this advisor by PUBLIC agent id
   *  (covers advisors with no portal account); saves go to the admin endpoint. */
  adminPublicId?: string;
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = M[locale];
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [removeQr, setRemoveQr] = useState(false);
  const [visibility, setVisibility] = useState(profile?.visibility_status ?? "visible");

  if (unreachable) {
    return (
      <Card className="p-6">
        <p className="text-[13.5px]" style={{ color: tone.rose }}>
          {t.unreachable}
        </p>
      </Card>
    );
  }

  // Only an administrator may decide that no legacy profile exists and create
  // a new one. This prevents a newly approved login from duplicating an
  // established website profile.
  if (!linked || !profile) {
    async function publish() {
      setBusy(true);
      setMsg(null);
      const res = await fetch("/api/profile/public/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isOwn ? {} : { agentId: targetAgentId }),
      });
      setBusy(false);
      if (!res.ok) {
        setMsg({ ok: false, text: t.publishFailed });
        return;
      }
      router.refresh();
    }
    return (
      <Card className="p-6 space-y-4">
        <CardHeader title={t.unpublishedTitle} />
        <p className="text-[13.5px] leading-relaxed" style={{ color: tone.ink70 }}>
          {canCreate && !isOwn ? t.unpublishedAdmin(agentName) : t.unpublishedOwn}
        </p>
        {canCreate && (
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/agents?view=public" className="text-[12.5px] underline" style={{ color: tone.accent }}>
              {t.checkRoster}
            </Link>
            <Btn variant="primary" onClick={publish} disabled={busy}>
              {busy ? t.creating : t.createProfile}
            </Btn>
            {msg && (
              <span className="text-[12.5px]" style={{ color: msg.ok ? tone.green : tone.rose }}>
                {msg.text}
              </span>
            )}
          </div>
        )}
      </Card>
    );
  }

  const p = profile;
  const publicUrl = `https://www.homixny.com/agents/${p.slug}`;

  async function changeVisibility(next: "visible" | "agent_hidden") {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/profile/public/visibility", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visibilityStatus: next }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      if (body.visibilityStatus === "admin_hidden") setVisibility("admin_hidden");
      setMsg({ ok: false, text: t.visibilityFailed });
      return;
    }
    setVisibility(next);
    setMsg({
      ok: true,
      text: next === "visible" ? t.visibleSaved : t.hiddenSaved,
    });
    router.refresh();
  }

  async function save() {
    const form = formRef.current;
    if (!form) return;
    setBusy(true);
    setMsg(null);
    const fd = new FormData(form);
    if (removeQr) fd.set("remove_wechat_qr", "1");
    // Admin editing by public agent id → the admin endpoint; otherwise the
    // self/portal-admin path keyed by portal agent id.
    const endpoint = adminPublicId ? "/api/admin/roster/edit" : "/api/profile/public";
    if (adminPublicId) fd.set("id", adminPublicId);
    else if (!isOwn) fd.set("agentId", String(targetAgentId));
    const res = await fetch(endpoint, { method: "POST", body: fd });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !body.ok) {
      setMsg({ ok: false, text: t.saveFailed });
      return;
    }
    setMsg({ ok: true, text: t.saved });
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={(e) => e.preventDefault()} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px]" style={{ color: tone.ink50 }}>
          {visibility === "visible"
            ? `✓ ${t.visible}`
            : visibility === "agent_hidden"
              ? `· ${t.agentHidden}`
              : `· ${t.adminHidden}`}{" "}
          ·{" "}
          <a href={publicUrl} target="_blank" rel="noopener noreferrer" style={{ color: tone.accent }}>
            {t.viewProfile} ↗
          </a>
        </p>
        {isOwn && visibility !== "admin_hidden" && (
          <Btn
            variant="outline"
            onClick={() =>
              void changeVisibility(visibility === "visible" ? "agent_hidden" : "visible")
            }
            disabled={busy}
          >
            {visibility === "visible" ? t.hideProfile : t.showProfile}
          </Btn>
        )}
      </div>

      {/* Photo */}
      <Card className="flex flex-col">
        <CardHeader title={t.photo} subtitle={t.photoHint} />
        <div className="p-5">
          <AvatarCropper name="photo" currentSrc={p.photo_url || PLACEHOLDER} alt={p.name || ""} />
        </div>
      </Card>

      {/* Basics */}
      <Card className="flex flex-col">
        <CardHeader title={t.identity} subtitle={t.identityHint} />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <Field label={t.name}>
            <Input value={agentName || p.name || ""} readOnly disabled />
          </Field>
          <Field label={t.phone}>
            <Input value={agentPhone || p.phone || ""} readOnly disabled />
          </Field>
          <Field label={t.license}>
            <Input value={agentLicense || p.license_number || ""} readOnly disabled />
          </Field>
          {isOwn && (
            <div className="sm:col-span-3">
              <Link href="/profile" className="text-[12.5px] underline" style={{ color: tone.accent }}>
                {t.editIdentity}
              </Link>
            </div>
          )}
        </div>
      </Card>

      <Card className="flex flex-col">
        <CardHeader title={t.websiteBasics} />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label={t.title} hint={t.max80}>
            <Input
              name="title"
              defaultValue={p.title || ""}
              maxLength={80}
              placeholder={locale === "zh" ? "持牌房地产经纪人" : "Licensed Real Estate Salesperson"}
            />
          </Field>
          <Field label={t.publicEmail} hint={t.publicEmailHint}>
            <Input name="email" type="email" defaultValue={p.email || ""} placeholder="name@homixny.com" />
          </Field>
          <Field label={t.languages} hint={t.commaSeparated}>
            <Input name="languages" defaultValue={(p.languages || []).join(", ")} placeholder={t.languagesPlaceholder} />
          </Field>
          <Field label={t.specialties} hint={t.commaSeparated}>
            <Input name="specialties" defaultValue={(p.specialties || []).join(", ")} placeholder={t.specialtiesPlaceholder} />
          </Field>
          <label className="flex items-end gap-2 pb-2">
            <input type="checkbox" name="show_past_deals" defaultChecked={p.show_past_deals !== false} className="h-4 w-4" style={{ accentColor: tone.accent }} />
            <span className="text-[13px]" style={{ color: tone.ink70 }}>{t.showPastDeals}</span>
          </label>
        </div>
      </Card>

      {/* About */}
      <Card className="flex flex-col">
        <CardHeader title={t.about} subtitle={t.aboutHint} />
        <div className="p-5">
          <textarea
            name="bio"
            defaultValue={p.bio || ""}
            maxLength={600}
            rows={7}
            placeholder={t.bioPlaceholder}
            className="w-full rounded-lg px-3 py-2.5 text-[13.5px] leading-relaxed outline-none"
            style={fieldStyle}
          />
        </div>
      </Card>

      {/* Social */}
      <Card className="flex flex-col">
        <CardHeader title={t.social} subtitle={t.socialHint} />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {SOCIAL_KEYS.map((k) => (
            <Field key={k} label={SOCIAL_LABEL[k][locale]}>
              <Input name={`social_${k}`} defaultValue={p.social?.[k] || ""} placeholder="https://…" />
            </Field>
          ))}
        </div>
      </Card>

      {/* WeChat QR */}
      <Card className="flex flex-col">
        <CardHeader title={t.wechatQr} />
        <div className="p-5 space-y-3">
          {p.wechat_qr && !removeQr && (
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.wechat_qr}
                alt={locale === "zh" ? "微信二维码" : "WeChat QR code"}
                className="h-24 w-24 rounded-md object-cover"
                style={{ border: `1px solid ${tone.line}` }}
              />
              <button type="button" onClick={() => setRemoveQr(true)} className="text-[12.5px] font-medium" style={{ color: tone.rose }}>
                {t.removeQr}
              </button>
            </div>
          )}
          {removeQr && (
            <p className="text-[12.5px]" style={{ color: tone.ink50 }}>
              {t.removeAfterSave}<button type="button" onClick={() => setRemoveQr(false)} className="ml-2 underline" style={{ color: tone.accent }}>{t.undo}</button>
            </p>
          )}
          <input type="file" name="wechat_qr" accept="image/*" className="block text-[12.5px]" style={{ color: tone.ink70 }} />
          <p className="text-[11.5px]" style={{ color: tone.ink50 }}>{t.qrHint}</p>
        </div>
      </Card>

      {/* Reviews */}
      <Card className="flex flex-col">
        <CardHeader title={t.reviews} subtitle={t.reviewsHint} />
        <div className="space-y-4 p-5">
          {(["zillow", "google"] as const).map((site) => (
            <div key={site} className="grid gap-3 sm:grid-cols-[1fr_120px_120px]">
              <Field label={`${site === "zillow" ? "Zillow" : "Google"} ${t.link}`}>
                <Input name={`review_${site}_url`} defaultValue={p.reviews?.[site]?.url || ""} placeholder="https://…" />
              </Field>
              <Field label={t.rating}>
                <Input name={`review_${site}_rating`} defaultValue={p.reviews?.[site]?.rating || ""} placeholder="4.9" />
              </Field>
              <Field label={t.reviewCount}>
                <Input name={`review_${site}_count`} defaultValue={p.reviews?.[site]?.count || ""} placeholder="32" />
              </Field>
            </div>
          ))}
        </div>
      </Card>

      {/* Stats */}
      <Card className="flex flex-col">
        <CardHeader title={t.stats} subtitle={t.statsHint} />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {STAT_KEYS.map((k) => (
            <Field key={k} label={STAT_LABEL[k][locale]}>
              <Input name={`stat_${k}`} defaultValue={p.stats?.[k] || ""} placeholder={STAT_PH[k]} />
            </Field>
          ))}
        </div>
      </Card>

      {/* Testimonials */}
      <Card className="flex flex-col">
        <CardHeader title={t.testimonials} subtitle={t.testimonialsHint} />
        <div className="space-y-4 p-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <textarea
                name={`testimonial_${i}_quote`}
                defaultValue={p.testimonials?.[i]?.quote || ""}
                rows={2}
                placeholder={t.testimonialPlaceholder(i + 1)}
                className="w-full rounded-lg px-3 py-2 text-[13px] outline-none"
                style={fieldStyle}
              />
              <Input name={`testimonial_${i}_author`} defaultValue={p.testimonials?.[i]?.author || ""} placeholder={t.authorPlaceholder} />
            </div>
          ))}
        </div>
      </Card>

      {/* Save bar */}
      <div
        className="sticky bottom-0 flex items-center justify-between gap-3 rounded-xl px-5 py-3"
        style={{ background: tone.card, border: `1px solid ${tone.line}`, boxShadow: "0 -6px 20px -12px rgba(0,0,0,0.15)" }}
      >
        <span className="text-[12.5px]" style={{ color: msg ? (msg.ok ? tone.green : tone.rose) : tone.ink50 }}>
          {msg ? msg.text : t.unsavedHint}
        </span>
        <Btn variant="primary" onClick={save} disabled={busy}>
          {busy ? t.saving : t.save}
        </Btn>
      </div>
    </form>
  );
}
