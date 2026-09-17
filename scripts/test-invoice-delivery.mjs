// Only the isolated invoice lifecycle test uses these external-service stubs.
import { registerHooks } from "node:module";
const targets = new Set([
  new URL("../src/lib/pdf-generator.ts", import.meta.url).href,
  new URL("../src/lib/email-sender.ts", import.meta.url).href,
]);
const stubUrl = new URL("./test-invoice-delivery.cjs", import.meta.url).href;
registerHooks({ resolve(specifier, context, nextResolve) {
  const resolved = nextResolve(specifier, context);
  return targets.has(resolved.url) ? { url: stubUrl, shortCircuit: true } : resolved;
} });
