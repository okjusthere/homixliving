import { timingSafeEqual } from "node:crypto";
import { contentError } from "@/lib/content/api";
import { prepareUpcomingBirthdays } from "@/lib/celebrations/generation";
import { recoverGenerations } from "@/lib/content/recovery";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (
    !expected ||
    !token ||
    Buffer.byteLength(token) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await prepareUpcomingBirthdays();
    const recovery = await recoverGenerations(true);
    return Response.json({
      checked: result.checked,
      errors: result.errors,
      ...recovery,
    });
  } catch (e) {
    return contentError(e);
  }
}
