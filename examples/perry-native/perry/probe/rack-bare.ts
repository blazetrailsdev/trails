import { appendFileSync } from "node:fs";
import { Handler } from "@blazetrails/rackup";

const LOG = process.env.PROBE_LOG!;
const log = (m: string) => appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`);

const bare = () => [200, { "content-type": "text/plain" }, ["ok"]] as const;

log("run");
const server = await Handler.Node.run(bare as never, { Port: 3180, Host: "127.0.0.1" });
log("bound");
const res = await fetch("http://127.0.0.1:3180/");
log(`fetch resolved status=${res.status} body=${await res.text()}`);
await Handler.Node.shutdown();
log("shutdown resolved");
process.exit(0);
