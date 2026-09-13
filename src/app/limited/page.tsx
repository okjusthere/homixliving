import Link from "next/link";
import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth-guards";
import { getLocale } from "@/lib/i18n";

export default async function LimitedWorkspace() {
  const session = await currentSession();
  if (!session) redirect("/login");
  if (session.user.accountStatus === "active") redirect("/");
  const allowed = session.user.limitedCapabilities || [];
  if (!allowed.length) redirect("/pending");
  const zh = (await getLocale()) === "zh";
  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <h1 className="font-serif text-3xl">
        {zh ? "你的工作台" : "Your workspace"}
      </h1>
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        {zh
          ? "管理员已临时开放以下功能。入职合同和费用仍按实际状态显示，请按期完成待办。"
          : "An administrator has temporarily enabled these capabilities. Your contract and payment requirements remain outstanding."}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {(
          [
            [
              "profile",
              "/pending",
              zh ? "完善资料与入职待办" : "Profile & onboarding",
            ],
            ["training", "/training", zh ? "培训学习" : "Training"],
            ["resources", "/resources", zh ? "公司资料库" : "Resources"],
          ] as const
        )
          .filter(([cap]) => allowed.includes(cap))
          .map(([cap, href, title]) => (
            <Link
              className="rounded-xl border bg-white p-6 font-medium hover:border-stone-500"
              key={cap}
              href={href}
            >
              {title} →
            </Link>
          ))}
      </div>
      <Link className="underline" href="/pending">
        {zh ? "查看入职进度" : "View onboarding progress"}
      </Link>
    </div>
  );
}
