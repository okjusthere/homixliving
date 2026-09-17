// Match the effective role returned by the real guard, not just its identity.
// office.integration.ts owns this fixed synthetic roster: only Agent 1 is an
// administrator. contentActor still independently checks the current DB row.
exports.requireActiveAgentApi = async () => {
  const agentId = Number(process.env.TEST_OFFICE_ACTOR || 1);
  return { session: { user: { agentId, isAdmin: agentId === 1 } } };
};
