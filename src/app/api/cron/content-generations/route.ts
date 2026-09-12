import { timingSafeEqual } from "node:crypto";
import { recoverGenerations } from "@/lib/content/recovery";
export const maxDuration = 60;
export async function GET(req: Request) {
  const expected = process.env.CONTENT_RECOVERY_SECRET,
    token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (
    !expected ||
    !token ||
    Buffer.byteLength(token) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await recoverGenerations());
}
