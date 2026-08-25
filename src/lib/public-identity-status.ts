export type MlsVerificationStatus =
  | "not_provided"
  | "verified"
  | "unavailable"
  | "unmatched"
  | "ambiguous"
  | "claimed"
  | "unlinked"
  | "failed";

export type PublicIdentitySyncResult = {
  status: MlsVerificationStatus;
  notice?: string;
};

type WebsiteResult = {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
};

const websiteStatuses = new Set<MlsVerificationStatus>([
  "not_provided",
  "verified",
  "unavailable",
  "unmatched",
  "ambiguous",
  "claimed",
]);

export function interpretPublicIdentityResult(
  result: WebsiteResult,
): PublicIdentitySyncResult {
  const rawStatus = String(result.body.verificationStatus || "");
  const notice = typeof result.body.notice === "string" ? result.body.notice : undefined;
  if (result.ok && websiteStatuses.has(rawStatus as MlsVerificationStatus)) {
    return { status: rawStatus as MlsVerificationStatus, notice };
  }
  if (result.status === 404) {
    return { status: "unlinked", notice: "The Portal account has no linked website profile." };
  }
  if (!result.ok) {
    return {
      status: "failed",
      notice: typeof result.body.error === "string" ? result.body.error : undefined,
    };
  }
  return { status: "not_provided", notice };
}
