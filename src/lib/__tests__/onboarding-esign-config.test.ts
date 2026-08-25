import assert from "node:assert/strict";
import {
  isOnboardingESignConfigured,
  onboardingESignTemplateConfiguration,
  resolveOnboardingESignEntity,
  isTeamLeaderESignConfigured,
  teamLeaderESignTemplateConfiguration,
} from "../esign";

const ENV_KEYS = [
  "ESIGN_API_URL",
  "ESIGN_APPLICATION_KEY",
  "ESIGN_ONBOARDING_HOMIX_REALTY_TEMPLATE_ID",
  "ESIGN_ONBOARDING_HOMIX_REALTY_TEMPLATE_VERSION_ID",
  "ESIGN_ONBOARDING_HOMIX_REALTY_TEMPLATE_SCHEMA_HASH",
  "ESIGN_ONBOARDING_HOMIX_REALTY_COUNTERSIGNER_NAME",
  "ESIGN_ONBOARDING_HOMIX_REALTY_COUNTERSIGNER_EMAIL",
  "ESIGN_ONBOARDING_HOMIX_LIVING_TEMPLATE_ID",
  "ESIGN_ONBOARDING_HOMIX_LIVING_TEMPLATE_VERSION_ID",
  "ESIGN_ONBOARDING_HOMIX_LIVING_TEMPLATE_SCHEMA_HASH",
  "ESIGN_TEAM_LEADER_HOMIX_REALTY_TEMPLATE_ID",
  "ESIGN_TEAM_LEADER_HOMIX_REALTY_TEMPLATE_VERSION_ID",
  "ESIGN_TEAM_LEADER_HOMIX_REALTY_TEMPLATE_SCHEMA_HASH",
] as const;

const original = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

try {
  for (const key of ENV_KEYS) delete process.env[key];

  assert.equal(resolveOnboardingESignEntity("Homix Realty Inc.")?.key, "homix_realty");
  assert.equal(resolveOnboardingESignEntity("  HOMIX-LIVING, INC  ")?.key, "homix_living");
  assert.equal(resolveOnboardingESignEntity("AIREA LLC"), null);

  process.env.ESIGN_API_URL = "https://esign.example.com/";
  process.env.ESIGN_APPLICATION_KEY = "test-key";
  process.env.ESIGN_ONBOARDING_HOMIX_REALTY_TEMPLATE_ID = "realty-template";
  process.env.ESIGN_ONBOARDING_HOMIX_REALTY_TEMPLATE_VERSION_ID = "realty-version";
  process.env.ESIGN_ONBOARDING_HOMIX_REALTY_TEMPLATE_SCHEMA_HASH = "realty-hash";
  process.env.ESIGN_ONBOARDING_HOMIX_REALTY_COUNTERSIGNER_NAME = "Realty Broker";
  process.env.ESIGN_ONBOARDING_HOMIX_REALTY_COUNTERSIGNER_EMAIL = "broker@example.com";

  assert.equal(isOnboardingESignConfigured("Homix Realty Inc."), true);
  assert.equal(isOnboardingESignConfigured("Homix Living Inc."), false);
  assert.equal(isOnboardingESignConfigured("Unknown Company"), false);
  assert.equal(isTeamLeaderESignConfigured("Homix Realty Inc."), false);

  process.env.ESIGN_TEAM_LEADER_HOMIX_REALTY_TEMPLATE_ID = "leader-template";
  process.env.ESIGN_TEAM_LEADER_HOMIX_REALTY_TEMPLATE_VERSION_ID = "leader-version";
  process.env.ESIGN_TEAM_LEADER_HOMIX_REALTY_TEMPLATE_SCHEMA_HASH = "leader-hash";
  assert.equal(isTeamLeaderESignConfigured("Homix Realty Inc."), true);
  assert.equal(teamLeaderESignTemplateConfiguration("Homix Realty Inc.")?.templateId, "leader-template");

  const realty = onboardingESignTemplateConfiguration("homix realty");
  assert.deepEqual(realty, {
    entityKey: "homix_realty",
    legalEntityName: "Homix Realty Inc.",
    templateId: "realty-template",
    templateVersionId: "realty-version",
    templateSchemaHash: "realty-hash",
    countersignerName: "Realty Broker",
    countersignerEmail: "broker@example.com",
  });
} finally {
  for (const key of ENV_KEYS) {
    const value = original.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

console.log("onboarding eSign config tests passed");
