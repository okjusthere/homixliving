import assert from "node:assert/strict";
import { test } from "node:test";
import { inputSchema } from "../validation";
import { contentValidationMessage, movePhoto } from "../form-state";
const photo = "c207609c-3566-49e1-bcfe-4577fe34d945";
const input = {
  kind: "listing",
  theme: "coming_soon",
  language: "zh",
  size: "1024x1280",
  includePortrait: false,
  listing: {
    source: "mls",
    address: "2 Lee Place",
    price: "",
    imageAssetIds: [photo],
  },
  event: { date: "", start: "", end: "", timezone: "America/New_York" },
  holidayDate: "",
};
test("all non-Open-House themes ignore hidden empty dates from imported listings", () => {
  for (const theme of [
    "coming_soon",
    "just_listed",
    "under_contract",
    "offer_accepted",
    "just_sold",
  ]) {
    const parsed = inputSchema.parse({ ...input, theme });
    assert.equal(parsed.event, undefined);
    assert.equal(parsed.holidayDate, undefined);
    assert.equal(parsed.listing?.address, "2 Lee Place");
  }
});
test("holiday posters ignore leftover empty listing fields but validate selected holiday dates", () => {
  const holiday = {
    ...input,
    kind: "holiday",
    theme: "christmas",
    listing: { ...input.listing, address: "", imageAssetIds: [] },
  };
  const parsed = inputSchema.parse(holiday);
  assert.equal(parsed.listing, undefined);
  assert.equal(parsed.event, undefined);
  assert.equal(
    inputSchema.safeParse({ ...holiday, holidayDate: "2026-02-30" }).success,
    false,
  );
});
test("Open House still requires a valid date and increasing time range, with useful messages", () => {
  const invalid = inputSchema.safeParse({ ...input, theme: "open_house" });
  assert.equal(invalid.success, false);
  if (!invalid.success) {
    const message = contentValidationMessage(invalid.error.issues);
    assert.match(message, /Open House 日期/);
    assert.match(message, /开始时间/);
    assert.doesNotMatch(message, /pattern|Too small/);
  }
  assert.equal(
    inputSchema.safeParse({
      ...input,
      theme: "open_house",
      event: {
        ...input.event,
        date: "2026-09-12",
        start: "13:00",
        end: "15:00",
      },
    }).success,
    true,
  );
});
test("missing property details name both the address and photo requirements", () => {
  const result = inputSchema.safeParse({
    ...input,
    listing: { ...input.listing, address: "", imageAssetIds: [] },
  });
  assert.equal(result.success, false);
  if (!result.success) {
    const message = contentValidationMessage(result.error.issues);
    assert.match(message, /房源地址/);
    assert.match(message, /房源照片/);
  }
});
test("deselected unfinished highlights do not block generation; selected ones still do", () => {
  const blank = { en: "", zh: "", evidence: "", selected: false };
  const make = (selected: boolean) => ({
    ...input,
    theme: "just_listed",
    listing: { ...input.listing, highlights: [{ ...blank, selected }] },
  });
  assert.deepEqual(inputSchema.parse(make(false)).listing?.highlights, []);
  assert.equal(inputSchema.safeParse(make(true)).success, false);
});
test("photo reorder preserves every asset exactly once and validation keeps the chosen hero order", () => {
  const ids = [
    photo,
    "fd3695d3-940e-4114-8516-4f6800a817ef",
    "517d2607-29d4-44c9-8dca-13f6b08a846a",
  ];
  const moved = movePhoto(ids, ids[2], ids[0]);
  assert.deepEqual(moved, [ids[2], ids[0], ids[1]]);
  assert.deepEqual(ids, [photo, ids[1], ids[2]]);
  assert.deepEqual(movePhoto(moved, ids[2], ids[1]), ids);
  assert.equal(movePhoto(ids, "missing", ids[0]), ids);
  assert.deepEqual(
    inputSchema.parse({
      ...input,
      listing: { ...input.listing, imageAssetIds: moved },
    }).listing?.imageAssetIds,
    moved,
  );
});

test("brief poster themes ignore hidden invalid financial and highlight fields", () => {
  for (const theme of [
    "coming_soon",
    "under_contract",
    "offer_accepted",
    "just_sold",
  ]) {
    const parsed = inputSchema.parse({
      ...input,
      theme,
      listing: {
        ...input.listing,
        highlights: [{ en: "", zh: "", evidence: "", selected: true }],
        financialFacts: [{ en: "", zh: "", evidence: "", selected: true }],
        associationFee: "100",
        associationFeeFrequency: "",
        highlightsReviewed: false,
      },
    });
    assert.equal(parsed.listing?.financialFacts, undefined);
    assert.equal(parsed.listing?.highlights, undefined);
  }
});

test("validation identifies the selected row, language and corrective action", () => {
  const text = contentValidationMessage([
    {
      path: ["listing", "highlights", 1, "zh"],
      code: "too_small",
      message: "Too small",
    },
  ]);
  assert.match(text, /已选第 2 条.*中文内容.*补全/);
  const long = contentValidationMessage([
    { path: ["message"], code: "too_big", maximum: 2000, message: "Too big" },
  ]);
  assert.match(long, /个人寄语.*2000/);
});
