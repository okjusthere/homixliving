import { homixwebBase } from "@/lib/homixweb";

export function shareCardVersion(updatedAt?: string | null): string {
  const timestamp = updatedAt ? Date.parse(updatedAt) : Number.NaN;
  return Number.isFinite(timestamp)
    ? Math.floor(timestamp).toString(36)
    : "1";
}

export function publicShareUrl(code: string, updatedAt?: string | null): string {
  const params = new URLSearchParams({
    card: "agent-v3",
    v: shareCardVersion(updatedAt),
  });
  return `${homixwebBase()}/s/${encodeURIComponent(code)}?${params.toString()}`;
}
