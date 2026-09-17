// Explicit test command only. No live Workspace account or welcome email.
import { registerHooks } from 'node:module';
const workspaceUrl = new URL('../src/lib/google-workspace.ts', import.meta.url).href;
const stubUrl = new URL('./test-stripe-workspace.cjs', import.meta.url).href;
registerHooks({ resolve(specifier, context, nextResolve) {
  const result = nextResolve(specifier, context);
  return result.url === workspaceUrl ? { url: stubUrl, shortCircuit: true } : result;
} });
