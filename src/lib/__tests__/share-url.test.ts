import assert from "node:assert/strict";
import { publicShareUrl, shareCardVersion } from "@/lib/share-url";

const firstUpdate = "2026-08-06T12:00:00.000Z";
const secondUpdate = "2026-08-06T12:05:00.000Z";

assert.equal(shareCardVersion(null), "1");
assert.equal(shareCardVersion("not-a-date"), "1");
assert.notEqual(shareCardVersion(firstUpdate), shareCardVersion(secondUpdate));

const firstUrl = new URL(publicShareUrl("agent/code", firstUpdate));
const secondUrl = new URL(publicShareUrl("agent/code", secondUpdate));

assert.equal(firstUrl.pathname, "/s/agent%2Fcode");
assert.equal(firstUrl.searchParams.get("card"), "agent-v3");
assert.notEqual(firstUrl.searchParams.get("v"), secondUrl.searchParams.get("v"));

console.log("share URL tests passed");
