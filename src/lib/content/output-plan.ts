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
  const period = (value: string) => language === "zh"
    ? ({ Monthly: "月", Quarterly: "季度", Annually: "年" }[value] || value)
    : ({ Monthly: "month", Quarterly: "quarter", Annually: "year" }[value] || value);
  const costs = [
    listing.annualPropertyTax?.trim() ? `${language === "zh" ? "地税" : "Property tax"}: ${listing.annualPropertyTax} / ${language === "zh" ? "年" : "year"}` : "",
    listing.monthlyMaintenanceFee?.trim() ? `${language === "zh" ? "管理费" : "Maintenance"}: ${listing.monthlyMaintenanceFee} / ${language === "zh" ? "月" : "month"}` : "",
    listing.associationFee?.trim() && listing.associationFeeFrequency?.trim() ? `${language === "zh" ? "HOA／协会费" : "HOA fee"}: ${listing.associationFee} / ${period(listing.associationFeeFrequency)}` : "",
  ].filter(Boolean);
  if (level === "detailed" && listing.highlightsMode === "image_model")
    return {
      address: listing.address, price: listing.price, beds: listing.beds,
      baths: listing.baths, area: listing.area, lotArea: listing.lotArea,
      sourceDescription: listing.description || "",
      verifiedCosts: costs,
      annualPropertyTax: listing.annualPropertyTax || undefined,
      monthlyMaintenanceFee: listing.monthlyMaintenanceFee || undefined,
      associationFee: listing.associationFeeFrequency ? listing.associationFee : undefined,
      associationFeeFrequency: listing.associationFeeFrequency || undefined,
    };
  if (level === "detailed")
    return {
      address: listing.address,
      price: listing.price,
      beds: listing.beds,
      baths: listing.baths,
      area: listing.area,
      lotArea: listing.lotArea,
      selectedHighlights: [...new Set([...selectedHighlights, ...costs, ...selectedFinancialFacts])],
    };
  if (level === "preview")
    return {
      address: listing.address,
      price: listing.price,
      beds: listing.beds,
      baths: listing.baths,
      area: listing.area,
      lotArea: listing.lotArea,
      selectedHighlights,
    };
  return {
    address: listing.address,
    ...(input.theme === "just_sold" ? { price: listing.price } : {}),
  };
}
