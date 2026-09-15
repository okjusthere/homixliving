import { z } from "zod";
import { inputSchema } from "./validation";

// Office drafts may omit sessions until review. Only the empty-session case
// is relaxed; submitting still uses the original strict generation schema.
export const officeDraftInputSchema = z.unknown().transform((value, ctx) => {
  const v = value as Record<string, unknown> | null;
  const missingSessions = v?.kind === "listing" && v.theme === "open_house" && (!v.events || (Array.isArray(v.events) && v.events.length === 0)) && !v.event;
  const parsed = inputSchema.safeParse(missingSessions ? { ...v, theme: "just_listed" } : value);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) ctx.addIssue({ ...issue });
    return z.NEVER;
  }
  return missingSessions ? { ...parsed.data, theme: "open_house", events: [] } : parsed.data;
});
