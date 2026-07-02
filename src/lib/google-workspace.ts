import crypto from "crypto";
import { google } from "googleapis";
import { Resend } from "resend";
import { and, eq, lte, ne } from "drizzle-orm";
import { db } from "@/db";
import { commerceOrders, type CommerceOrder } from "@/db/schema";

const DIRECTORY_SCOPE = "https://www.googleapis.com/auth/admin.directory.user";
const DEFAULT_WORKSPACE_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

type ServiceAccountWorkspaceConfig = {
  mode: "service_account";
  adminEmail: string;
  clientEmail: string;
  privateKey: string;
};

type OAuthWorkspaceConfig = {
  mode: "oauth";
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

type WorkspaceConfig = ServiceAccountWorkspaceConfig | OAuthWorkspaceConfig;

export function resolveWorkspaceRetentionDays(value: string | null | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_WORKSPACE_RETENTION_DAYS;
  return Math.floor(parsed);
}

export function getWorkspaceRetentionDays(): number {
  return resolveWorkspaceRetentionDays(process.env.GOOGLE_WORKSPACE_RETENTION_DAYS);
}

export function getWorkspaceDeleteAfter(now = new Date()): Date {
  return new Date(now.getTime() + getWorkspaceRetentionDays() * DAY_MS);
}

export function getWorkspaceDeletionCutoff(now = new Date()): Date {
  return new Date(now.getTime() - getWorkspaceRetentionDays() * DAY_MS);
}

export function getWorkspaceAllowedDomains(): string[] {
  const configured =
    process.env.GOOGLE_WORKSPACE_ALLOWED_DOMAINS ||
    process.env.GOOGLE_WORKSPACE_DOMAIN ||
    "homixny.com";

  return configured
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}

function getWorkspaceConfig() {
  const adminEmail = process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL?.trim();
  const clientEmail =
    process.env.GOOGLE_WORKSPACE_CLIENT_EMAIL?.trim() ||
    process.env.GOOGLE_CLIENT_EMAIL?.trim();
  const privateKey = (
    process.env.GOOGLE_WORKSPACE_PRIVATE_KEY ||
    process.env.GOOGLE_PRIVATE_KEY ||
    ""
  )
    .replace(/\\n/g, "\n")
    .trim();

  const oauthClientId = process.env.GOOGLE_WORKSPACE_OAUTH_CLIENT_ID?.trim();
  const oauthClientSecret = process.env.GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET?.trim();
  const oauthRefreshToken = process.env.GOOGLE_WORKSPACE_OAUTH_REFRESH_TOKEN?.trim();
  const preferredMode = process.env.GOOGLE_WORKSPACE_AUTH_MODE?.trim().toLowerCase();

  if (
    preferredMode !== "service_account" &&
    oauthClientId &&
    oauthClientSecret &&
    oauthRefreshToken
  ) {
    return {
      mode: "oauth",
      clientId: oauthClientId,
      clientSecret: oauthClientSecret,
      refreshToken: oauthRefreshToken,
    } satisfies OAuthWorkspaceConfig;
  }

  if (adminEmail && clientEmail && privateKey) {
    return {
      mode: "service_account",
      adminEmail,
      clientEmail,
      privateKey,
    } satisfies ServiceAccountWorkspaceConfig;
  }

  return null;
}

function getWorkspaceConfigError(): string {
  return [
    "Google Workspace auth is not configured.",
    "Set OAuth env vars GOOGLE_WORKSPACE_OAUTH_CLIENT_ID, GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET, and GOOGLE_WORKSPACE_OAUTH_REFRESH_TOKEN.",
    "Alternatively set service account env vars GOOGLE_WORKSPACE_ADMIN_EMAIL, GOOGLE_WORKSPACE_CLIENT_EMAIL, and GOOGLE_WORKSPACE_PRIVATE_KEY.",
  ].join(" ");
}

function createWorkspaceAuth(config: WorkspaceConfig) {
  if (config.mode === "oauth") {
    const auth = new google.auth.OAuth2(config.clientId, config.clientSecret);
    auth.setCredentials({ refresh_token: config.refreshToken });
    return auth;
  }

  return new google.auth.JWT({
    email: config.clientEmail,
    key: config.privateKey,
    scopes: [DIRECTORY_SCOPE],
    subject: config.adminEmail,
  });
}

function createWorkspaceAdmin(config: WorkspaceConfig) {
  return google.admin({ version: "directory_v1", auth: createWorkspaceAuth(config) });
}

function splitFullName(fullName: string): { givenName: string; familyName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { givenName: parts[0] || "Homix", familyName: "Agent" };
  }

  return {
    givenName: parts.slice(0, -1).join(" "),
    familyName: parts[parts.length - 1]!,
  };
}

function generateTemporaryPassword(): string {
  return `${crypto.randomBytes(18).toString("base64url")}Aa1!`;
}

export function normalizeWorkspaceRecoveryPhone(phone: string | null | undefined): string | undefined {
  const trimmed = phone?.trim();
  if (!trimmed) return undefined;

  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+") && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return undefined;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function errorStatus(error: unknown): number | null {
  if (typeof error !== "object" || !error) return null;
  const direct = (error as { code?: unknown; status?: unknown }).code ?? (error as { status?: unknown }).status;
  if (typeof direct === "number") return direct;
  const responseStatus = (error as { response?: { status?: unknown } }).response?.status;
  return typeof responseStatus === "number" ? responseStatus : null;
}

async function updateWorkspaceStatus(
  orderId: number,
  status: string,
  fields: Partial<Pick<CommerceOrder, "workspaceUserId" | "workspaceError">> = {}
) {
  await db
    .update(commerceOrders)
    .set({
      workspaceStatus: status,
      workspaceUserId: fields.workspaceUserId ?? undefined,
      workspaceError: fields.workspaceError ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(commerceOrders.id, orderId));
}

async function updateWorkspaceError(orderId: number, workspaceError: string) {
  await db
    .update(commerceOrders)
    .set({
      workspaceError,
    })
    .where(eq(commerceOrders.id, orderId));
}

async function sendWorkspaceWelcomeEmail(order: CommerceOrder, temporaryPassword: string) {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    throw new Error("RESEND_API_KEY is not configured; Google user was created but welcome email was not sent.");
  }

  const to = order.customerEmail?.trim();
  if (!to) {
    throw new Error("Customer email missing; Google user was created but welcome email was not sent.");
  }

  const from =
    process.env.WORKSPACE_ONBOARDING_FROM_EMAIL ||
    process.env.FROM_EMAIL ||
    "invoice@homixny.com";
  const loginUrl = process.env.GOOGLE_WORKSPACE_LOGIN_URL || "https://accounts.google.com/";
  const primaryEmail = order.requestedWorkspaceEmail || "";

  const resend = new Resend(key);
  const { error } = await resend.emails.send({
    from,
    to,
    subject: "Your Homix company email is ready",
    text: [
      `Your Homix company email is ready: ${primaryEmail}`,
      "",
      `Temporary password: ${temporaryPassword}`,
      "",
      `Sign in at ${loginUrl} and change the password immediately.`,
      "If you did not request this email account, contact Homix Realty.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1A1814">
        <p>Your Homix company email is ready:</p>
        <p><strong>${escapeHtml(primaryEmail)}</strong></p>
        <p>Temporary password:</p>
        <p style="font-family:monospace;font-size:16px;background:#F4F0E8;padding:12px;border-radius:6px">${escapeHtml(
          temporaryPassword
        )}</p>
        <p>Sign in at <a href="${escapeHtml(loginUrl)}">${escapeHtml(
          loginUrl
        )}</a> and change the password immediately.</p>
        <p>If you did not request this email account, contact Homix Realty.</p>
      </div>
    `,
  });

  if (error) {
    throw new Error(error.message);
  }
}

function getWorkspaceWelcomeConfigError(order: CommerceOrder): string | null {
  if (!process.env.RESEND_API_KEY?.trim()) {
    return "RESEND_API_KEY is not configured; Google user was not created.";
  }

  if (!order.customerEmail?.trim()) {
    return "Customer email missing; Google user was not created.";
  }

  return null;
}

export async function provisionWorkspaceForOrder(order: CommerceOrder) {
  if (order.workspaceStatus === "provisioned") return;

  const primaryEmail = order.requestedWorkspaceEmail?.trim().toLowerCase();
  if (!primaryEmail) {
    await updateWorkspaceStatus(order.id, "failed", {
      workspaceError: "Requested workspace email is missing.",
    });
    return;
  }

  const domain = primaryEmail.split("@")[1]?.toLowerCase();
  if (!domain || !getWorkspaceAllowedDomains().includes(domain)) {
    await updateWorkspaceStatus(order.id, "failed", {
      workspaceError: "Requested workspace email is outside the allowed company domains.",
    });
    return;
  }

  const config = getWorkspaceConfig();
  if (!config) {
    await updateWorkspaceStatus(order.id, "pending_config", {
      workspaceError: getWorkspaceConfigError(),
    });
    return;
  }

  const welcomeConfigError = getWorkspaceWelcomeConfigError(order);
  if (welcomeConfigError) {
    await updateWorkspaceStatus(order.id, "pending_config", {
      workspaceError: welcomeConfigError,
    });
    return;
  }

  const temporaryPassword = generateTemporaryPassword();
  const name = splitFullName(order.customerName || primaryEmail.split("@")[0]!);
  const admin = createWorkspaceAdmin(config);
  const recoveryPhone = normalizeWorkspaceRecoveryPhone(order.phone);

  try {
    const created = await admin.users.insert({
      requestBody: {
        primaryEmail,
        name,
        password: temporaryPassword,
        changePasswordAtNextLogin: true,
        recoveryEmail: order.customerEmail || undefined,
        recoveryPhone,
      },
    });

    await sendWorkspaceWelcomeEmail(order, temporaryPassword);

    await updateWorkspaceStatus(order.id, "provisioned", {
      workspaceUserId: created.data.id || primaryEmail,
    });
  } catch (error) {
    if (errorStatus(error) === 409) {
      // A Google Workspace user with this email already exists.
      //
      // SECURITY: only "adopt" it when THIS order created it on a prior attempt
      // (workspaceUserId already recorded). Otherwise the address belongs to
      // someone else — silently un-suspending it and marking the order
      // "provisioned" let any buyer check out a colleague's company email, take
      // ownership, then cancel the subscription to get that colleague's mailbox
      // suspended and (via the retention cron) permanently deleted. Never mutate
      // an account we did not create; flag it for manual admin review instead.
      if (!order.workspaceUserId) {
        await updateWorkspaceStatus(order.id, "needs_review", {
          workspaceError:
            "A Google Workspace user with this email already exists and was not created by this order. Manual review required before provisioning.",
        });
        return;
      }
      try {
        await admin.users.update({
          userKey: primaryEmail,
          requestBody: {
            suspended: false,
          },
        });

        await updateWorkspaceStatus(order.id, "provisioned", {
          workspaceUserId: order.workspaceUserId,
          workspaceError: "Existing Google Workspace user (created by this order) was reactivated.",
        });
      } catch (reactivationError) {
        await updateWorkspaceStatus(order.id, "failed", {
          workspaceError: errorMessage(reactivationError).slice(0, 1000),
        });
      }
      return;
    }

    await updateWorkspaceStatus(order.id, "failed", {
      workspaceError: errorMessage(error).slice(0, 1000),
    });
  }
}

export async function suspendWorkspaceForOrder(order: CommerceOrder) {
  const primaryEmail = order.requestedWorkspaceEmail?.trim().toLowerCase();
  if (!primaryEmail || order.workspaceStatus === "not_required" || order.workspaceStatus === "deleted") return;

  // SECURITY: never suspend an account this order did not create. workspaceUserId
  // is recorded only after a successful users.insert, so its absence means the
  // mailbox belongs to a third party (buy-a-colleague's-email attack) — leave it.
  if (!order.workspaceUserId) return;

  const domain = primaryEmail.split("@")[1]?.toLowerCase();
  if (!domain || !getWorkspaceAllowedDomains().includes(domain)) {
    await updateWorkspaceStatus(order.id, "failed", {
      workspaceError: "Requested workspace email is outside the allowed company domains.",
    });
    return;
  }

  const config = getWorkspaceConfig();
  if (!config) {
    await updateWorkspaceStatus(order.id, "pending_config", {
      workspaceError: getWorkspaceConfigError(),
    });
    return;
  }

  const admin = createWorkspaceAdmin(config);

  try {
    await admin.users.update({
      userKey: primaryEmail,
      requestBody: {
        suspended: true,
      },
    });

    await updateWorkspaceStatus(order.id, "suspended", {
      workspaceError: `Google Workspace user suspended after subscription cancellation. Scheduled for deletion after ${getWorkspaceDeleteAfter().toISOString()}.`,
    });
  } catch (error) {
    if (errorStatus(error) === 404) {
      await updateWorkspaceStatus(order.id, "deleted", {
        workspaceError: "Google Workspace user was already missing.",
      });
      return;
    }

    await updateWorkspaceStatus(order.id, "failed", {
      workspaceError: errorMessage(error).slice(0, 1000),
    });
  }
}

export async function deleteWorkspaceUserForOrder(order: CommerceOrder): Promise<boolean> {
  const primaryEmail = order.requestedWorkspaceEmail?.trim().toLowerCase();
  if (!primaryEmail || order.workspaceStatus === "not_required" || order.workspaceStatus === "deleted") {
    return false;
  }

  // SECURITY: only delete accounts this order created (workspaceUserId recorded
  // by a real users.insert). Without it we'd be permanently deleting a third
  // party's mailbox.
  if (!order.workspaceUserId) {
    await updateWorkspaceError(
      order.id,
      "Workspace deletion skipped: this order never created a Google account (no workspaceUserId)."
    );
    return false;
  }

  // Never delete an email that a *different* order has since re-provisioned:
  // customer cancels (this order → suspended), then re-subscribes (new order →
  // provisioned) reusing the same address. Deleting here would wipe a live,
  // paying mailbox. Release this order's claim without touching Google.
  const activeElsewhere = await db
    .select({ id: commerceOrders.id })
    .from(commerceOrders)
    .where(
      and(
        eq(commerceOrders.requestedWorkspaceEmail, order.requestedWorkspaceEmail!),
        eq(commerceOrders.workspaceStatus, "provisioned"),
        ne(commerceOrders.id, order.id)
      )
    )
    .limit(1);
  if (activeElsewhere.length > 0) {
    await updateWorkspaceStatus(order.id, "deleted", {
      workspaceError: "Deletion skipped: another active order still provisions this workspace email.",
    });
    return false;
  }

  const domain = primaryEmail.split("@")[1]?.toLowerCase();
  if (!domain || !getWorkspaceAllowedDomains().includes(domain)) {
    await updateWorkspaceError(order.id, "Workspace deletion skipped because the requested email is outside the allowed company domains.");
    return false;
  }

  const config = getWorkspaceConfig();
  if (!config) {
    await updateWorkspaceError(order.id, getWorkspaceConfigError());
    return false;
  }

  const admin = createWorkspaceAdmin(config);

  try {
    await admin.users.delete({
      userKey: primaryEmail,
    });

    await updateWorkspaceStatus(order.id, "deleted");
    return true;
  } catch (error) {
    if (errorStatus(error) === 404) {
      await updateWorkspaceStatus(order.id, "deleted", {
        workspaceError: "Google Workspace user was already missing.",
      });
      return true;
    }

    const message = errorMessage(error).slice(0, 1000);
    await updateWorkspaceError(order.id, `Workspace deletion failed: ${message}`);
    throw error;
  }
}

export async function cleanupExpiredSuspendedWorkspaceUsers(now = new Date()) {
  const cutoffIso = getWorkspaceDeletionCutoff(now).toISOString();
  const orders = await db
    .select()
    .from(commerceOrders)
    .where(
      and(
        eq(commerceOrders.productKey, "company_domain_email"),
        eq(commerceOrders.workspaceStatus, "suspended"),
        lte(commerceOrders.updatedAt, cutoffIso)
      )
    )
    .limit(50);

  const failures: Array<{ orderId: number; email: string | null; error: string }> = [];
  let deleted = 0;
  let skipped = 0;

  for (const order of orders) {
    try {
      const wasDeleted = await deleteWorkspaceUserForOrder(order);
      if (wasDeleted) {
        deleted += 1;
      } else {
        skipped += 1;
      }
    } catch (error) {
      failures.push({
        orderId: order.id,
        email: order.requestedWorkspaceEmail,
        error: errorMessage(error).slice(0, 500),
      });
    }
  }

  return {
    retentionDays: getWorkspaceRetentionDays(),
    cutoffIso,
    scanned: orders.length,
    deleted,
    skipped,
    failed: failures.length,
    failures,
  };
}
