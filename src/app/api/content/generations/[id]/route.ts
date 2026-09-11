import { contentActor, contentError, jsonBody } from "@/lib/content/api";
import {
  getGeneration,
  query,
  transaction,
  audit,
  ContentError,
} from "@/lib/content/store";
import { uuid } from "@/lib/content/validation";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await contentActor(req);
    if (actor instanceof Response) return actor;
    const generation = await getGeneration(
      uuid.parse((await params).id),
      actor.agentId,
      actor.admin,
    );
    const diagnostics = actor.admin
      ? (
          await query(
            "SELECT workflow_run_id,provider_request_id,provider_config,provider_started_at FROM portal.content_generations WHERE id=$1",
            [generation.id],
          )
        )[0]
      : undefined;
    return Response.json({ generation, diagnostics });
  } catch (e) {
    return contentError(e);
  }
}
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await contentActor(req, true);
    if (actor instanceof Response) return actor;
    const id = uuid.parse((await params).id),
      body = await jsonBody(req);
    if (
      body.action !== "close_review" ||
      typeof body.note !== "string" ||
      body.note.trim().length < 5 ||
      body.note.length > 500
    )
      throw new ContentError("A review note of 5–500 characters is required");
    await transaction(async (client) => {
      const rows = await query(
        "UPDATE portal.content_generations SET status='failed',error=$2,updated_at=now() WHERE id=$1 AND status='needs_review' RETURNING id",
        [id, `REVIEWED: ${body.note}`],
        client,
      );
      if (!rows.length)
        throw new ContentError(
          "Only unresolved provider outcomes can be closed",
          409,
        );
      await audit(actor.agentId, "generation.review_closed", id, client);
    });
    return Response.json({ ok: true });
  } catch (e) {
    return contentError(e);
  }
}
