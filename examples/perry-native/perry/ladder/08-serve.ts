// A real HTTP server, in a native binary: boot the application, listen, serve
// one request to ourselves, and shut down.
//
// `07` proves the application boots — initializers, autoloading, routes. It
// never opens a socket. This rung asks the question the ladder is actually
// climbing towards: can a compiled trails application answer an HTTP request?
//
// This runs the handler a deployed trails server ends at. RFC 0217 moved
// `Handler` out of `@blazetrails/rack` into `@blazetrails/rackup`, matching
// Ruby, where `Rackup::Handler` is its own gem, and `commands/server.ts` now
// reaches it through `Handler.get("node")` rather than naming `Handler.Node`:
// outside development (or with no vite config) that is the branch taken, and
// Vite is never constructed.
//
// The rung calls `Handler.Node.run` DIRECTLY, so it is not byte-for-byte that
// path. `Handler.get` resolves through `Handler.loadPath` with a dynamic
// `import()`, and the wall-22 measurement that this graph has `0 dynamic
// edges` holds only because the rung does not go through it. Dynamic handler
// resolution under AOT is therefore an open question this rung does not ask,
// not one it has answered.
//
// It does NOT follow that the binary is free of Vite. Taking the production
// branch changes what executes, not what the module graph reaches, and this
// rung still compiles Vite, rollup and playwright because `trailties`' "."
// export is the CLI. That is wall 14 in FINDINGS.md, and it is why both this
// rung and `07` are OOM-killed at 12 GiB.
//
// Run it with `TRAILS_ENV=production` to take that branch. The environment has
// to come from the process, not from an assignment in this file: the
// `.trails/entry.generated.js` import is hoisted and boots the application before
// any statement here could set it.
import { Handler } from "@blazetrails/rackup";
import { Trails } from "@blazetrails/trailties";
// `Handler.Node` is a type-only `declare static` on the class; the runtime
// value is assigned by a side effect at the bottom of `handler/node.ts`, which
// only the dynamic `import()` in `Handler.loadPath` ever loads. Importing it
// statically here keeps this rung on the direct path with 0 dynamic edges, as
// the note above describes, instead of leaving `Handler.Node` undefined.
import "@blazetrails/rackup/dist/handler/node.js";
import "../../.trails/entry.generated.js";

const app = Trails.application!;
const port = 3178;
const railsApp = (env: Record<string, unknown>) => app.call(env);

const server = await Handler.Node.run(railsApp, { Port: port, Host: "127.0.0.1" });
const address = server.address();
const bound = address && typeof address === "object" ? address.port : port;

// `bound`, not `port`: `listen` may land elsewhere if the port is taken.
const res = await fetch(`http://127.0.0.1:${bound}/up`);
const body = await res.text();
console.log(`[08] env=${Trails.env} port=${bound} status=${res.status} len=${body.length}`);

await Handler.Node.shutdown();
