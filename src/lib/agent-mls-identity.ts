/** MLS is the office-approved authority for legal identity, never for a nickname. */
export type MlsIdentityMember = {
  memberKey: string;
  memberMlsId: string;
  fullName: string;
  firstName: string;
  lastName: string;
  stateLicense: string;
  email?: string;
};

const clean = (value: string | null | undefined) => (value || "").trim().replace(/\s+/gu, " ");
const folded = (value: string) => clean(value).toLocaleLowerCase("en-US");

export function mlsLegalName(member: MlsIdentityMember): string | null {
  const first = clean(member.firstName), last = clean(member.lastName), full = clean(member.fullName);
  if (!first || !last || !full) return null;
  const structured = `${first} ${last}`;
  if (folded(full) === folded(structured)) return full;
  // Retain middle names/initials, which firstName/lastName alone can omit.
  if (folded(full).startsWith(`${folded(first)} `) && folded(full).endsWith(` ${folded(last)}`)) return full;
  // These observed designation tokens follow the structured name, not its surname.
  if (folded(full).startsWith(`${folded(structured)} `)) {
    const suffix = full.slice(structured.length).trim().split(" ");
    if (suffix.length && suffix.every((part) => ["CBR", "GRI", "ABR"].includes(part))) return structured;
  }
  return null; // Inconsistent source fields require review, not a guessed legal name.
}

export function matchMlsIdentity(
  hints: { mlsId?: string | null; portalLicense?: string | null; publicLicense?: string | null; verifiedEmails?: string[] },
  members: MlsIdentityMember[],
): { member: MlsIdentityMember | null; reason: string } {
  const byId = hints.mlsId ? members.filter((m) => m.memberMlsId === clean(hints.mlsId)) : [];
  if (hints.mlsId && byId.length !== 1) return { member: null, reason: "MLS_ID_MISSING_OR_AMBIGUOUS" };
  const hits = [hints.portalLicense, hints.publicLicense].filter(Boolean).map((license) =>
    members.filter((m) => clean(m.stateLicense) === clean(license)),
  );
  if (hits.some((list) => list.length > 1)) return { member: null, reason: "LICENSE_AMBIGUOUS" };
  const byEmail = members.filter((m) => m.email && hints.verifiedEmails?.some((email) => folded(email) === folded(m.email!)));
  if (byEmail.length > 1) return { member: null, reason: "EMAIL_AMBIGUOUS" };
  const unique = new Map([...byId, ...hits.flat(), ...byEmail].map((m) => [m.memberMlsId, m]));
  if (unique.size !== 1) return { member: null, reason: unique.size ? "IDENTITY_CONFLICT" : "NO_EXACT_MATCH" };
  const member = [...unique.values()][0];
  if (!/^\d{11}$/.test(clean(member.stateLicense)) || !mlsLegalName(member)) return { member: null, reason: "SOURCE_FIELDS_REQUIRE_REVIEW" };
  return { member, reason: byId.length ? "EXPLICIT_MLS_ID" : hits.flat().length ? "EXACT_LICENSE" : "VERIFIED_EMAIL" };
}
