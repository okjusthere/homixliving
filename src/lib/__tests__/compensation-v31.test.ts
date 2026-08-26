import assert from "node:assert/strict";
import { computeCompensationV31, transactionFeeFor } from "../compensation-v31";

assert.equal(transactionFeeFor(30_000), 200);
assert.equal(transactionFeeFor(30_001), 500);
assert.equal(transactionFeeFor(100_001), 1_000);

const solo = computeCompensationV31({
  dealType: "sale",
  grossCommission: 10_000,
  source: "self",
  participants: [{ agentId: 1, sharePct: 100, plan: "solo", companyCapUsed: 0 }],
});
assert.equal(solo.companyDollar, 1_500);
assert.equal(solo.transactionFee, 0);
assert.equal(solo.agentNetTotal, 8_500);

const crossing = computeCompensationV31({
  dealType: "sale",
  grossCommission: 10_000,
  source: "self",
  participants: [{ agentId: 1, sharePct: 100, plan: "solo", companyCapUsed: 11_500 }],
});
assert.equal(crossing.companyDollar, 500);
assert.equal(crossing.transactionFee, 0);
assert.equal(crossing.agentNetTotal, 9_500);

const postCap = computeCompensationV31({
  dealType: "sale",
  grossCommission: 40_000,
  source: "self",
  participants: [{ agentId: 1, sharePct: 100, plan: "solo", companyCapUsed: 12_000 }],
});
assert.equal(postCap.companyDollar, 0);
assert.equal(postCap.transactionFee, 500);
assert.equal(postCap.agentNetTotal, 39_500);

const team = computeCompensationV31({
  dealType: "rental",
  grossCommission: 10_000,
  source: "self",
  participants: [{
    agentId: 1,
    sharePct: 100,
    plan: "team_member",
    companyCapUsed: 0,
    teamId: 7,
    teamConfigId: 3,
    teamLeaderAgentId: 2,
    sponsorAgentId: 2,
    teamSplitPct: 10,
    teamCapAmount: null,
  }],
});
assert.equal(team.companyDollar, 1_000);
assert.equal(team.teamAllocation, 900);
assert.equal(team.sponsorAmount, 100);
assert.equal(team.agentNetTotal, 8_100);
assert.equal(team.homixRetained, 900);

const defaultTeamTerms = computeCompensationV31({
  dealType: "rental",
  grossCommission: 10_000,
  source: "self",
  participants: [{
    agentId: 1,
    sharePct: 100,
    plan: "team_member",
    companyCapUsed: 0,
    teamId: 7,
    teamLeaderAgentId: 2,
  }],
});
assert.equal(defaultTeamTerms.teamAllocation, 900);
assert.equal(defaultTeamTerms.allocations[0].teamCapAmount, undefined);
assert.equal(defaultTeamTerms.agentNetTotal, 8_100);

const noTeamSplit = computeCompensationV31({
  dealType: "rental",
  grossCommission: 10_000,
  source: "self",
  participants: [{
    agentId: 1,
    sharePct: 100,
    plan: "team_member",
    companyCapUsed: 0,
    teamId: 7,
    teamLeaderAgentId: 2,
    teamSplitPct: 0,
  }],
});
assert.equal(noTeamSplit.teamAllocation, 0);
assert.equal(noTeamSplit.agentNetTotal, 9_000);

const lead = computeCompensationV31({
  dealType: "rental",
  grossCommission: 10_000,
  source: "homix_rental",
  participants: [{ agentId: 1, sharePct: 100, plan: "solo", companyCapUsed: 0, sponsorAgentId: 9 }],
});
assert.equal(lead.sourceFee, 1_500);
assert.equal(lead.commissionBase, 8_500);
assert.equal(lead.companyDollar, 1_275);
assert.equal(lead.sponsorAmount, 277.5);
assert.equal(lead.agentNetTotal, 7_225);

const outside = computeCompensationV31({
  dealType: "sale",
  grossCommission: 10_000,
  source: "outside",
  outsideReferralAmount: 2_500,
  participants: [{ agentId: 1, sharePct: 100, plan: "solo", companyCapUsed: 0, sponsorAgentId: 9 }],
});
assert.equal(outside.outsideReferral, 2_500);
assert.equal(outside.companyDollar, 1_125);
assert.equal(outside.sponsorAmount, 112.5);

console.log("compensation v3.1 tests passed");
