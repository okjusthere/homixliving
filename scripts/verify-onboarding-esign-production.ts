import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  getESignTemplate,
  type OnboardingESignEntityKey,
} from "../src/lib/esign";
import {
  validateOnboardingESignTemplate,
  validateTeamLeaderESignTemplate,
} from "../src/lib/onboarding-esign-policy";

type PublishedPin = {
  templateId: string;
  templateVersionId: string;
  templateSchemaHash: string;
};

type PinFile = {
  pins: Record<string, PublishedPin>;
};

const pinPath = path.resolve(
  process.cwd(),
  process.env.ESIGN_PIN_FILE || "output/pdf/esign-production-pins.local.json",
);

if (!process.env.ESIGN_API_URL || !process.env.ESIGN_APPLICATION_KEY) {
  throw new Error("ESIGN_API_URL and ESIGN_APPLICATION_KEY are required.");
}

const checks = [
  { key: "homix_realty_agent_solo_apply_new", entityKey: "homix_realty", purpose: "agent", plan: "solo", liborMembershipStatus: "apply_new" },
  { key: "homix_realty_agent_solo_existing_member", entityKey: "homix_realty", purpose: "agent", plan: "solo", liborMembershipStatus: "existing_member" },
  { key: "homix_realty_agent_solo_pro_apply_new", entityKey: "homix_realty", purpose: "agent", plan: "solo_pro", liborMembershipStatus: "apply_new" },
  { key: "homix_realty_agent_solo_pro_existing_member", entityKey: "homix_realty", purpose: "agent", plan: "solo_pro", liborMembershipStatus: "existing_member" },
  { key: "homix_realty_agent_team_member_apply_new", entityKey: "homix_realty", purpose: "agent", plan: "team_member", liborMembershipStatus: "apply_new" },
  { key: "homix_realty_agent_team_member_existing_member", entityKey: "homix_realty", purpose: "agent", plan: "team_member", liborMembershipStatus: "existing_member" },
  { key: "homix_living_agent_solo", entityKey: "homix_living", purpose: "agent", plan: "solo", liborMembershipStatus: null },
  { key: "homix_living_agent_solo_pro", entityKey: "homix_living", purpose: "agent", plan: "solo_pro", liborMembershipStatus: null },
  { key: "homix_living_agent_team_member", entityKey: "homix_living", purpose: "agent", plan: "team_member", liborMembershipStatus: null },
  { key: "homix_realty_team_leader", entityKey: "homix_realty", purpose: "team_leader" },
  { key: "homix_living_team_leader", entityKey: "homix_living", purpose: "team_leader" },
] as const satisfies ReadonlyArray<{
  key: string;
  entityKey: OnboardingESignEntityKey;
  purpose: "agent" | "team_leader";
  plan?: "solo" | "solo_pro" | "team_member";
  liborMembershipStatus?: "apply_new" | "existing_member" | null;
}>;

async function main() {
  const pinFile = JSON.parse(await readFile(pinPath, "utf8")) as PinFile;
  const verified = [];
  for (const check of checks) {
    const pin = pinFile.pins[check.key];
    if (!pin) throw new Error(`Missing production pin: ${check.key}`);
    const template = await getESignTemplate(pin.templateId);
    const result = check.purpose === "agent"
      ? validateOnboardingESignTemplate({
          template,
          expectedVersionId: pin.templateVersionId,
          expectedSchemaHash: pin.templateSchemaHash,
          includeTeamTerms: check.plan === "team_member",
          entityKey: check.entityKey,
          liborMembershipStatus: check.liborMembershipStatus ?? null,
        })
      : validateTeamLeaderESignTemplate({
          template,
          expectedVersionId: pin.templateVersionId,
          expectedSchemaHash: pin.templateSchemaHash,
          entityKey: check.entityKey,
        });
    verified.push({
      key: check.key,
      templateId: pin.templateId,
      versionId: result.version.id,
      schemaHash: result.version.schemaHash,
      pageCount: result.version.documents[0]?.pageCount,
    });
  }

  process.stdout.write(`${JSON.stringify({ status: "verified", templates: verified }, null, 2)}\n`);
}

void main();
