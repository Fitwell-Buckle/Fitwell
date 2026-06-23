// Node module-resolution hook that maps the `server-only` import marker to an
// empty module, so server-only library code (e.g. src/lib/cad/service.ts) can be
// imported from a plain `tsx` CLI script. `server-only` normally throws unless
// it's loaded inside a React Server Component build; in a one-off Node script
// that guard is irrelevant. Load via `node --import ./scripts/_no-server-only.mjs`.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(spec, ctx, next) {
         if (spec === 'server-only' || spec === 'client-only') {
           return { url: 'data:text/javascript,export%20%7B%7D', shortCircuit: true };
         }
         return next(spec, ctx);
       }`,
    ),
  import.meta.url,
);
