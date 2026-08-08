import assert from "node:assert/strict";
import { curatedShareCatalogItem } from "../homixweb";

const chinese = curatedShareCatalogItem("/zh/open-houses?from=portal", "zh");
assert.ok(chinese);
assert.equal(chinese.kind, "listing");
assert.equal(chinese.key, "open-houses");
assert.equal(chinese.path, "/open-houses");
assert.equal(chinese.title, "Homix 本周开放日");
assert.match(chinese.image || "", /^https?:\/\//);

const english = curatedShareCatalogItem("/open-houses", "en");
assert.ok(english);
assert.equal(english.title, "Homix Open Houses This Week");

assert.equal(curatedShareCatalogItem("/listings/example", "zh"), null);

console.log("share catalog tests passed");
