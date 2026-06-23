/**
 * Cloudflare Stream embed helpers.
 *
 * NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE should be just the customer code
 * (e.g. "rq45yjtsy4m2ui1y"). We're forgiving: if a full embed URL is pasted
 * (e.g. "https://customer-<code>.cloudflarestream.com/"), we extract the code,
 * so a common copy-paste mistake still works.
 */
function normalizeCustomerCode(raw: string): string {
  const v = (raw || "").trim();
  const m = v.match(/customer-([a-z0-9]+)\.cloudflarestream\.com/i);
  if (m) return m[1];
  return v
    .replace(/^https?:\/\//i, "")
    .replace(/^customer-/i, "")
    .replace(/\.cloudflarestream\.com.*/i, "")
    .replace(/\/.*$/, "");
}

export const cloudflareCustomerCode = normalizeCustomerCode(
  process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE || "",
);
export const cloudflareStreamConfigured = cloudflareCustomerCode.length > 0;

export function streamIframeUrl(uid: string, code: string = cloudflareCustomerCode): string {
  const u = (uid || "").trim();
  if (!u || !code) return "";
  const params = new URLSearchParams({
    preload: "metadata",
    primaryColor: "#5C6B3A",
    autoplay: "true",
  });
  return `https://customer-${code}.cloudflarestream.com/${u}/iframe?${params}`;
}

export function streamThumbnailUrl(uid: string, code: string = cloudflareCustomerCode): string {
  const u = (uid || "").trim();
  if (!u || !code) return "";
  return `https://customer-${code}.cloudflarestream.com/${u}/thumbnails/thumbnail.jpg?time=2s&height=360`;
}
