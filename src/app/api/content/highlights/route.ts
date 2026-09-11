import { z } from "zod";
import { contentActor, contentError, jsonBody } from "@/lib/content/api";
import { emailMarketingRequest } from "@/lib/email-marketing";
import { audit } from "@/lib/content/store";
export const runtime = "nodejs";
export const maxDuration = 180;
const listingSchema = z.object({
  address: z.string().trim().max(240),
  description: z.string().trim().min(10).max(12000),
  price: z.string().max(240).optional(),
  beds: z.string().max(240).optional(),
  baths: z.string().max(240).optional(),
  area: z.string().max(240).optional(),
  annualPropertyTax: z.string().max(240).optional(),
  monthlyMaintenanceFee: z.string().max(240).optional(),
  associationFee: z.string().max(240).optional(),
  associationFeeFrequency: z.string().max(240).optional(),
});
export async function POST(req: Request) {
  try {
    const actor = await contentActor(req);
    if (actor instanceof Response) return actor;
    const listing = listingSchema.parse((await jsonBody(req)).listing);
    const result = await emailMarketingRequest(
      actor,
      "poster-highlights",
      "POST",
      { listing },
    );
    await audit(actor.agentId, "highlights.extract", crypto.randomUUID());
    return Response.json(result);
  } catch (error) {
    return contentError(error);
  }
}
