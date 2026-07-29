import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Resend } from "resend";

// Lazy init so build doesn't fail when RESEND_API_KEY isn't set.
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error("RESEND_API_KEY is not set. Add it in your environment to enable email sending.");
    }
    _resend = new Resend(key);
  }
  return _resend;
}

// buildingName/unit/tenantName come from user-entered deal data and are
// interpolated into the HTML email body — escape them so a value like
// `<img onerror=...>` can't inject markup into the recipient's inbox.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type SendInvoiceEmailParams = {
  to: string[];
  cc?: string[];
  replyTo?: string;
  subject: string;
  fileName: string;
  pdfBuffer: Buffer;
  buildingName: string;
  unit: string;
  tenantName: string;
};

type EmailAttachment = {
  filename: string;
  content: string;
  contentType: "application/pdf";
};

async function loadBundledW9(): Promise<Buffer> {
  try {
    return await readFile(
      join(process.cwd(), "src", "assets", "homix-living-inc-w9.pdf"),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to load Homix Living W-9 attachment: ${message}`);
  }
}

async function loadCurrentCompanyW9(): Promise<Buffer> {
  try {
    const [{ getCompanyW9Metadata }, { getCompanyDocument }] =
      await Promise.all([
        import("@/lib/company-w9"),
        import("@/lib/r2-storage"),
      ]);
    const metadata = await getCompanyW9Metadata();
    if (metadata.objectKey) {
      return await getCompanyDocument(metadata.objectKey);
    }
  } catch (error) {
    // Invoice delivery should not fail because an uploaded W-9 is temporarily
    // unavailable. The version bundled with the deployment remains the fallback.
    console.error("Uploaded Company W-9 unavailable; using bundled PDF", error);
  }
  return loadBundledW9();
}

export async function buildInvoiceEmailAttachments(
  fileName: string,
  pdfBuffer: Buffer,
  companyW9?: Buffer,
): Promise<EmailAttachment[]> {
  const w9 = companyW9 || (await loadBundledW9());
  return [
    {
      filename: `${fileName}.pdf`,
      content: pdfBuffer.toString("base64"),
      contentType: "application/pdf",
    },
    {
      filename: "Homix Living Inc W9.pdf",
      content: w9.toString("base64"),
      contentType: "application/pdf",
    },
  ];
}

export async function sendInvoiceEmail({
  to,
  cc,
  replyTo,
  subject,
  fileName,
  pdfBuffer,
  buildingName,
  unit,
  tenantName,
}: SendInvoiceEmailParams) {
  const fromEmail = process.env.FROM_EMAIL || "invoice@homixny.com";
  const ccEmail = process.env.CC_EMAIL || "homix@homixny.com";
  const companyW9 = await loadCurrentCompanyW9();
  const attachments = await buildInvoiceEmailAttachments(
    fileName,
    pdfBuffer,
    companyW9,
  );

  const allCc = cc ? [...cc] : [];
  if (ccEmail && !allCc.includes(ccEmail)) {
    allCc.push(ccEmail);
  }

  const { data, error } = await getResend().emails.send({
    from: `Homix Invoice <${fromEmail}>`,
    to,
    cc: allCc.length > 0 ? allCc : undefined,
    replyTo: replyTo || undefined,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>OP Invoice</h2>
        <p>Dear Property Management,</p>
        <p>Please find the attached OP Invoice for the following:</p>
        <ul>
          <li><strong>Building:</strong> ${escapeHtml(buildingName)}</li>
          <li><strong>Unit:</strong> ${escapeHtml(unit)}</li>
          <li><strong>Tenant:</strong> ${escapeHtml(tenantName)}</li>
        </ul>
        <p>Please see the attached invoice PDF and W-9 for details.</p>
        <p>Best regards,<br/>Homix Living</p>
      </div>
    `,
    attachments,
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return data;
}
