import { dbTimeMs } from "@/lib/db-time";

export const EMAIL_CHANGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function requestedTimeMs(value: string | Date): number | null {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  return dbTimeMs(value);
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

export function isValidLoginEmail(value: unknown): boolean {
  const email = normalizeEmail(value);
  if (!email || email.length > 254) return false;

  const at = email.lastIndexOf("@");
  if (
    at <= 0 ||
    at > 64 ||
    at === email.length - 1 ||
    email.indexOf("@") !== at ||
    /\s/.test(email)
  ) {
    return false;
  }

  const domain = email.slice(at + 1);
  return (
    domain.includes(".") &&
    !domain.startsWith(".") &&
    !domain.endsWith(".")
  );
}

export function emailChangeExpiresAt(
  requestedAt: string | Date | null | undefined,
): string | null {
  if (!requestedAt) return null;
  const requestedMs = requestedTimeMs(requestedAt);
  if (requestedMs === null) return null;
  return new Date(requestedMs + EMAIL_CHANGE_TTL_MS).toISOString();
}

export function isEmailChangeRequestActive(
  requestedAt: string | Date | null | undefined,
  now = new Date(),
): boolean {
  if (!requestedAt) return false;
  const requestedMs = requestedTimeMs(requestedAt);
  if (requestedMs === null) return false;
  const elapsed = now.getTime() - requestedMs;
  return elapsed >= 0 && elapsed < EMAIL_CHANGE_TTL_MS;
}
