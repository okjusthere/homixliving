import assert from "node:assert/strict";
import test from "node:test";
import { listingEvents, type StudioListing } from "../listing-source";
import {
  contentEvents,
  eventWeekday,
  newOpenHouseEvent,
  posterEvents,
} from "../events";
import { inputSchema } from "../validation";
import { contentValidationMessage } from "../form-state";
import { buildPosterPrompt } from "../prompts";
import { initialTemplates } from "../catalog";
import type { BrandContext, ContentInput } from "../types";

const saturday = {
  date: "2026-09-12",
  start: "13:00",
  end: "15:00",
  timezone: "America/New_York",
};
const sunday = {
  ...saturday,
  date: "2026-09-13",
  start: "14:00",
  end: "16:00",
};
const input: ContentInput = {
  kind: "listing",
  theme: "open_house",
  language: "zh",
  size: "1024x1280",
  includePortrait: false,
  headline: "",
  message: "",
  additionalInstructions: "",
  listing: {
    source: "mls",
    address: "2 Lee Place",
    price: "",
    imageAssetIds: ["c207609c-3566-49e1-bcfe-4577fe34d945"],
  },
  events: [saturday, sunday],
};

test("imports every valid future MLS session in order, deduplicating without losing Sunday", () => {
  const listing = {
    openHouses: [
      {
        id: "sun",
        startsAt: "2026-09-13T18:00:00Z",
        endsAt: "2026-09-13T20:00:00Z",
      },
      { id: "invalid", startsAt: "bad-date", endsAt: "2026-09-13T20:00:00Z" },
      {
        id: "past",
        startsAt: "2026-09-05T17:00:00Z",
        endsAt: "2026-09-05T19:00:00Z",
      },
      {
        id: "sat",
        startsAt: "2026-09-12T17:00:00Z",
        endsAt: "2026-09-12T19:00:00Z",
      },
      {
        id: "duplicate",
        startsAt: "2026-09-12T17:00:00Z",
        endsAt: "2026-09-12T19:00:00Z",
      },
    ],
  } as StudioListing;
  assert.deepEqual(listingEvents(listing, Date.parse("2026-09-11")), [
    saturday,
    sunday,
  ]);
});

test("adding a day preserves hours and rolls calendars safely across DST and year boundaries", () => {
  assert.deepEqual(newOpenHouseEvent(saturday), {
    ...saturday,
    date: "2026-09-13",
    selected: true,
  });
  assert.equal(
    newOpenHouseEvent({ ...saturday, date: "2026-12-31" }).date,
    "2027-01-01",
  );
  assert.equal(
    newOpenHouseEvent({ ...saturday, date: "2026-03-07" }).date,
    "2026-03-08",
  );
  assert.equal(eventWeekday(sunday.date, "zh"), "星期日");
  assert.equal(newOpenHouseEvent().date, "");
  assert.equal(newOpenHouseEvent().start, "13:00");
});

test("legacy saved work normalizes without reviving explicitly removed sessions", () => {
  const legacy = { ...input, events: undefined, event: saturday };
  assert.equal(inputSchema.parse(legacy).events?.[0].date, saturday.date);
  assert.deepEqual(contentEvents(legacy), [saturday]);
  assert.deepEqual(contentEvents({ ...legacy, events: [] }), []);
  assert.equal(inputSchema.safeParse({ ...legacy, events: [] }).success, false);
});

test("validation identifies the actual second row, ignores deselected drafts and rejects duplicates", () => {
  const invalid = { ...sunday, end: "12:00" };
  const result = inputSchema.safeParse({
    ...input,
    events: [saturday, invalid],
  });
  assert.equal(result.success, false);
  if (!result.success)
    assert.match(
      contentValidationMessage(result.error.issues),
      /第 2 场公展.*结束时间.*开始时间.*修改/,
    );
  assert.equal(
    inputSchema.safeParse({
      ...input,
      events: [saturday, { ...invalid, date: "", selected: false }],
    }).success,
    true,
  );
  assert.equal(
    inputSchema.safeParse({ ...input, events: [saturday, saturday] }).success,
    false,
  );
  assert.equal(
    inputSchema.safeParse({
      ...input,
      events: [{ ...saturday, selected: false }],
    }).success,
    false,
  );
  const badDate = inputSchema.safeParse({
    ...input,
    events: [saturday, { ...sunday, date: "2026-02-30" }],
  });
  assert.equal(badDate.success, false);
  if (!badDate.success)
    assert.match(
      contentValidationMessage(badDate.error.issues),
      /第 2 场公展.*有效的公展日期/,
    );
});

test("both language prompts contain both exact schedules, exclude unselected sessions and hide events on other themes", () => {
  const template = initialTemplates().find(
    (t) => t.key === "open_house-editorial",
  )!.config;
  const brand = {
    name: "Agent",
    title: "Agent",
    companyName: "Homix Realty Inc.",
    email: "agent@example.com",
    phone: "",
    licenseNumber: "",
  } as BrandContext;
  for (const language of ["zh", "en"] as const) {
    const value = {
      ...input,
      language,
      events: [
        sunday,
        saturday,
        { ...saturday, date: "2026-09-20", selected: false },
      ],
    };
    const parsed = inputSchema.parse(value);
    assert.deepEqual(
      posterEvents(parsed)?.map((e) => [e.date, e.start, e.end]),
      [
        [saturday.date, "13:00", "15:00"],
        [sunday.date, "14:00", "16:00"],
      ],
    );
    const prompt = buildPosterPrompt(template, parsed, brand);
    assert.match(prompt, /2026-09-12/);
    assert.match(prompt, /2026-09-13/);
    assert.doesNotMatch(prompt, /2026-09-20/);
    assert.match(prompt, /EVERY supplied event on this SAME poster/);
    assert.match(prompt, language === "zh" ? /星期六/ : /Saturday/);
  }
  assert.equal(
    inputSchema.parse({ ...input, theme: "just_listed" }).events,
    undefined,
  );
  assert.equal(posterEvents({ ...input, theme: "just_sold" }), undefined);
});
