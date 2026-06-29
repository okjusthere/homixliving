import crypto from "crypto";
import { google } from "googleapis";
import { Resend } from "resend";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { commerceOrders, type CommerceOrder } from "@/db/schema";

const DIRECTORY_SCOPE = "https://www.googleapis.com/auth/admin.directory.user";

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
  const auth = createWorkspaceAuth(config);
  const admin = google.admin({ version: "directory_v1", auth });
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
      await updateWorkspaceStatus(order.id, "provisioned", {
        workspaceError: "Google Workspace user already existed.",
      });
      return;
    }

    await updateWorkspaceStatus(order.id, "failed", {
      workspaceError: errorMessage(error).slice(0, 1000),
    });
  }
}

export async function suspendWorkspaceForOrder(order: CommerceOrder) {
  const primaryEmail = order.requestedWorkspaceEmail?.trim().toLowerCase();
  if (!primaryEmail || order.workspaceStatus === "not_required") return;

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

  const auth = createWorkspaceAuth(config);
  const admin = google.admin({ version: "directory_v1", auth });

  try {
    await admin.users.update({
      userKey: primaryEmail,
      requestBody: {
        suspended: true,
      },
    });

    await updateWorkspaceStatus(order.id, "suspended");
  } catch (error) {
    if (errorStatus(error) === 404) {
      await updateWorkspaceStatus(order.id, "suspended", {
        workspaceError: "Google Workspace user was already missing.",
      });
      return;
    }

    await updateWorkspaceStatus(order.id, "failed", {
      workspaceError: errorMessage(error).slice(0, 1000),
    });
  }
}
