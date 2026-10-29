// A real HTTP server, in a native binary: boot the application, listen, serve
// one request to ourselves, and shut down.
//
// `07` proves the application boots — initializers, autoloading, routes. It
// never opens a socket. This rung asks the question the ladder is actually
// climbing towards: can a compiled trails application answer an HTTP request?
//
// This IS `trails server`'s own code path, in every environment but
// development. `commands/server.js` branches: outside development (or with no
// vite config) it calls `Handler.Node.run(railsApp, { Port, Host })` and
// returns — Vite is never constructed. So nothing is being skipped here to
// make the rung pass: this is what a deployed trails server actually runs.
//
// It does NOT follow that the binary is free of Vite. Taking the production
// branch changes what executes, not what the module graph reaches, and this
// rung still compiles Vite, rollup and playwright because `trailties`' "."
// export is the CLI. That is wall 14 in FINDINGS.md, and it is why both this
// rung and `07` are OOM-killed at 12 GiB.
//
// Run it with `TRAILS_ENV=production` to take that branch. The environment has
// to come from the process, not from an assignment in this file: the
// `config/environment.js` import is hoisted and boots the application before
// any statement here could set it.
import { Handler } from "@blazetrails/rack";
import { Trails } from "@blazetrails/trailties";
import "../../config/environment.js";

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
