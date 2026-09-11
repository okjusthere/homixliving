import { test } from "node:test";
import assert from "node:assert/strict";
import { copyReviewStep, confirmPosterCopy } from "../copy-review";
import type { ContentInput } from "../types";
const input: ContentInput = {
  kind: "listing",
  theme: "just_listed",
  language: "en",
  size: "1024x1280",
  includePortrait: false,
  headline: "",
  message: "",
  additionalInstructions: "",
  listing: {
    source: "mls",
    address: "2 Lee Place",
    price: "",
    description: "Original listing description.",
    imageAssetIds: [],
  },
};
test("extraction does not silently approve AI copy", () => {
  assert.equal(copyReviewStep(input), "extract");
  assert.equal(confirmPosterCopy(input).listing?.highlightsReviewed, undefined);
  const extracted = {
    ...input,
    listing: {
      ...input.listing!,
      highlightsModel: "model",
      highlightsReviewed: false,
    },
  };
  assert.equal(copyReviewStep(extracted), "confirm");
  assert.equal(confirmPosterCopy(extracted).listing?.highlightsReviewed, true);
  assert.equal(extracted.listing.highlightsReviewed, false);
});
test("explicit basic-details choice and brief posters do not require AI", () => {
  assert.equal(
    copyReviewStep({
      ...input,
      listing: {
        ...input.listing!,
        highlightsReviewed: true,
        highlights: [],
        financialFacts: [],
      },
    }),
    "ready",
  );
  for (const theme of [
    "coming_soon",
    "under_contract",
    "offer_accepted",
    "just_sold",
  ])
    assert.equal(copyReviewStep({ ...input, theme }), "ready");
  assert.equal(copyReviewStep({ ...input, kind: "holiday" }), "ready");
});
test("editing previously reviewed content requires explicit confirmation again", () => {
  const reviewed = {
    ...input,
    listing: {
      ...input.listing!,
      highlightsModel: "model",
      highlightsReviewed: true,
    },
  };
  assert.equal(copyReviewStep(reviewed), "ready");
  assert.equal(
    copyReviewStep({
      ...reviewed,
      listing: { ...reviewed.listing, highlightsReviewed: false },
    }),
    "confirm",
  );
});
