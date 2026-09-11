import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { loadBrand } from "@/lib/content/brand";
import { ContentError } from "@/lib/content/store";
import type { ContentActor } from "@/lib/content/api";

export async function emailMarketingRequest(
  actor: ContentActor,
  path: string,
  method = "GET",
  body?: unknown,
  requestKey?: string,
) {
  const configured = process.env.EMAIL_SERVICE_URL?.trim(),
    secret = process.env.EMAIL_SERVICE_HOMIX_SECRET?.trim();
  if (!configured || !secret || secret.length < 32)
    throw new ContentError(
      "Email Service integration is not configured / 邮件服务尚未接通",
      503,
      "EMAIL_SERVICE_UNAVAILABLE",
    );
  const url = new URL(`/api/integrations/homix/v1/${path}`, configured);
  if (
    url.protocol !== "https:" &&
    !(
      process.env.NODE_ENV !== "production" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw new ContentError("Invalid Email Service endpoint", 503);
  const encoded = body === undefined ? "" : JSON.stringify(body);
  const now = Math.floor(Date.now() / 1000);
  const brand = await loadBrand(actor.agentId);
  const payload = {
    iss: "homixliving",
    aud: "email-service",
    sub: String(actor.agentId),
    iat: now,
    exp: now + 90,
    jti: randomUUID(),
    admin: actor.admin,
    email: actor.email,
    brand,
    method,
    path: url.pathname + url.search,
    bodyHash: createHash("sha256").update(encoded).digest("hex"),
  };
  const header = Buffer.from(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
    ).toString("base64url"),
    claims = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signed = `${header}.${claims}`,
    token = `${signed}.${createHmac("sha256", secret).update(signed).digest("base64url")}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(requestKey ? { "Idempotency-Key": requestKey } : {}),
      },
      ...(encoded ? { body: encoded } : {}),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(method === "GET" ? 20000 : 120000),
    });
  } catch {
    throw new ContentError(
      "Email Service did not respond. Check the campaign before retrying / 邮件服务未响应，请先检查原任务状态",
      502,
      "EMAIL_SERVICE_TIMEOUT",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new ContentError(
      data?.error?.message || "Email Service request failed",
      response.status,
      data?.error?.code || "EMAIL_SERVICE_ERROR",
    );
  if (!data) throw new ContentError("Invalid Email Service response", 502);
  return data;
}
