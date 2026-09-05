import assert from "node:assert/strict";
import {
  onboardingEntryFromSearchParams,
  onboardingEntryForSignIn,
  readOnboardingEntryContext,
  serializeOnboardingEntry,
} from "@/lib/onboarding-entry";

const website = onboardingEntryFromSearchParams(
  new URLSearchParams("source=homix-web&lang=zh&plan=solo_pro&utm_campaign=fall_recruiting"),
);
assert.deepEqual(website, {
  source: "website",
  locale: "zh",
  plan: "solo_pro",
  campaign: "fall_recruiting",
});
assert.deepEqual(readOnboardingEntryContext(serializeOnboardingEntry(website)), website);
assert.match(serializeOnboardingEntry(website), /^[A-Za-z0-9_-]+$/);
assert.equal(onboardingEntryForSignIn(serializeOnboardingEntry(website), true), null);
assert.deepEqual(onboardingEntryForSignIn(serializeOnboardingEntry(website), false), website);

const untrusted = onboardingEntryFromSearchParams(
  new URLSearchParams("source=admin&lang=fr&plan=team_leader&utm_campaign=<script>"),
);
assert.deepEqual(untrusted, {
  source: "direct",
  locale: "en",
  plan: null,
  campaign: null,
});

assert.equal(readOnboardingEntryContext("not-json"), null);
assert.equal(
  readOnboardingEntryContext(
    Buffer.from(JSON.stringify({
      source: "website",
      locale: "zh",
      plan: "team_leader",
      campaign: null,
    }), "utf8").toString("base64url"),
  ),
  null,
);

console.log("onboarding entry tests passed");
