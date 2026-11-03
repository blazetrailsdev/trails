import { appendFileSync } from "node:fs";
import { Trails } from "@blazetrails/trailties";
import "../../config/environment.js";

const LOG = process.env.PROBE_LOG!;
const log = (m: string) => appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`);

const app = Trails.application!;
log("app ready");
const env: Record<string, unknown> = {
  REQUEST_METHOD: "GET",
  PATH_INFO: "/up",
  QUERY_STRING: "",
  SERVER_NAME: "127.0.0.1",
  SERVER_PORT: "3181",
  "rack.url_scheme": "http",
  HTTP_HOST: "127.0.0.1:3181",
};
log("calling app.call");
const out = await app.call(env);
log(`app.call returned status=${Array.isArray(out) ? out[0] : "?"}`);
process.exit(0);
