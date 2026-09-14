import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireActiveAgentApi, requireAdminApi } from "@/lib/auth-guards";
import { DEFAULT_INVOICE_SETTINGS, withInvoiceSettingDefaults } from "@/lib/invoice-settings";
import { logAudit } from "@/lib/audit";
import { COMPANY_LICENSE_KEYS, validCompanyLicenseSettings } from "@/lib/company-settings";

export async function GET() {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const allSettings = await db.select().from(settings);
  const settingsMap = Object.fromEntries(allSettings.map((s) => [s.key, s.value]));
  const merged = withInvoiceSettingDefaults(settingsMap);

  // Agents need the invoice-instruction keys (they are printed on every
  // invoice PDF), but nothing else that may live in this table — an
  // allowlist keeps any future non-invoice setting admin-only by default.
  if (!authResult.session.user.isAdmin) {
    const allowed = new Set(Object.keys(DEFAULT_INVOICE_SETTINGS));
    return NextResponse.json(
      Object.fromEntries(Object.entries(merged).filter(([key]) => allowed.has(key)))
    );
  }
  return NextResponse.json(merged);
}

export async function PUT(req: NextRequest) {
  const authResult = await requireAdminApi();
  if ("error" in authResult) return authResult.error;

  const body = await req.json();
  if (!body || typeof body !== "object" || Array.isArray(body) || !validCompanyLicenseSettings(body))
    return NextResponse.json({ error: "公司 Broker 执照号须为 11 位数字 / Broker license must contain 11 digits" }, { status: 400 });
  for (const key of COMPANY_LICENSE_KEYS)
    if (typeof body[key] === "string") body[key] = body[key].trim();
  for (const [key, value] of Object.entries(body)) {
    const existing = await db.select().from(settings).where(eq(settings.key, key)).then((rows) => rows[0]);
    if (existing) {
      await db.update(settings).set({ value: String(value) }).where(eq(settings.key, key));
    } else {
      await db.insert(settings).values({ key, value: String(value) });
    }
    // Never write bank account/routing details into the audit trail.
    await logAudit(
      authResult.session,
      "update",
      "setting",
      key,
      `更新系统设置 ${key}`,
      /account|routing|swift/i.test(key) ? { redacted: true } : { value: String(value) }
    );
  }
  return NextResponse.json({ success: true });
}
