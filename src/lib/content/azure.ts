import type { ImageSize } from "./types";
import sharp from "sharp";

export type AzureImageSnapshot = {
  base: string;
  deployment: string;
  apiVersion?: string;
};

export class AzureImageError extends Error {
  constructor(
    public code: string,
    public uncertain: boolean,
    public retryAfter = 0,
    public requestId: string | null = null,
  ) {
    super(code);
  }
}
export function azureImageConfig() {
  const configured = process.env.AZURE_IMAGE_ENDPOINT?.trim();
  const key = process.env.AZURE_IMAGE_API_KEY?.trim();
  const deployment =
    process.env.AZURE_IMAGE_DEPLOYMENT?.trim() || "gpt-image-2";
  if (!configured || !key)
    throw new AzureImageError("AZURE_NOT_CONFIGURED", false);
  const url = new URL(
    configured
      .replace(/\/images\/(generations|edits)\/?$/, "")
      .replace(/\/$/, ""),
  );
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/openai\/v1$/.test(url.pathname) ||
    !/\.(services\.ai\.azure\.com|openai\.azure\.com)$/.test(url.hostname)
  )
    throw new AzureImageError("AZURE_ENDPOINT_INVALID", false);
  return {
    base: url.toString().replace(/\/$/, ""),
    key,
    deployment,
    apiVersion: process.env.AZURE_IMAGE_API_VERSION?.trim() || undefined,
  };
}
export function azureImageSnapshot(): AzureImageSnapshot {
  const { base, deployment, apiVersion } = azureImageConfig();
  return { base, deployment, apiVersion };
}
export async function generateAzureImage(
  prompt: string,
  size: ImageSize,
  references: Buffer[],
  snapshot?: AzureImageSnapshot,
) {
  const current = azureImageConfig(),
    { key } = current;
  if (snapshot && snapshot.base !== current.base)
    throw new AzureImageError("AZURE_CONFIGURATION_CHANGED", false);
  const { base, deployment, apiVersion } = snapshot || current;
  const endpoint = `${base}/images/${references.length ? "edits" : "generations"}`;
  const url = new URL(endpoint);
  if (apiVersion) url.searchParams.set("api-version", apiVersion);
  let body: BodyInit;
  const headers: Record<string, string> = { "api-key": key };
  if (references.length) {
    const form = new FormData();
    form.set("model", deployment);
    form.set("prompt", prompt);
    form.set("n", "1");
    form.set("size", size);
    form.set("quality", "high");
    form.set("output_format", "png");
    references.forEach((image, i) =>
      form.append(
        "image[]",
        new Blob([new Uint8Array(image)], { type: "image/png" }),
        `reference-${i + 1}.png`,
      ),
    );
    body = form;
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({
      model: deployment,
      prompt,
      n: 1,
      size,
      quality: "high",
      output_format: "png",
    });
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(240000),
      redirect: "error",
    });
  } catch {
    throw new AzureImageError("AZURE_OUTCOME_UNKNOWN", true);
  }
  const requestId =
    response.headers.get("x-request-id") ||
    response.headers.get("apim-request-id");
  if (response.status === 429)
    throw new AzureImageError(
      "AZURE_RATE_LIMITED",
      false,
      Math.min(
        300,
        Math.max(30, Number(response.headers.get("retry-after")) || 60),
      ),
    );
  if (!response.ok) {
    // Keep provider diagnostics useful without logging prompts, portraits or keys.
    let providerCode: string | undefined;
    let parameter: string | undefined;
    try {
      const payload = await response.json();
      const safeIdentifier = (value: unknown) =>
        typeof value === "string" && /^[a-zA-Z0-9_.\[\]-]{1,100}$/.test(value)
          ? value
          : undefined;
      providerCode = safeIdentifier(payload?.error?.code);
      parameter = safeIdentifier(payload?.error?.param);
    } catch {
      // An unparseable error still retains HTTP status and request ID.
    }
    console.warn("Azure image request rejected", {
      status: response.status,
      requestId,
      providerCode,
      parameter,
    });
    throw new AzureImageError(
      response.status >= 500
        ? "AZURE_OUTCOME_UNKNOWN"
        : response.status === 401 || response.status === 403
          ? "AZURE_ACCESS_DENIED"
          : "AZURE_REQUEST_REJECTED",
      response.status >= 500,
      0,
      requestId,
    );
  }
  let result: {
    data?: { b64_json?: string }[];
    usage?: Record<string, unknown>;
  };
  try {
    result = await response.json();
  } catch {
    throw new AzureImageError("AZURE_RESULT_INVALID", true);
  }
  const encoded = result.data?.[0]?.b64_json;
  if (!encoded || encoded.length > 60 * 1024 * 1024)
    throw new AzureImageError("AZURE_RESULT_INVALID", true);
  const bytes = Buffer.from(encoded, "base64");
  try {
    const metadata = await sharp(bytes, {
      limitInputPixels: 8_000_000,
    }).metadata();
    if (
      metadata.format !== "png" ||
      `${metadata.width}x${metadata.height}` !== size
    )
      throw new Error();
  } catch {
    throw new AzureImageError("AZURE_RESULT_INVALID", true);
  }
  return { bytes, usage: result.usage || null, requestId, deployment };
}
