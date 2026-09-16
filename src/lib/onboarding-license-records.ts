import "server-only";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, onboardingEvents } from "@/db/schema";
import { lockOnboardingAgent } from "@/lib/advisory-locks";
import { onboardingEventValues } from "@/lib/onboarding-events";
import { licenseNumberInput, licenseReleaseInput } from "./onboarding-license";

const declarationInput = z.object({ licenseNumber: licenseNumberInput, release: licenseReleaseInput }).strict();
export class LicenseDeclarationConflict extends Error {}

// The ID must come from the authenticated session, never the submitted body.
// Separate from signing facts so an already-signed applicant can still update it.
export async function saveLicenseDeclaration(sessionAgentId: number, input: unknown) {
  const body = declarationInput.parse(input);
  return db.transaction(async (tx) => {
    await lockOnboardingAgent(tx, sessionAgentId);
    const [agent] = await tx.select().from(agents).where(eq(agents.id, sessionAgentId)).for("update");
    if (!agent || agent.accountStatus !== "pending")
      throw new LicenseDeclarationConflict("Only pending accounts can update their release declaration");
    if (agent.licenseNumber?.trim() !== body.licenseNumber)
      throw new LicenseDeclarationConflict("License number changed. Refresh the profile before updating release status.");
    const now = new Date().toISOString();
    const licenseRelease = { ...body.release, licenseNumber: body.licenseNumber, declaredAt: now };
    await tx.update(agents).set({ licenseRelease, updatedAt: now }).where(eq(agents.id, sessionAgentId));
    await tx.insert(onboardingEvents).values(onboardingEventValues({
      agentId: sessionAgentId, actorAgentId: sessionAgentId,
      eventType: "license_release_declared", detail: licenseRelease,
    }));
    return { licenseRelease };
  });
}
