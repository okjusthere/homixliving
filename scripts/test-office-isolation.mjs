// Only used by the explicit local office integration test command. No paid
// image calls or website requests are possible through these test boundaries.
import { registerHooks } from "node:module";
const files = new Map([
  [new URL("../src/lib/content/open-house-dispatch.ts", import.meta.url).href, "office-open-house-dispatch.cjs"],
  [new URL("../src/lib/content/open-house-catalog.ts", import.meta.url).href, "office-open-house-catalog.cjs"],
  [new URL("../src/lib/auth-guards.ts", import.meta.url).href, "office-auth.cjs"],
  [new URL("../src/lib/homixweb.ts", import.meta.url).href, "office-profile.cjs"],
  [new URL("../src/lib/content/dispatch.ts", import.meta.url).href, "office-dispatch.cjs"],
]);
registerHooks({ resolve(specifier, context, nextResolve) {
  const result = nextResolve(specifier, context);
  const stub = files.get(result.url);
  return stub ? { url: new URL(`./test-fixtures/${stub}`, import.meta.url).href, shortCircuit: true } : result;
} });
