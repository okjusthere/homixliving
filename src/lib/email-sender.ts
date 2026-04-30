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
        <p>Please see the attached PDF for details.</p>
        <p>Best regards,<br/>Homix Living</p>
      </div>
    `,
    attachments: [
      {
        filename: `${fileName}.pdf`,
        content: pdfBuffer,
      },
    ],
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return data;
}
