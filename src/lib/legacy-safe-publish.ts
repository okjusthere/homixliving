import "server-only";
import { publishPublicProfile as publish } from "@/lib/homixweb";
import { hasReservedLegacyProfile } from "@/lib/legacy-agent-claims";

export async function publishPublicProfile(input: Parameters<typeof publish>[0]) {
  if (await hasReservedLegacyProfile(input.license, input.agentId)) {
    return { ok: false, status: 409, body: { error: "An existing website profile is reserved for this license. Claim or explicitly link that profile instead of publishing another." } };
  }
  return publish(input);
}
