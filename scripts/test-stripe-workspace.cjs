exports.provisionWorkspaceForOrder = async order => globalThis.__stripeWorkspaceTest.provision(order);
exports.suspendWorkspaceForOrder = async order => globalThis.__stripeWorkspaceTest.suspend(order);
