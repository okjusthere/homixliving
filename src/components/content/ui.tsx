"use client";
import type { ReactNode } from "react";
import type { ContentTemplate } from "@/lib/content/types";

export async function contentFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body && !(init.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...init?.headers,
      },
    });
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new Error(
      "Connection failed. Check your network and try again / 网络连接失败，请检查网络后重试",
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      response.status === 413
        ? "File is too large. Choose a smaller image / 图片过大，请选择更小的图片"
        : "The service returned an unexpected response. Please try again / 服务返回异常，请稍后重试",
    );
  }
  if (!response.ok)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : data.error?.message || "Request failed",
    );
  return data;
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="studio-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function TemplateArt({
  template,
  title,
}: {
  template: ContentTemplate;
  title?: string;
}) {
  const [paper, ink, accent] = template.config.colors;
  return (
    <div
      className={`studio-art studio-art-${template.config.style}`}
      style={{ background: paper, color: ink }}
      aria-hidden="true"
    >
      <span className="studio-art-brand">HOMIX / COLLECTION</span>
      <div className="studio-art-shape" style={{ background: accent }}>
        <span style={{ borderColor: paper }} />
      </div>
      <strong>{title || template.config.name.en.split(" · ")[0]}</strong>
      <div className="studio-art-rule" style={{ background: accent }} />
      <span className="studio-art-signature">YOUR STORY. YOUR SIGNATURE.</span>
    </div>
  );
}
