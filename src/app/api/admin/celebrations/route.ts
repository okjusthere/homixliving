import { z } from "zod";
import { contentActor, contentError } from "@/lib/content/api";
import { ContentError } from "@/lib/content/store";
import { requestBytes } from "@/lib/content/request-body";
import {
  birthdayList,
  birthdayProfiles,
  saveBirthdays,
  saveBirthdaySettings,
} from "@/lib/celebrations/data";
import {
  markCelebrated,
  prepareBirthday,
  prepareUpcomingBirthdays,
} from "@/lib/celebrations/generation";
import { dispatchGeneration } from "@/lib/content/dispatch";
import { recoverGenerations } from "@/lib/content/recovery";

export const runtime = "nodejs";
export const maxDuration = 300;
const kindSchema = z.enum(["birthday", "anniversary"]);
export async function GET(req: Request) {
  try {
    const actor = await contentActor(req, true);
    if (actor instanceof Response) return actor;
    const url = new URL(req.url);
    const kind = kindSchema.parse(url.searchParams.get("kind") || "birthday");
    const filter = z
      .enum(["today", "upcoming", "month", "missing", "all"])
      .parse(url.searchParams.get("filter") || "today");
    return Response.json(
      await birthdayList(
        filter,
        (url.searchParams.get("q") || "").slice(0, 200),
        Number(url.searchParams.get("page")),
        undefined,
        kind,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return contentError(e);
  }
}
export async function POST(req: Request) {
  try {
    const actor = await contentActor(req, true);
    if (actor instanceof Response) return actor;
    let body;
    try {
      body = JSON.parse(
        new TextDecoder().decode(await requestBytes(req, 512000)),
      );
    } catch (e) {
      if (e instanceof SyntaxError) throw new ContentError("Invalid JSON");
      throw e;
    }
    const action = z
      .enum(["save", "prepare", "celebrated", "settings", "scan"])
      .parse(body?.action);
    if (action === "save")
      return Response.json(await saveBirthdays(body.changes, actor));
    if (action === "settings") {
      await saveBirthdaySettings(body.settings, actor);
      return Response.json({ ok: true });
    }
    if (action === "celebrated") {
      await markCelebrated(
        z.uuid().parse(body.eventId),
        z.boolean().parse(body.value),
        actor,
      );
      return Response.json({ ok: true });
    }
    if (action === "scan") {
      const result = await prepareUpcomingBirthdays();
      const recovery = await recoverGenerations(true);
      return Response.json({
        checked: result.checked,
        errors: result.errors,
        ...recovery,
      });
    }
    const kind = kindSchema.parse(body.kind),
      id = z.number().int().positive().parse(body.agentId);
    const revision = z.number().int().nonnegative().parse(body.revision);
    const profile = (await birthdayProfiles(kind)).find(
      (p) => p.agentId === id,
    );
    if (!profile || profile.revision !== revision)
      throw new ContentError(
        "资料已更新，请刷新 / Details changed; reload",
        409,
      );
    const generationId = await prepareBirthday(profile, {
      actorEmail: actor.email,
      retryGenerationId: body.retryGenerationId
        ? z.uuid().parse(body.retryGenerationId)
        : undefined,
    });
    if (generationId) await dispatchGeneration(generationId);
    return Response.json(
      { generationId },
      { status: generationId ? 202 : 200 },
    );
  } catch (e) {
    return contentError(e);
  }
}
