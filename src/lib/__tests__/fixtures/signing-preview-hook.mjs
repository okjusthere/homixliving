import { registerHooks } from "node:module";
const mockUrl = new URL("./signing-preview.mjs", import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      ["@/db", "@/lib/auth-guards", "@/lib/signing-bridge"].includes(specifier)
    )
      return { url: mockUrl, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
