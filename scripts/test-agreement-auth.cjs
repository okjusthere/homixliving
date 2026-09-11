// Test-only identity source; never imported by the application.
exports.auth = async () => globalThis.__agreementTestSession ?? null;
