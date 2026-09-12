import { z } from "zod";
import { contentActor, contentError } from "@/lib/content/api";
import { ContentError } from "@/lib/content/store";
import { requestBytes } from "@/lib/content/request-body";
import { birthdayProfiles } from "@/lib/celebrations/data";
import { previewBirthdays, readBirthdayFile } from "@/lib/celebrations/import";
export const runtime = "nodejs";
export async function GET(req: Request) {
  const actor = await contentActor(req, true);
  if (actor instanceof Response) return actor;
  const anniversary =
    new URL(req.url).searchParams.get("kind") === "anniversary";
  return new Response(
    "\uFEFF" +
      (anniversary
        ? "email,joined_on\r\n"
        : "email,birthday_month,birthday_day\r\n"),
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${anniversary ? "anniversary" : "birthday"}-template.csv"`,
        "Cache-Control": "private, no-store",
      },
    },
  );
}
export async function POST(req: Request) {
  try {
    const actor = await contentActor(req, true);
    if (actor instanceof Response) return actor;
    const kind = z
      .enum(["birthday", "anniversary"])
      .parse(new URL(req.url).searchParams.get("kind") || "birthday");
    const bounded = await requestBytes(req, 2 * 1024 * 1024 + 32000);
    const form = await new Response(new Uint8Array(bounded), {
      headers: { "Content-Type": req.headers.get("content-type") || "" },
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File))
      throw new ContentError("请选择名册文件 / Choose a roster file");
    const sheet = await readBirthdayFile(
      Buffer.from(await file.arrayBuffer()),
      file.name,
    );
    return Response.json(
      { rows: previewBirthdays(sheet, await birthdayProfiles(kind), kind) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return contentError(e);
  }
}
