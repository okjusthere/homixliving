// Used only by the explicit isolated agreement DB test command.
import { registerHooks } from 'node:module';
const authUrl = new URL('../src/auth.ts', import.meta.url).href;
const stubUrl = new URL('./test-agreement-auth.cjs', import.meta.url).href;
registerHooks({ resolve(specifier, context, nextResolve) {
  const resolved = nextResolve(specifier, context);
  return resolved.url === authUrl ? { url: stubUrl, shortCircuit: true } : resolved;
} });
