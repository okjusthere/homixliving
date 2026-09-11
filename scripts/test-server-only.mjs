// Next aliases this marker itself. Standalone database tests need its empty
// server implementation; production bundles continue to use Next's boundary.
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier === 'server-only' ? 'next/dist/compiled/server-only/empty.js' : specifier, context);
} });
