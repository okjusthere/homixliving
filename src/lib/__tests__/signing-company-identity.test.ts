import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bindSigningCompany,
  signingCompanyIdentity,
  signingPackageCompanies,
} from "../signing-company-identity";

test("company and agent details come from the current profile, not browser values", () => {
  for (const [id, name] of [
    ["homix_realty", "Homix Realty Inc."],
    ["homix_living", "Homix Living Inc."],
  ]) {
    const identity = signingCompanyIdentity(
      {
        legalName: "Legal Agent",
        email: "agent@example.invalid",
        licensedCompanyId: id,
        licensedCompany: "stale company",
        licenseNumber: "TEST-LICENSE",
        phone: "TEST-PHONE",
      },
      {
        homix_realty_broker_license: "10991241632",
        homix_living_broker_license: "10991242852",
      },
    );
    const bound = bindSigningCompany(
      {
        companyKey: "forged",
        values: {
          company_name: "forged",
          company_address: "forged",
          company_mailing_line: "forged",
          agent_license: "forged",
          agent_phone: "forged",
          agent_email: "forged",
          price: "700000",
        },
      },
      identity,
    );
    assert.equal(bound.companyKey, id);
    assert.deepEqual(bound.values, {
      company_name: name,
      company_address:
        id === "homix_realty"
          ? "37-20 Prince St, STE 3H, Flushing, NY 11354"
          : "110 Charlton St #A, New York, NY 10014",
      company_mailing_line: `${name}, ${id === "homix_realty" ? "37-20 Prince St, STE 3H, Flushing, NY 11354" : "110 Charlton St #A, New York, NY 10014"}`,
      broker_license: id === "homix_realty" ? "10991241632" : "10991242852",
      agent_license: "TEST-LICENSE",
      agent_phone: "TEST-PHONE",
      agent_email: "agent@example.invalid",
      price: "700000",
    });
  }
});

test("shared master applicability preserves legacy company-only packages", () => {
  assert.deepEqual(signingPackageCompanies({ company_key: "homix_realty" }), [
    "homix_realty",
  ]);
  assert.deepEqual(
    signingPackageCompanies({
      company_key: "homix_realty",
      applicable_company_keys: [],
    }),
    ["homix_realty"],
  );
  assert.deepEqual(
    signingPackageCompanies({
      company_key: "homix_realty",
      applicable_company_keys: ["homix_realty", "homix_living"],
    }),
    ["homix_realty", "homix_living"],
  );
  assert.equal(
    signingCompanyIdentity({
      legalName: "Agent",
      email: "a@example.invalid",
      licensedCompanyId: "unknown",
      licensedCompany: null,
      licenseNumber: null,
      phone: null,
    }).companyKey,
    null,
  );
});

import { validCompanyLicenseSettings } from "../company-settings";
test("broker license configuration validates settings and does not fall back to hardcoded values", () => {
  assert(
    validCompanyLicenseSettings({
      homix_realty_broker_license: "10991241632",
      homix_living_broker_license: "10991242852",
    }),
  );
  assert(!validCompanyLicenseSettings({ homix_realty_broker_license: "bad" }));
  const source = {
    legalName: "Agent",
    email: "a@example.invalid",
    licensedCompanyId: "homix_realty",
    licensedCompany: null,
    licenseNumber: null,
    phone: null,
  };
  assert.equal(signingCompanyIdentity(source).brokerLicense, "");
  assert.equal(
    signingCompanyIdentity(source, {
      homix_realty_broker_license: "10990000001",
    }).brokerLicense,
    "10990000001",
  );
});
