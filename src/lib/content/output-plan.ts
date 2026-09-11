import { z } from "zod";
import type { ContentInput } from "./types";

export function posterLanguages(
  input: ContentInput,
  requested?: unknown,
): ("en" | "zh")[] {
  if (requested === undefined)
    return [z.enum(["en", "zh"]).parse(input.language)];
  const languages = z
    .array(z.enum(["en", "zh"]))
    .min(1)
    .max(2)
    .refine(
      (values) => new Set(values).size === values.length,
      "Choose each output language only once",
    )
    .parse(requested);
  // Keep the pair order stable for idempotency and sequential execution.
  return (["zh", "en"] as const).filter((language) =>
    languages.includes(language),
  );
}

export function listingDetailLevel(theme: string) {
  return theme === "just_listed" || theme === "open_house"
    ? "detailed"
    : theme === "coming_soon"
      ? "preview"
      : "brief";
}

export function posterListingFacts(input: ContentInput) {
  if (!input.listing) return undefined;
  const listing = { ...input.listing, imageAssetIds: undefined };
  const language = input.language === "zh" ? "zh" : "en";
  const selectedHighlights = (listing.highlights || [])
    .filter((h) => h.selected !== false)
    .map((h) => h[language]);
  const selectedFinancialFacts = (listing.financialFacts || [])
    .filter(
      (h) =>
        h.selected !== false &&
        !(
          (h.kind === "property_tax" && listing.annualPropertyTax) ||
          (h.kind === "maintenance" && listing.monthlyMaintenanceFee) ||
          (h.kind === "hoa" && listing.associationFee)
        ),
    )
    .map((h) => h[language]);
  const level = listingDetailLevel(input.theme);
  if (level === "detailed")
    return {
      address: listing.address,
      price: listing.price,
      beds: listing.beds,
      baths: listing.baths,
      area: listing.area,
      annualPropertyTax: listing.annualPropertyTax,
      monthlyMaintenanceFee: listing.monthlyMaintenanceFee,
      associationFee: listing.associationFee,
      associationFeeFrequency: listing.associationFeeFrequency,
      selectedHighlights,
      selectedFinancialFacts,
    };
  if (level === "preview")
    return {
      address: listing.address,
      price: listing.price,
      beds: listing.beds,
      baths: listing.baths,
      area: listing.area,
      selectedHighlights: selectedHighlights.slice(0, 1),
    };
  return {
    address: listing.address,
    ...(input.theme === "just_sold" ? { price: listing.price } : {}),
  };
}
