const s = globalThis.__signingPreviewTest;
export const db = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => [
          {
            legalName: null,
            email: "qa@example.invalid",
            licensedCompanyId: s.company,
            licenseNumber: null,
            phone: null,
          },
        ],
      }),
    }),
  }),
};
export const requireActiveAgentApi = async () =>
  s.authStatus === 200
    ? { agentId: 1 }
    : { error: Response.json({ error: "DENIED" }, { status: s.authStatus }) };
export const signingActor = async () => ({
  agentId: 1,
  admin: true,
  allowedCompanyKeys: ["homix_realty", "homix_living"],
  verifiedEmails: ["qa@example.invalid"],
});
export class SigningBridgeError extends Error {
  constructor(code, status = 502) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
export const signingApiError = (e) =>
  Response.json(
    { error: e.code || "INVALID_REQUEST" },
    { status: e.status || 400 },
  );
export const signingBridgeJson = async (path) => {
  s.reads.push(path);
  return { items: s.catalog };
};
export const signingBridgeFetch = async (path) => {
  s.reads.push(path);
  return new Response("%PDF-1.7 SYNTHETIC", {
    headers: { "Content-Disposition": 'attachment; filename="test.pdf"' },
  });
};
