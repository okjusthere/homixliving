import assert from "node:assert/strict";
import { computeOnboarding, ONBOARDING_LABELS } from "../onboarding-progress";

const complete = {
  accountStatus: "active",
  licenseNumber: "10401234567",
  publicProfile: { photoUrl: "https://cdn/x.jpg", bio: "Ten years in Queens." },
  payment: {
    routingNumber: "021000021",
    accountNumber: "123456789",
    payeeName: "Grace Xia LLC",
    w9ObjectKey: "w9/grace.pdf",
  },
};

// A brand-new signup has nothing done yet.
{
  const r = computeOnboarding({});
  assert.equal(r.completed, 0);
  assert.equal(r.percent, 0);
  assert.equal(r.complete, false);
  // Account approval and profile linking are an admin's job, so they must not
  // show up in the agent's own to-do list.
  assert.deepEqual(
    r.remainingSelfServe.map((s) => s.id).sort(),
    ["bio", "license", "payout", "photo", "w9"],
  );
}

// Fully set up.
{
  const r = computeOnboarding(complete);
  assert.equal(r.complete, true);
  assert.equal(r.percent, 100);
  assert.equal(r.remainingSelfServe.length, 0);
}

// The placeholder headshot must count as missing — it's the gap most visible
// on the public site.
{
  const r = computeOnboarding({
    ...complete,
    publicProfile: { photoUrl: "/agent-placeholder-logo.png", bio: "Hi." },
  });
  assert.equal(r.steps.find((s) => s.id === "photo")!.done, false);
  assert.equal(r.complete, false);
}

// Partial bank details don't make someone payable.
{
  const r = computeOnboarding({
    ...complete,
    payment: { routingNumber: "021000021", accountNumber: "", payeeName: "X", w9ObjectKey: "k" },
  });
  assert.equal(r.steps.find((s) => s.id === "payout")!.done, false);
}

// Whitespace is not a bio, and not a licence number.
{
  const r = computeOnboarding({
    ...complete,
    licenseNumber: "   ",
    publicProfile: { photoUrl: "https://cdn/x.jpg", bio: "  \n " },
  });
  assert.equal(r.steps.find((s) => s.id === "license")!.done, false);
  assert.equal(r.steps.find((s) => s.id === "bio")!.done, false);
}

// A pending account is not an approved one.
{
  const r = computeOnboarding({ ...complete, accountStatus: "pending" });
  assert.equal(r.steps.find((s) => s.id === "account")!.done, false);
}

// hasPublicProfile stands in when the profile body wasn't fetched.
{
  const r = computeOnboarding({ hasPublicProfile: true });
  assert.equal(r.steps.find((s) => s.id === "publicProfile")!.done, true);
  assert.equal(r.steps.find((s) => s.id === "photo")!.done, false);
}

// Every step needs copy in both locales, so a new step can't ship unlabelled.
{
  const ids = computeOnboarding({}).steps.map((s) => s.id);
  for (const locale of ["en", "zh"] as const) {
    for (const id of ids) {
      assert.ok(
        ONBOARDING_LABELS[locale][id]?.length > 0,
        `missing ${locale} label for ${id}`,
      );
    }
  }
}

console.log("onboarding progress tests passed");
