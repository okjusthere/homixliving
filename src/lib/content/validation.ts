import { z } from "zod";
import { IMAGE_SIZES, LISTING_THEMES } from "./types";

export const uuid = z.string().uuid();
const short = z.string().trim().max(240);
const highlight = z.object({
  en: short.min(1),
  zh: z.string().trim().min(1).max(160),
  evidence: z.string().trim().min(3).max(600),
  selected: z.boolean().default(true),
});
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T12:00:00Z`);
    return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === s;
  }, "Invalid calendar date");
export const inputSchema = z
  .object({
    kind: z.enum(["listing", "holiday"]),
    theme: short.min(1),
    language: z.enum(["en", "zh"]),
    size: z.enum(IMAGE_SIZES),
    includePortrait: z.boolean().default(true),
    headline: short.default(""),
    message: z.string().trim().max(2000).default(""),
    additionalInstructions: z.string().trim().max(2000).default(""),
    listing: z
      .object({
        source: z.enum(["mls", "manual"]),
        sourceKey: short.optional(),
        address: short.min(1),
        price: short.default(""),
        beds: short.optional(),
        baths: short.optional(),
        area: short.optional(),
        annualPropertyTax: short.optional(),
        monthlyMaintenanceFee: short.optional(),
        associationFee: short.optional(),
        associationFeeFrequency: short.optional(),
        description: z.string().trim().max(12000).optional(),
        highlights: z.array(highlight).max(6).optional(),
        financialFacts: z
          .array(
            highlight.extend({
              kind: z.enum(["property_tax", "maintenance", "hoa", "other"]),
            }),
          )
          .max(4)
          .optional(),
        highlightsReviewed: z.boolean().optional(),
        highlightsModel: short.optional(),
        imageAssetIds: z.array(uuid).min(1).max(4),
        fetchedAt: short.optional(),
        sourceStatus: short.optional(),
      })
      .optional(),
    event: z
      .object({
        date,
        start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        timezone: short.refine((s) => {
          try {
            new Intl.DateTimeFormat("en", { timeZone: s });
            return true;
          } catch {
            return false;
          }
        }),
      })
      .optional(),
    holidayDate: date.optional(),
  })
  .superRefine((value, ctx) => {
    if (
      (value.listing?.highlights?.filter((h) => h.selected !== false).length ||
        0) > 4
    )
      ctx.addIssue({
        code: "custom",
        message: "Choose up to 4 selling points / 最多选择 4 个卖点",
        path: ["listing", "highlights"],
      });
    if (
      ["just_listed", "open_house"].includes(value.theme) &&
      value.listing?.associationFee?.trim() &&
      !value.listing.associationFeeFrequency?.trim()
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Select the HOA fee billing period / 请选择 HOA 收费周期",
        path: ["listing", "associationFeeFrequency"],
      });
    }
    if (
      value.kind === "listing" &&
      (!value.listing || !LISTING_THEMES.some((t) => t.id === value.theme))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Choose a listing theme and supply property details",
        path: ["listing"],
      });
    }
    if (
      value.kind === "listing" &&
      value.theme === "open_house" &&
      (!value.event || value.event.end <= value.event.start)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Open House requires a date and an end time after the start",
        path: ["event"],
      });
    }
  });
export const templateConfigSchema = z.object({
  name: z.object({ en: short.min(1), zh: short.min(1) }),
  description: z.object({ en: short, zh: short }),
  kind: z.enum(["listing", "holiday"]),
  themes: z.array(short.min(1)).min(1).max(100),
  style: short.min(1),
  prompt: z.string().trim().min(30).max(16000),
  colors: z.tuple([
    z.string().regex(/^#[a-fA-F0-9]{6}$/),
    z.string().regex(/^#[a-fA-F0-9]{6}$/),
    z.string().regex(/^#[a-fA-F0-9]{6}$/),
  ]),
  referenceAssetIds: z.array(uuid).max(3).default([]),
  sizes: z.array(z.enum(IMAGE_SIZES)).min(1),
});
export const holidaySchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,79}$/),
    country: z.enum(["US", "CN"]),
    name: z.object({ en: short.min(1), zh: short.min(1) }),
    greeting: z.object({ en: short, zh: short }),
    enabled: z.boolean(),
    dates: z
      .array(z.object({ year: z.number().int().min(2020).max(2100), date }))
      .max(81),
  })
  .superRefine((v, c) => {
    if (
      new Set(v.dates.map((d) => d.year)).size !== v.dates.length ||
      v.dates.some((d) => !d.date.startsWith(`${d.year}-`))
    )
      c.addIssue({
        code: "custom",
        message: "Use one matching calendar date per year",
        path: ["dates"],
      });
  });
