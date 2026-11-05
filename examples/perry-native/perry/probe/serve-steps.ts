import { appendFileSync } from "node:fs";
import { Handler } from "@blazetrails/rackup";
import { Trails } from "@blazetrails/trailties";
import "../../config/environment.js";

const LOG = process.env.PROBE_LOG!;
const log = (m: string) => appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`);

log("imports done");
const app = Trails.application!;
const railsApp = (env: Record<string, unknown>) => app.call(env);

log("calling run");
const server = await Handler.Node.run(railsApp, { Port: 3179, Host: "127.0.0.1" });
log("run resolved");
const a = server.address();
const bound = a && typeof a === "object" ? a.port : 3179;
log(`bound ${bound}`);
const res = await fetch(`http://127.0.0.1:${bound}/up`);
log(`fetch resolved status=${res.status}`);
log(`body len=${(await res.text()).length}`);
log("calling shutdown");
await Handler.Node.shutdown();
log("shutdown resolved");
process.exit(0);
