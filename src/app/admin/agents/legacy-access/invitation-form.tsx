"use client";

import { useActionState } from "react";
import { invitationAction, type InvitationState } from "./actions";

export function InvitationForm({ publicId }: { publicId: string }) {
  const [state, action, pending] = useActionState<InvitationState, FormData>(invitationAction, {});
  return <form action={action} className="space-y-2">
    <input type="hidden" name="publicId" value={publicId} />
    <label className="flex items-start gap-2 text-xs text-stone-600"><input type="checkbox" required name="confirmed" />我知道：取得专属链接的人可用自己的 Google 邮箱接管该主页；只将链接发给本人。撤销后邮箱自动接入也会停用。</label>
    <div className="flex gap-3"><button name="operation" value="issue" disabled={pending} className="rounded border px-3 py-2 text-sm">{pending ? "处理中…" : "生成 / 更新邀请"}</button><button name="operation" value="revoke" disabled={pending} className="rounded border px-3 py-2 text-sm text-red-800">撤销接入</button></div>
    {state.url && <label className="block text-xs">专属认领链接（请复制）<input aria-label="专属认领链接" readOnly value={state.url} className="mt-1 w-full rounded border p-2 font-mono text-xs" /></label>}
    {state.message && <p role="status" className="text-xs text-stone-600">{state.message}</p>}
  </form>;
}
