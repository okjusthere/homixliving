/**
 * Cloudflare Stream embed helper. The customer code is public (it ships in the
 * iframe src), so it lives in NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE. When
 * unset, streamIframeUrl returns "" and the player shows a "Connecting" tile.
 */
const customerCode =
  process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE?.trim() || "";

export const cloudflareStreamConfigured = customerCode.length > 0;

export function streamIframeUrl(uid: string): string {
  const u = (uid || "").trim();
  if (!u || !customerCode) return "";
  const params = new URLSearchParams({
    preload: "metadata",
    primaryColor: "#5C6B3A",
  });
  return `https://customer-${customerCode}.cloudflarestream.com/${u}/iframe?${params}`;
}
