import { Handler } from "@blazetrails/rackup";
import "@blazetrails/rackup/dist/handler/node.js";

const app = () => [200, { "content-type": "text/plain" }, ["ok"]];
const port = 3182;
const server = await Handler.Node.run(app as never, { Port: port, Host: "127.0.0.1" });
const variant = process.env.A_VARIANT ?? "address";
let bound = port;
if (variant === "address") {
  const address = server.address();
  bound = address && typeof address === "object" ? address.port : port;
}
const res = await fetch(`http://127.0.0.1:${bound}/up`);
const body = await res.text();
console.log(`A1 variant=${variant} bound=${bound} status=${res.status} body=${body}`);
await Handler.Node.shutdown();
