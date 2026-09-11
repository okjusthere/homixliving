import { contentActor, contentError, jsonBody } from "@/lib/content/api";
import { emailMarketingRequest } from "@/lib/email-marketing";
import { ContentError } from "@/lib/content/store";
import { getListingEmailPayment, requireListingEmailPayment, startListingEmailCheckout } from "@/lib/commerce/listing-email-payment";

export const runtime = "nodejs";
export const maxDuration = 180;
async function handle(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const actor = await contentActor(req);
    if (actor instanceof Response) return actor;
    const path = (await params).path.map(encodeURIComponent).join("/");
    const paymentPath = /^campaigns\/([a-f0-9-]{36})\/(payment|checkout)$/.exec(path);
    if (paymentPath) {
      const campaignId = paymentPath[1];
      if (paymentPath[2] === "payment" && req.method === "GET") {
        await emailMarketingRequest({ ...actor, admin: false }, `campaigns/${campaignId}`);
        return Response.json(await getListingEmailPayment(actor, campaignId));
      }
      if (paymentPath[2] === "checkout" && req.method === "POST") {
        return Response.json(await startListingEmailCheckout(actor, campaignId, new URL(req.url).origin));
      }
      throw new ContentError("Unknown integration operation", 404);
    }
    const allowed =
      req.method === "GET"
        ? /^(status|listings|listings\/[^/]+|campaigns|campaigns\/[a-f0-9-]{36}(\/stats)?)$/
        : ["PATCH", "DELETE"].includes(req.method)
          ? /^campaigns\/[a-f0-9-]{36}$/
          : /^campaigns(\/[a-f0-9-]{36}\/(nearby|preview|test|publish|pause|resume|cancel|ai|ai-apply))?$/;
    if (!allowed.test(path))
      throw new ContentError("Unknown integration operation", 404);
    const incoming = new URL(req.url),
      search = new URLSearchParams();
    for (const key of ["query", "page"])
      if (incoming.searchParams.has(key))
        search.set(key, incoming.searchParams.get(key)!);
    const sending = /^campaigns\/([a-f0-9-]{36})\/(publish|resume)$/.exec(path);
    if (req.method === "POST" && sending) await requireListingEmailPayment(actor, sending[1]);
    const body = req.method === "GET" ? undefined : await jsonBody(req);
    const data = await emailMarketingRequest(
      actor,
      path + (search.size ? `?${search}` : ""),
      req.method,
      body,
      req.headers.get("idempotency-key") || undefined,
    );
    return Response.json(data, {
      status: req.method === "POST" && path.endsWith("/publish") ? 202 : 200,
    });
  } catch (e) {
    return contentError(e);
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;

export const DELETE = handle;
