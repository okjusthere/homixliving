import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { previewLegacyInvitation } from "@/lib/legacy-agent-claims";
import { LEGACY_CLAIM_COOKIE, LEGACY_CLAIM_COOKIE_MAX_AGE } from "@/lib/legacy-agent-claim-token";
import { ONBOARDING_INVITE_COOKIE } from "@/lib/onboarding-invites";
import { ONBOARDING_ENTRY_COOKIE } from "@/lib/onboarding-entry";

export const dynamic = "force-dynamic";
export const metadata = { title: "启用现有经纪人账号 · Homix", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const profile = await previewLegacyInvitation(token);
  if (!profile) return <main className="mx-auto max-w-lg px-6 py-20"><h1 className="text-2xl">邀请不可用 / Invitation unavailable</h1><p className="mt-4">邀请可能已使用、过期或撤销。请向管理员索取新的专属邀请；已接入的经纪人请使用原登录邮箱。</p><Link className="mt-6 inline-block underline" href="/claim/reset" prefetch={false}>返回登录 / Sign in</Link></main>;
  async function claim() {
    "use server";
    if (!await previewLegacyInvitation(token)) redirect("/login?error=LegacyClaimConflict");
    const jar = await cookies();
    jar.set(LEGACY_CLAIM_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: LEGACY_CLAIM_COOKIE_MAX_AGE });
    jar.delete(ONBOARDING_INVITE_COOKIE);
    jar.delete(ONBOARDING_ENTRY_COOKIE);
    await signIn("google", { redirectTo: "/" }, { prompt: "select_account" });
  }
  return <main className="mx-auto max-w-lg px-6 py-20">
    <p className="text-sm text-stone-600">存量经纪人接入 / Existing agent access</p>
    <h1 className="mt-3 text-3xl">{profile.name}</h1>
    <p className="mt-4">此邀请用于关联您已有的官网主页 /{profile.slug}，不会创建重复主页。</p>
    <p className="mt-3">请选择您本人今后用于登录的 Google 账号。可以与官网联系邮箱不同。完成后，该登录邮箱将有权访问此经纪人的 Portal 账号。</p>
    <p className="mt-3 text-sm text-stone-600">Use your own Google account to claim this existing profile. This does not sign an agreement or initiate a payment.</p>
    <p className="mt-3 text-sm text-stone-600">若这不是您的主页，请勿继续。请勿转发此专属邀请。微信内请先选择“用默认浏览器打开”。</p>
    <form action={claim} className="mt-6"><button className="rounded-lg bg-emerald-950 px-5 py-3 text-white">这是我的主页，使用 Google 继续</button></form>
  </main>;
}
