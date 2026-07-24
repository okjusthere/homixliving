"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Card } from "@/components/homix/primitives";
import { CardHeader } from "@/components/homix/page-kit";
import { tone } from "@/components/homix/tokens";
import { AvatarCropper } from "@/components/homix/avatar-cropper";
import type { PublicProfile } from "@/lib/homixweb";

const PLACEHOLDER = "/agent-placeholder-logo.png";
const SOCIAL_KEYS = ["instagram", "xiaohongshu", "douyin", "youtube", "linkedin", "website"] as const;
const SOCIAL_LABEL: Record<string, string> = {
  instagram: "Instagram",
  xiaohongshu: "小红书",
  douyin: "抖音",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  website: "个人网站",
};
const STAT_KEYS = ["years", "transactions", "volume", "areas"] as const;
const STAT_LABEL: Record<string, string> = {
  years: "从业年数",
  transactions: "成交笔数",
  volume: "成交额",
  areas: "主打区域",
};
const STAT_PH: Record<string, string> = {
  years: "10+",
  transactions: "150+",
  volume: "$80M+",
  areas: "Flushing · Long Island · Manhattan",
};

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
  agentName,
  agentEmail,
  adminPublicId,
}: {
  linked: boolean;
  unreachable: boolean;
  profile: PublicProfile | null;
  targetAgentId: number;
  isOwn: boolean;
  agentName: string;
  agentEmail: string | null;
  /** When set, the admin console is editing this advisor by PUBLIC agent id
   *  (covers advisors with no portal account); saves go to the admin endpoint. */
  adminPublicId?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [removeQr, setRemoveQr] = useState(false);

  if (unreachable) {
    return (
      <Card className="p-6">
        <p className="text-[13.5px]" style={{ color: tone.rose }}>
          暂时无法连接对外网站(www.homixny.com)。稍后重试;若持续,检查 HOMIXWEB_REVALIDATE_URL /
          AGENTS_REVALIDATE_SECRET 是否已配置。
        </p>
      </Card>
    );
  }

  // Not yet published to the public site → offer to publish (creates a hidden profile).
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
        const b = await res.json().catch(() => ({}));
        setMsg({ ok: false, text: b.error || "发布失败,请重试。" });
        return;
      }
      router.refresh();
    }
    return (
      <Card className="p-6 space-y-4">
        <CardHeader title="尚未发布对外主页" />
        <p className="text-[13.5px] leading-relaxed" style={{ color: tone.ink70 }}>
          {isOwn ? "你" : agentName} 目前在对外网站 www.homixny.com 上还没有主页。点击发布会建立一个
          <b>默认隐藏</b>的主页(填好照片和简介后再由管理员设为公开),之后就能在这里直接编辑、自动同步。
        </p>
        <div className="flex items-center gap-3">
          <Btn variant="primary" onClick={publish} disabled={busy}>
            {busy ? "发布中…" : "发布对外主页"}
          </Btn>
          {msg && (
            <span className="text-[12.5px]" style={{ color: msg.ok ? tone.green : tone.rose }}>
              {msg.text}
            </span>
          )}
        </div>
      </Card>
    );
  }

  const p = profile;
  const publicUrl = `https://www.homixny.com/agents/${p.slug}`;

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
      setMsg({ ok: false, text: body.error || "保存失败,请重试。" });
      return;
    }
    setMsg({ ok: true, text: body.notice || "已保存并同步到对外网站。" });
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={(e) => e.preventDefault()} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px]" style={{ color: tone.ink50 }}>
          {p.visible ? "✓ 已在对外网站公开" : "· 当前隐藏(仅管理员可设为公开)"} ·{" "}
          <a href={publicUrl} target="_blank" rel="noopener noreferrer" style={{ color: tone.accent }}>
            查看对外主页 ↗
          </a>
        </p>
      </div>

      {/* Photo */}
      <Card className="flex flex-col">
        <CardHeader title="头像照片" subtitle="干净纯色背景的证件照效果最好" />
        <div className="p-5">
          <AvatarCropper name="photo" currentSrc={p.photo_url || PLACEHOLDER} alt={p.name || ""} />
        </div>
      </Card>

      {/* Basics */}
      <Card className="flex flex-col">
        <CardHeader title="基本信息" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="姓名">
            <Input name="name" defaultValue={p.name || ""} placeholder={agentName} />
          </Field>
          <Field label="职称 Title" hint="≤ 80 字符">
            <Input name="title" defaultValue={p.title || ""} maxLength={80} placeholder="Licensed Real Estate Salesperson" />
          </Field>
          <Field label="电话">
            <Input name="phone" defaultValue={p.phone || ""} placeholder="(917) 555-0101" />
          </Field>
          <Field label="对外邮箱" hint="展示给访客">
            <Input name="email" type="email" defaultValue={p.email || ""} placeholder={agentEmail || "you@homixny.com"} />
          </Field>
          <Field label="执照号" hint="填对可自动关联 MLS 成交记录">
            <Input name="license" defaultValue={p.license_number || ""} />
          </Field>
          <Field label="语言" hint="逗号分隔">
            <Input name="languages" defaultValue={(p.languages || []).join(", ")} placeholder="中文, English" />
          </Field>
          <Field label="专长" hint="逗号分隔">
            <Input name="specialties" defaultValue={(p.specialties || []).join(", ")} placeholder="首次购房, 投资物业, 学区房" />
          </Field>
          <label className="flex items-end gap-2 pb-2">
            <input type="checkbox" name="show_past_deals" defaultChecked={p.show_past_deals !== false} className="h-4 w-4" style={{ accentColor: tone.accent }} />
            <span className="text-[13px]" style={{ color: tone.ink70 }}>在主页展示 MLS 历史成交</span>
          </label>
        </div>
      </Card>

      {/* About */}
      <Card className="flex flex-col">
        <CardHeader title="关于我" subtitle="自我介绍会显示在主页显眼位置" />
        <div className="p-5">
          <textarea
            name="bio"
            defaultValue={p.bio || ""}
            maxLength={600}
            rows={7}
            placeholder="用几句话介绍你的专业背景、服务区域、以及能为客户带来什么。≤ 600 字。"
            className="w-full rounded-lg px-3 py-2.5 text-[13.5px] leading-relaxed outline-none"
            style={fieldStyle}
          />
        </div>
      </Card>

      {/* Social */}
      <Card className="flex flex-col">
        <CardHeader title="社交媒体" subtitle="只填完整链接(https://…),留空的不显示" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {SOCIAL_KEYS.map((k) => (
            <Field key={k} label={SOCIAL_LABEL[k]}>
              <Input name={`social_${k}`} defaultValue={p.social?.[k] || ""} placeholder="https://…" />
            </Field>
          ))}
        </div>
      </Card>

      {/* WeChat QR */}
      <Card className="flex flex-col">
        <CardHeader title="微信二维码" />
        <div className="p-5 space-y-3">
          {p.wechat_qr && !removeQr && (
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.wechat_qr} alt="WeChat QR" className="h-24 w-24 rounded-md object-cover" style={{ border: `1px solid ${tone.line}` }} />
              <button type="button" onClick={() => setRemoveQr(true)} className="text-[12.5px] font-medium" style={{ color: tone.rose }}>
                移除二维码
              </button>
            </div>
          )}
          {removeQr && (
            <p className="text-[12.5px]" style={{ color: tone.ink50 }}>
              将在保存后移除。<button type="button" onClick={() => setRemoveQr(false)} className="ml-2 underline" style={{ color: tone.accent }}>撤销</button>
            </p>
          )}
          <input type="file" name="wechat_qr" accept="image/*" className="block text-[12.5px]" style={{ color: tone.ink70 }} />
          <p className="text-[11.5px]" style={{ color: tone.ink50 }}>上传新二维码会替换现有的。二维码不裁剪,请上传清晰完整的图。</p>
        </div>
      </Card>

      {/* Reviews */}
      <Card className="flex flex-col">
        <CardHeader title="客户评价链接" subtitle="填链接才显示;评分/数量选填" />
        <div className="space-y-4 p-5">
          {(["zillow", "google"] as const).map((site) => (
            <div key={site} className="grid gap-3 sm:grid-cols-[1fr_120px_120px]">
              <Field label={site === "zillow" ? "Zillow 链接" : "Google 链接"}>
                <Input name={`review_${site}_url`} defaultValue={p.reviews?.[site]?.url || ""} placeholder="https://…" />
              </Field>
              <Field label="评分">
                <Input name={`review_${site}_rating`} defaultValue={p.reviews?.[site]?.rating || ""} placeholder="4.9" />
              </Field>
              <Field label="评价数">
                <Input name={`review_${site}_count`} defaultValue={p.reviews?.[site]?.count || ""} placeholder="32" />
              </Field>
            </div>
          ))}
        </div>
      </Card>

      {/* Stats */}
      <Card className="flex flex-col">
        <CardHeader title="业绩数据" subtitle="自填,展示在主页(留空不显示)" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {STAT_KEYS.map((k) => (
            <Field key={k} label={STAT_LABEL[k]}>
              <Input name={`stat_${k}`} defaultValue={p.stats?.[k] || ""} placeholder={STAT_PH[k]} />
            </Field>
          ))}
        </div>
      </Card>

      {/* Testimonials */}
      <Card className="flex flex-col">
        <CardHeader title="客户证言" subtitle="最多 3 条,留空不显示" />
        <div className="space-y-4 p-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <textarea
                name={`testimonial_${i}_quote`}
                defaultValue={p.testimonials?.[i]?.quote || ""}
                rows={2}
                placeholder={`证言 ${i + 1}——客户对你的评价`}
                className="w-full rounded-lg px-3 py-2 text-[13px] outline-none"
                style={fieldStyle}
              />
              <Input name={`testimonial_${i}_author`} defaultValue={p.testimonials?.[i]?.author || ""} placeholder="署名(选填),如 J. Smith" />
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
          {msg ? msg.text : "改动保存后立即同步到对外网站。"}
        </span>
        <Btn variant="primary" onClick={save} disabled={busy}>
          {busy ? "保存中…" : "保存并同步"}
        </Btn>
      </div>
    </form>
  );
}
