"use server";

import { requireAdmin } from "@/lib/auth-guards";
import { LegacyClaimError, manageLegacyInvitation } from "@/lib/legacy-agent-claims";
import { revalidatePath } from "next/cache";

export type InvitationState = { url?: string; message?: string };
export async function invitationAction(_previous: InvitationState, form: FormData): Promise<InvitationState> {
  const session = await requireAdmin();
  const publicId = String(form.get("publicId") || "");
  const operation = form.get("operation");
  if (!publicId || publicId.length > 200 || form.get("confirmed") !== "on" || !["issue", "revoke"].includes(String(operation))) return { message: "请求无效 / Invalid request" };
  try {
    const token = await manageLegacyInvitation({ publicId, actorId: session.user.agentId!, revoke: operation === "revoke" });
    revalidatePath("/admin/agents/legacy-access");
    return token ? {
      url: `${(process.env.AUTH_URL || "https://agents.homixny.com").replace(/\/$/, "")}/claim/${token}`,
      message: "仅显示本次生成的链接。7 天内有效，首次认领后失效；重新生成会使旧链接失效。请私下发送给本人。",
    } : { message: "已撤销：此档案的邮箱自动认领和邀请接入均已停用。" };
  } catch (error) {
    if (!(error instanceof LegacyClaimError)) console.error("Legacy invitation management failed");
    return { message: "操作未完成。档案可能已经关联、邀请已撤销或权限发生变化，请刷新核对。" };
  }
}
