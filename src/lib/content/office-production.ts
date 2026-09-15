import type { ContentInput, ContentTemplate, ImageSize, OpenHouseEvent } from "./types";
import { LISTING_THEMES } from "./types";
import type { StudioListing } from "./listing-source";
import { inputSchema } from "./validation";

export type OfficeDefaults = { theme: string; language: "zh" | "en" | "both"; style: "editorial" | "modern"; size: ImageSize };
export const officeDefaults: OfficeDefaults = { theme: "just_listed", language: "zh", style: "editorial", size: "1024x1280" };
export function readOfficeDefaults(raw: string | null): OfficeDefaults {
  try {
    const v = JSON.parse(raw || "{}");
    return { theme: LISTING_THEMES.some((t) => t.id === v.theme) ? v.theme : officeDefaults.theme, language: ["zh", "en", "both"].includes(v.language) ? v.language : "zh", style: v.style === "modern" ? "modern" : "editorial", size: ["1024x1024", "1024x1280", "1152x2048"].includes(v.size) ? v.size : "1024x1280" };
  } catch { return { ...officeDefaults }; }
}
export function officeLanguages(value: OfficeDefaults["language"]): ("zh" | "en")[] { return value === "both" ? ["zh", "en"] : [value]; }
export function officeTemplate(templates: ContentTemplate[], theme: string, style: string) {
  const template = templates.find((t) => t.config.kind === "listing" && t.config.style === style && (t.config.themes.includes(theme) || t.config.themes.includes("*")));
  if (!template) throw new Error("This theme has no published template / 此主题暂无已发布模板，请选择其他风格");
  return template;
}
export function needsOfficeHighlights(theme: string) { return ["just_listed", "open_house"].includes(theme); }
export function officeListingInput(detail: StudioListing, assetId: string, defaults: OfficeDefaults, events: OpenHouseEvent[]): ContentInput {
  return {
    kind: "listing", theme: defaults.theme, language: defaults.language === "en" ? "en" : "zh", size: defaults.size, includePortrait: true,
    headline: "", message: "", additionalInstructions: "", representationRole: "unspecified",
    // Explicit office batch sessions apply to every selected property. Blank
    // dates remain missing; never invent dates or silently reuse an MLS event.
    events: defaults.theme === "open_house" ? events.filter((e) => e.selected !== false && e.date.trim()) : [],
    listing: { source: "mls", sourceKey: detail.id, address: detail.address.full,
      price: defaults.theme === "just_sold" ? "" : detail.askingPrice ? `$${detail.askingPrice.toLocaleString("en-US")}` : "",
      beds: String(detail.beds ?? ""), baths: String(detail.baths + (detail.halfBaths || 0) * 0.5 || ""), area: String(detail.sqft || ""), description: detail.description || "",
      annualPropertyTax: detail.annualPropertyTax, monthlyMaintenanceFee: detail.monthlyMaintenanceFee, associationFee: detail.associationFee, associationFeeFrequency: detail.associationFeeFrequency,
      imageAssetIds: [assetId], fetchedAt: new Date().toISOString(), sourceStatus: detail.status },
  };
}
export function officeDraftProblems(input: ContentInput, zh: boolean): string[] {
  const result = inputSchema.safeParse(input);
  if (result.success) return [];
  return [...new Set(result.error.issues.map((issue) => {
    if (issue.path[0] === "events") return zh ? "待补公展日期或时间：点击编辑" : "Add Open House dates/times: Edit this draft";
    return zh ? (issue.message.split(" / ").at(-1) || issue.message) : issue.message.split(" / ")[0];
  }))];
}
