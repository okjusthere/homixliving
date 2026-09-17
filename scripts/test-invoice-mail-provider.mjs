import { registerHooks } from "node:module";
const target = new URL("../src/lib/company-w9.ts", import.meta.url).href;
const stub = new URL("./test-invoice-delivery.cjs", import.meta.url).href;
registerHooks({ resolve(specifier, context, nextResolve) {
  const result = nextResolve(specifier, context);
  return result.url === target ? { url: stub, shortCircuit: true } : result;
} });
