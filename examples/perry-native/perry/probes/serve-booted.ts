import { Handler } from "@blazetrails/rackup";
import { Trails } from "@blazetrails/trailties";
import "@blazetrails/rackup/dist/handler/node.js";
import "../../config/environment.js";

const mode = process.env.B_MODE ?? "real";
const hold = process.env.B_HOLD === "1";
const real = Trails.application!;
const app =
  mode === "trivial"
    ? () => [200, { "content-type": "text/plain" }, ["ok"]]
    : (env: Record<string, unknown>) => real.call(env);
const keeper = hold ? setTimeout(() => console.log("B9 keeper fired (loop held 5s)"), 5000) : null;
console.log(`B0 mode=${mode} hold=${hold}`);
await Handler.Node.run(app as never, { Port: 3181, Host: "127.0.0.1" });
console.log("B1 listening");
const p = fetch("http://127.0.0.1:3181/up");
console.log("B2 fetch issued");
const res = await p;
console.log(`B3 status=${res.status}`);
const body = await res.text();
console.log(`B4 len=${body.length} body=${body.slice(0, 80)}`);
if (keeper) clearTimeout(keeper);
await Handler.Node.shutdown();
console.log("B5 done");
