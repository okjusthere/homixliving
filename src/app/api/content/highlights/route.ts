import { z } from "zod";
import { contentActor, contentError, jsonBody } from "@/lib/content/api";
import {
  extractPosterHighlights,
  AzureTextError,
} from "@/lib/content/poster-highlights";
import { audit, query, transaction, ContentError } from "@/lib/content/store";
export const runtime = "nodejs";
export const maxDuration = 180;
const listingSchema = z.object({
  address: z.string().trim().max(240),
  description: z.string().trim().min(10).max(12000),
  price: z.string().max(240).optional(),
  beds: z.string().max(240).optional(),
  baths: z.string().max(240).optional(),
  area: z.string().max(240).optional(),
  lotArea: z.string().max(240).optional(),
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
    // Reserve each attempt atomically, including failures, across all server instances.
    await transaction(async (client) => {
      await query(
        "SELECT pg_advisory_xact_lock(891012,$1::integer)",
        [actor.agentId],
        client,
      );
      const [usage] = await query<{ count: string }>(
        "SELECT count(*) FROM portal.content_audit WHERE actor_agent_id=$1 AND action='highlights.request' AND created_at > now() - interval '1 hour'",
        [actor.agentId],
        client,
      );
      if (Number(usage.count) >= 20)
        throw new ContentError(
          "AI extraction limit reached; try again later / AI 提取次数已达上限，请稍后再试",
          429,
        );
      await audit(
        actor.agentId,
        "highlights.request",
        crypto.randomUUID(),
        client,
      );
    });
    const result = await extractPosterHighlights(listing);
    await audit(actor.agentId, "highlights.extract", crypto.randomUUID());
    return Response.json(result);
  } catch (error) {
    if (error instanceof AzureTextError)
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    return contentError(error);
  }
}
