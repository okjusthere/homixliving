import assert from "node:assert/strict";
import { isFullCompensationReceipt, obligationsForAllocation } from "../compensation-ledger";

const rows = obligationsForAllocation({
  id: 7,
  snapshotId: 3,
  agentId: 11,
  teamLeaderAgentId: 22,
  sponsorAgentId: 22,
  agentNet: 8_100,
  teamLeaderAllocation: 900,
  sponsorAmount: 100,
});

assert.deepEqual(rows.map((row) => [row.kind, row.recipientAgentId, row.amountCents]), [
  ["agent_net", 11, 810_000],
  ["team_split", 22, 90_000],
  ["sponsor_reward", 22, 10_000],
]);
assert.equal(rows.filter((row) => row.recipientAgentId === 22).length, 2);
assert.equal(isFullCompensationReceipt(3_702.03, 370_202), false);
assert.equal(isFullCompensationReceipt(3_702.03, 370_203), true);
assert.equal(isFullCompensationReceipt(3_702.03, 400_000), true);

console.log("compensation ledger tests passed");
