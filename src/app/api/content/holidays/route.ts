import { contentActor, contentError, jsonBody } from "@/lib/content/api";
import { holidays, transaction, audit } from "@/lib/content/store";
import { holidaySchema } from "@/lib/content/validation";
export async function GET(req: Request) {
  try {
    const actor = await contentActor(req);
    if (actor instanceof Response) return actor;
    return Response.json({
      holidays: await holidays(
        actor.admin && new URL(req.url).searchParams.get("admin") === "1",
      ),
    });
  } catch (e) {
    return contentError(e);
  }
}
export async function PUT(req: Request) {
  try {
    const actor = await contentActor(req, true);
    if (actor instanceof Response) return actor;
    const h = holidaySchema.parse(await jsonBody(req));
    await transaction(async (c) => {
      await c.query(
        "INSERT INTO portal.content_holidays(id,country,name,greeting,enabled) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET country=EXCLUDED.country,name=EXCLUDED.name,greeting=EXCLUDED.greeting,enabled=EXCLUDED.enabled",
        [
          h.id,
          h.country,
          JSON.stringify(h.name),
          JSON.stringify(h.greeting),
          h.enabled,
        ],
      );
      await c.query(
        "DELETE FROM portal.content_holiday_dates WHERE holiday_id=$1",
        [h.id],
      );
      for (const d of h.dates)
        await c.query(
          "INSERT INTO portal.content_holiday_dates(holiday_id,year,date) VALUES($1,$2,$3)",
          [h.id, d.year, d.date],
        );
      await audit(actor.agentId, "holiday.update", h.id, c);
    });
    return Response.json({ holiday: h });
  } catch (e) {
    return contentError(e);
  }
}
