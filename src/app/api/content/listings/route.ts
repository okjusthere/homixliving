import { z } from "zod";
import { contentActor, contentError } from "@/lib/content/api";
import { ContentError } from "@/lib/content/store";
import { homixwebBase, homixwebSecret } from "@/lib/homixweb";
export const runtime = "nodejs";
const schema = z.object({
  scope: z.enum(["homix", "all"]).default("homix"),
  q: z.string().trim().max(160).default(""),
  page: z.coerce.number().int().min(1).max(100).default(1),
  slug: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,240}$/)
    .optional(),
});
export async function GET(req: Request) {
  try {
    const actor = await contentActor(req);
    if (actor instanceof Response) return actor;
    const input = schema.parse(
      Object.fromEntries(new URL(req.url).searchParams),
    );
    if (input.scope === "all" && !input.slug && input.q.length < 2)
      throw new ContentError(
        "Enter an MLS number, address or ZIP / 请输入 MLS、地址或邮编",
      );
    const secret = homixwebSecret();
    if (!secret)
      throw new ContentError(
        "Listing source unavailable / 房源服务尚未配置",
        503,
      );
    const params = new URLSearchParams({
      scope: input.scope,
      q: input.q,
      page: String(input.page),
    });
    if (input.slug) params.set("slug", input.slug);
    let response: Response;
    try {
      response = await fetch(
        `${homixwebBase()}/api/portal/listings?${params}`,
        {
          headers: { authorization: `Bearer ${secret}` },
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(20_000),
        },
      );
    } catch {
      throw new ContentError(
        "Listing source temporarily unavailable. Please retry / 房源服务暂时不可用，请重试",
        503,
      );
    }
    if (response.status === 404)
      throw new ContentError("Listing no longer available / 房源已不可用", 404);
    if (!response.ok)
      throw new ContentError(
        "Listing source temporarily unavailable. Please retry / 房源服务暂时不可用，请重试",
        503,
      );
    return Response.json(await response.json(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return contentError(error);
  }
}
