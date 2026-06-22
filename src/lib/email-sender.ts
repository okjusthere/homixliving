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

async function loadW9Attachment(): Promise<EmailAttachment> {
  try {
    const pdf = await readFile(join(process.cwd(), "src", "assets", "homix-living-inc-w9.pdf"));
    return {
      filename: "Homix Living Inc W9.pdf",
      content: pdf.toString("base64"),
      contentType: "application/pdf",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to load Homix Living W-9 attachment: ${message}`);
  }
}

export async function buildInvoiceEmailAttachments(fileName: string, pdfBuffer: Buffer): Promise<EmailAttachment[]> {
  return [
    {
      filename: `${fileName}.pdf`,
      content: pdfBuffer.toString("base64"),
      contentType: "application/pdf",
    },
    await loadW9Attachment(),
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
  const attachments = await buildInvoiceEmailAttachments(fileName, pdfBuffer);

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
          <li><strong>Building:</strong> ${buildingName}</li>
          <li><strong>Unit:</strong> ${unit}</li>
          <li><strong>Tenant:</strong> ${tenantName}</li>
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
