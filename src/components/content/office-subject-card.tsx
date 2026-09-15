"use client";
/* eslint-disable @next/next/no-img-element -- Agent portrait supplied by authenticated settings. */
import { useEffect, useState } from "react";
import { contentFetch } from "./ui";
import type { BrandContext } from "@/lib/content/types";
export function OfficeSubjectCard({ agent, zh, disabled, onChange, onError }: { agent: {id: number; name: string; email: string; phone?: string}; zh: boolean; disabled: boolean; onChange: () => void; onError: (message: string) => void }) {
  const [brand, setBrand] = useState<BrandContext>();
  useEffect(() => {
    const controller = new AbortController();
    contentFetch<{brand: BrandContext}>(`/api/content/settings?subject=${agent.id}`, {signal: controller.signal}).then((r) => setBrand(r.brand)).catch((e) => { if (!controller.signal.aborted) onError(e.message); });
    return () => controller.abort();
  }, [agent.id, onError]);
  const current = brand?.agentId === agent.id ? brand : undefined;
  return <div className="office-subject-card">{current?.photoUrl ? <img src={current.photoUrl} alt={agent.name} /> : <span className="office-avatar-placeholder" aria-hidden="true">{agent.name.slice(0,1)}</span>}<div><strong>{agent.name}</strong><p>{current?.email || agent.email} · {current?.phone || agent.phone || ""}</p><small>{current?.companyName || (zh ? "正在加载公司资料…" : "Loading company…")}</small></div><button className="studio-button secondary" disabled={disabled} onClick={onChange}>{zh ? "更换经纪人" : "Change Agent"}</button></div>;
}
