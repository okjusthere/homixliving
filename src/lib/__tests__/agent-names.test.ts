import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanAgentName, hasSignedNameBasis, validAgentName, websiteAgentName } from "../agent-names";
import { bindSigningAgentNames, LegalNameRequired, requireLegalName } from "../signing-agent-names";
import type { SigningPackage } from "../signing-contract";

test("website omits the repeated surname but keeps the complete stored Preferred name", () => {
  const grace = { legalName: "Jiaer Xia", name: "Grace Xia" };
  assert.equal(websiteAgentName(grace), "Jiaer Xia (Grace)");
  assert.equal(grace.name, "Grace Xia", "Portal/poster identity is not shortened");
  assert.equal(websiteAgentName({ legalName: "Jiaer Xia", name: "Grace" }), "Jiaer Xia (Grace)");
  assert.equal(websiteAgentName({ legalName: "Si Zhang", name: "Sunny Zhang" }), "Si Zhang (Sunny)");
  assert.equal(websiteAgentName({ legalName: " Jiaer  Xia ", name: " Grace  XIA " }), "Jiaer Xia (Grace)");
});

test("website handles compound names without guessing different or reversed surnames", () => {
  assert.equal(websiteAgentName({ legalName: "Juan de la Cruz", name: "Johnny de la Cruz" }), "Juan de la Cruz (Johnny)");
  assert.equal(websiteAgentName({ legalName: "Mary Smith-Jones", name: "May Smith-Jones" }), "Mary Smith-Jones (May)");
  assert.equal(websiteAgentName({ legalName: "Jiaer Xia", name: "Grace Lee" }), "Jiaer Xia (Grace Lee)");
  assert.equal(websiteAgentName({ legalName: "Jingjing Feng", name: "Feng Jingjing" }), "Jingjing Feng (Feng Jingjing)");
  assert.equal(websiteAgentName({ legalName: "Xia", name: "Grace Xia" }), "Xia (Grace Xia)");
});

test("website does not double identical names or invent missing legal identity", () => {
  assert.equal(websiteAgentName({ legalName: "Heidi Liu", name: "heidi liu" }), "Heidi Liu");
  assert.equal(websiteAgentName({ legalName: null, name: "Grace Xia" }), "Grace Xia");
  assert.equal(websiteAgentName({ legalName: " 李今朝 ", name: "李今朝" }), "李今朝");
});

test("names are Unicode text with a bounded size; no control characters or fake legal fallback", () => {
  assert.equal(cleanAgentName("  Grace   Xia  "), "Grace Xia");
  for (const value of [null, 12, {}, "", "  ", "a".repeat(201), "Grace\u0000"]) assert.equal(validAgentName(value), false);
  assert.equal(validAgentName("O’Connor 李"), true);
  assert.throws(() => requireLegalName({ legalName: null }), LegalNameRequired);
  assert.throws(() => requireLegalName({ legalName: " " }), LegalNameRequired);
  assert.equal(requireLegalName({ legalName: "Jiaer Xia" }), "Jiaer Xia");
});

test("signed legacy legal fallback cannot drift when a preferred name changes", () => {
  assert.equal(hasSignedNameBasis({ agreementStatus: "not_started" }), false);
  assert.equal(hasSignedNameBasis({ agreementStatus: "sent" }), true);
  assert.equal(hasSignedNameBasis({ agreementStatus: "completed" }), true);
  assert.equal(hasSignedNameBasis({ onboardingManualContract: { legalName: "Jiaer Xia" } }), true);
  assert.equal(hasSignedNameBasis({ signingPreparation: {} }), true);
});

const published = { definition: [{ roles: [
  { key: "agent", actor: "owner" }, { key: "co_agent", actor: "owner" },
  { key: "buyer", actor: "customer" }, { key: "company", actor: "company" },
] }] } as Pick<SigningPackage, "definition">;

test("all owner-role signatures and agent_name use server Legal name, not browser Preferred name", () => {
  const input = { recipients: [
    { key: "agent", name: "Grace", email: "agent@example.invalid" },
    { key: "co_agent", name: "Spoofed", email: "alias@example.invalid" },
    { key: "buyer", name: "Buyer Legal", email: "buyer@example.invalid" },
    { key: "company", name: "Company Signer" },
  ], values: { agent_name: "Spoofed", customer_name: "Buyer Legal", price: "123" } };
  const result = bindSigningAgentNames(input, published, { legalName: "Jiaer Xia" });
  assert.deepEqual(result.recipients, [
    { key: "agent", name: "Jiaer Xia", email: "agent@example.invalid" },
    { key: "co_agent", name: "Jiaer Xia", email: "alias@example.invalid" },
    input.recipients[2], input.recipients[3],
  ]);
  assert.deepEqual(result.values, { agent_name: "Jiaer Xia", customer_name: "Buyer Legal", price: "123" });
  assert.equal(input.values.agent_name, "Spoofed", "never mutate prior snapshots or the caller's payload");
  assert.throws(() => bindSigningAgentNames(input, published, { legalName: null }), LegalNameRequired);
});

test("packages without an owner signature still use Legal name in their agent prefill", () => {
  const result = bindSigningAgentNames({ values: {} }, { definition: [] }, { legalName: "Jiaer Xia" });
  assert.equal(result.values.agent_name, "Jiaer Xia");
});
