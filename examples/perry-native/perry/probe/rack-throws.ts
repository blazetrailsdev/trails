import { appendFileSync } from "node:fs";
import { Handler } from "@blazetrails/rackup";

const LOG = process.env.PROBE_LOG!;
const log = (m: string) => appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`);

// A rack app that throws, exactly as a trails app does when a config read fails.
const boom = () => {
  throw new Error("boom from the app");
};

log("run");
const server = await Handler.Node.run(boom as never, { Port: 3182, Host: "127.0.0.1" });
log("bound");
const res = await fetch("http://127.0.0.1:3182/");
log(`fetch resolved status=${res.status}`);
await Handler.Node.shutdown();
log("shutdown resolved");
process.exit(0);
