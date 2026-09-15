import { contentActor, contentError, jsonBody } from "@/lib/content/api";
import { ContentError } from "@/lib/content/store";
import { uuid } from "@/lib/content/validation";
import { deleteOfficeTask, reviewOfficeOutput, submitOfficeTask } from "@/lib/content/office";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await contentActor(req, true);
    if (actor instanceof Response) return actor;
    const id = uuid.parse((await params).id);
    const body = await jsonBody(req);
    if (body.action === "submit") return Response.json({ generationId: await submitOfficeTask(actor.agentId, id) }, { status: 202 });
    if (typeof body.action !== "string") throw new ContentError("Action required");
    await reviewOfficeOutput(actor.agentId, id, body.action);
    return Response.json({ ok: true });
  } catch (e) { return contentError(e); }
}
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await contentActor(req, true);
    if (actor instanceof Response) return actor;
    await deleteOfficeTask(actor.agentId, uuid.parse((await params).id));
    return Response.json({ ok: true });
  } catch (e) { return contentError(e); }
}
