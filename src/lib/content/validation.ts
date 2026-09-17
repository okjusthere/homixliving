import { z } from "zod";
import { relevantContentInput } from "./form-state";
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
  }, "Choose a real calendar date / 请选择有效的日历日期");
const eventSchema = z.object({
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
});

const contentInputSchema = z
  .object({
    kind: z.enum(["listing", "holiday", "custom"]),
    theme: short.min(1),
    language: z.enum(["en", "zh"]),
    size: z.enum(IMAGE_SIZES),
    includePortrait: z.boolean().default(true),
    headline: short.default(""),
    message: z.string().trim().max(2000).default(""),
    additionalInstructions: z.string().trim().max(2000).default(""),
    stylePrompt: z.string().trim().max(16000).optional(),
    referenceAssetIds: z.array(uuid).max(4).optional(),
    representationRole: z.enum(["listing", "buyer", "unspecified"]).optional(),
    listing: z
      .object({
        source: z.enum(["mls", "manual"]),
        sourceKey: short.optional(),
        address: short.min(1),
        price: short.default(""),
        beds: short.optional(),
        baths: short.optional(),
        area: short.optional(),
        lotArea: short.optional(),
        annualPropertyTax: short.optional(),
        monthlyMaintenanceFee: short.optional(),
        associationFee: short.optional(),
        associationFeeFrequency: short.optional(),
        description: z.string().trim().max(12000).optional(),
        highlights: z.array(highlight).optional(),
        financialFacts: z
          .array(
            highlight.extend({
              kind: z.enum(["property_tax", "maintenance", "hoa", "other"]),
            }),
          )
          .optional(),
        highlightsMode: z.literal("image_model").optional(),
        highlightsReviewed: z.boolean().optional(),
        highlightsModel: short.optional(),
        imageAssetIds: z.array(uuid).min(1).max(4),
        fetchedAt: short.optional(),
        sourceStatus: short.optional(),
      })
      .optional(),
    events: z
      .array(
        z
          .object({
            date: short,
            start: short,
            end: short,
            timezone: short,
            selected: z.boolean().default(true),
          })
          .superRefine((event, ctx) => {
            if (!event.selected) return;
            const valid = eventSchema.safeParse(event);
            if (!valid.success)
              for (const issue of valid.error.issues) ctx.addIssue({ ...issue });
            if (event.start && event.end && event.end <= event.start)
              ctx.addIssue({
                code: "custom",
                path: ["end"],
                message:
                  "End time must be after start time / 结束时间必须晚于开始时间",
              });
          }),
      )
      .max(100)
      .optional(),
    holidayDate: date.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "custom" && !value.stylePrompt?.trim()) {
      ctx.addIssue({ code: "custom", path: ["stylePrompt"], message: "Write a prompt for this poster / 请填写这张海报的提示词" });
    }
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
        message:
          "Choose a listing theme and supply property details / 请选择房源主题并填写房源资料",
        path: ["listing"],
      });
    }
    if (value.kind === "listing" && value.theme === "open_house") {
      const chosen =
        value.events?.filter((event) => event.selected !== false) || [];
      if (!chosen.length)
        ctx.addIssue({
          code: "custom",
          path: ["events"],
          message:
            "Choose at least one Open House session / 请添加并选择至少一场公展",
        });
      const seen = new Set<string>();
      value.events?.forEach((event, index) => {
        if (event.selected === false) return;
        const key = `${event.date}|${event.start}|${event.end}|${event.timezone}`;
        if (seen.has(key))
          ctx.addIssue({
            code: "custom",
            path: ["events", index],
            message: `Open House ${index + 1}: duplicate session; remove or deselect it / 第 ${index + 1} 场公展：日期和时间重复，请删除或取消选择`,
          });
        seen.add(key);
      });
    }
  });
export const inputSchema = z.preprocess(
  relevantContentInput,
  contentInputSchema,
);
export const templateConfigSchema = z.object({
  name: z.object({ en: short.min(1), zh: short.min(1) }),
  description: z.object({ en: short, zh: short }),
  kind: z.enum(["listing", "holiday", "custom", "birthday", "anniversary"]),
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
