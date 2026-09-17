import assert from "node:assert/strict";
import { test } from "node:test";
import { officeDefaults, readOfficeDefaults, officeListingInput, officeLanguages, needsOfficeHighlights, officeDraftProblems } from "../office-production";
import { officeDraftInputSchema } from "../office-draft-schema";
import { inputSchema } from "../validation";
import { newOpenHouseEvent } from "../events";
import type { StudioListing } from "../listing-source";
const listing: StudioListing = { id: "test", slug: "test", mlsNumber: "123", status: "Active", address: { full: "100 Test Ave" }, listPrice: 900000, askingPrice: 900000, beds: 3, baths: 2, sqft: 1400, description: "Bright kitchen with patio", photos: [] };
const asset = "0dbbba86-57ec-431d-9699-f6df74a9e385";
test("office bulk settings control theme, image count and language without a fixed Just Listed default", () => {
  const input = officeListingInput(listing, asset, { ...officeDefaults, theme: "under_contract", language: "both", style: "modern" }, []);
  assert.equal(input.theme, "under_contract");
  assert.deepEqual(officeLanguages("both"), ["zh", "en"]);
  assert.equal(needsOfficeHighlights(input.theme), false);
  assert.equal(needsOfficeHighlights("open_house"), true);
  assert.equal(needsOfficeHighlights("just_listed"), true);
});
test("office import never uses asking price as a sold price", () => {
  assert.equal(officeListingInput(listing, asset, { ...officeDefaults, theme: "just_sold" }, []).listing?.price, "");
});
test("missing Open House sessions save only as office drafts; generation stays blocked with a remedy", () => {
  const input = officeListingInput(listing, asset, { ...officeDefaults, theme: "open_house" }, [newOpenHouseEvent()]);
  assert.equal(officeDraftInputSchema.parse(input).theme, "open_house");
  assert.equal(inputSchema.safeParse(input).success, false);
  assert.match(officeDraftProblems(input, true)[0], /待补公展日期或时间/);
});
test("both batch sessions survive and invalid times are rejected even in office drafts", () => {
  const events = [{ ...newOpenHouseEvent(), date: "2026-09-19" }, { ...newOpenHouseEvent(), date: "2026-09-20" }];
  const input = officeListingInput(listing, asset, { ...officeDefaults, theme: "open_house" }, events);
  assert.equal(inputSchema.parse(input).events?.length, 2);
  assert.equal(input.events?.[0].start, "13:00");
  assert.equal(officeDraftInputSchema.safeParse({ ...input, events: [{ ...events[0], end: "12:00" }] }).success, false);
  assert.equal(officeDraftInputSchema.safeParse({ ...input, listing: { ...input.listing, imageAssetIds: [] } }).success, false);
});
test("office preferences recover safely from corrupt/unsupported session data", () => {
  assert.deepEqual(readOfficeDefaults("broken"), officeDefaults);
  assert.deepEqual(readOfficeDefaults('{"theme":"unknown","language":"xx","size":"1x1"}'), officeDefaults);
  assert.equal(readOfficeDefaults('{"theme":"open_house","language":"en"}').theme, "open_house");
});

test("office Open House defaults import each listing's own future sessions; override is explicit", () => {
  const source = { ...listing, openHouses: [
    { id: "sat", startsAt: "2099-09-19T17:00:00Z", endsAt: "2099-09-19T19:00:00Z" },
    { id: "sun", startsAt: "2099-09-20T18:00:00Z", endsAt: "2099-09-20T20:00:00Z" },
  ] };
  const input = officeListingInput(source, asset, { ...officeDefaults, theme: "open_house" });
  assert.deepEqual(input.events?.map((e) => [e.date, e.start, e.end]), [["2099-09-19", "13:00", "15:00"], ["2099-09-20", "14:00", "16:00"]]);
  const other = officeListingInput({ ...source, openHouses: [source.openHouses[1]] }, asset, { ...officeDefaults, theme: "open_house" });
  assert.equal(other.events?.length, 1);
  assert.equal(other.events?.[0].start, "14:00");
  assert.deepEqual(officeListingInput(source, asset, { ...officeDefaults, theme: "open_house" }, []).events, []);
});
