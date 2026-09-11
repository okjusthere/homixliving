import type { ContentInput } from "./types";
import { listingDetailLevel } from "./output-plan";

/** The primary action names the next step; extraction never implies approval. */
export function copyReviewStep(
  input: ContentInput,
): "extract" | "confirm" | "ready" {
  if (input.kind !== "listing" || listingDetailLevel(input.theme) === "brief")
    return "ready";
  const listing = input.listing;
  if (listing?.highlightsReviewed) return "ready";
  if (listing?.highlightsModel) return "confirm";
  return listingDetailLevel(input.theme) === "detailed" &&
    listing?.description?.trim()
    ? "extract"
    : "ready";
}
/** Call only after the user presses the explicitly labelled confirm-and-create action. */
export function confirmPosterCopy(input: ContentInput): ContentInput {
  if (copyReviewStep(input) !== "confirm" || !input.listing) return input;
  return { ...input, listing: { ...input.listing, highlightsReviewed: true } };
}
