import assert from "node:assert/strict";
import { test } from "node:test";
import { matchMlsIdentity, mlsLegalName, type MlsIdentityMember } from "../agent-mls-identity";

const member: MlsIdentityMember = { memberKey: "KEY1", memberMlsId: "KEY2", fullName: "Jiaer Xia", firstName: "Jiaer", lastName: "Xia", stateLicense: "10401347048" };
test("MLS legal name retains middle initials and compound surnames but excludes explicit designations", () => {
  assert.equal(mlsLegalName(member), "Jiaer Xia");
  assert.equal(mlsLegalName({ ...member, fullName: "Xuehui S. Lin", firstName: "Xuehui", lastName: "Lin" }), "Xuehui S. Lin");
  assert.equal(mlsLegalName({ ...member, fullName: "Yunhang Hou Lu", firstName: "Yunhang", lastName: "Hou Lu" }), "Yunhang Hou Lu");
  assert.equal(mlsLegalName({ ...member, fullName: "Aihui Cheng CBR GRI ABR", firstName: "Aihui", lastName: "Cheng" }), "Aihui Cheng");
  assert.equal(mlsLegalName({ ...member, fullName: "Grace Xia" }), null);
  assert.equal(mlsLegalName({ ...member, fullName: "Jiaer Xia Unknown" }), null);
});
test("exact MLS linkage can correct a typo, but conflicting real identities never get merged", () => {
  const other = { ...member, memberMlsId: "KEY3", stateLicense: "10401347049" };
  assert.equal(matchMlsIdentity({ mlsId: "KEY2", publicLicense: "20401347048" }, [member]).member, member);
  assert.equal(matchMlsIdentity({ portalLicense: member.stateLicense }, [member]).member, member);
  assert.equal(matchMlsIdentity({ mlsId: "KEY2", portalLicense: other.stateLicense }, [member, other]).reason, "IDENTITY_CONFLICT");
  assert.equal(matchMlsIdentity({ mlsId: "KEY999", portalLicense: member.stateLicense }, [member]).member, null);
  assert.equal(matchMlsIdentity({}, [member]).member, null);
  assert.equal(matchMlsIdentity({ portalLicense: member.stateLicense }, [member, { ...other, stateLicense: member.stateLicense }]).member, null);
  assert.equal(matchMlsIdentity({ verifiedEmails: ["synthetic@example.invalid"] }, [{ ...member, email: "Synthetic@example.invalid" }]).reason, "VERIFIED_EMAIL");
  assert.equal(matchMlsIdentity({ mlsId: "KEY2", verifiedEmails: ["synthetic@example.invalid"] }, [member, { ...other, email: "synthetic@example.invalid" }]).member, null);
});
