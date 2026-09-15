exports.requireActiveAgentApi = async () => ({ session: { user: { agentId: Number(process.env.TEST_OFFICE_ACTOR || 1) } } });
