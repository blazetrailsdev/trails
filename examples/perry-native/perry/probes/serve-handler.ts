import { Handler } from "@blazetrails/rackup";
import "@blazetrails/rackup/dist/handler/node.js";

const app = () => [200, { "content-type": "text/plain" }, ["ok"]];
await Handler.Node.run(app as never, { Port: 3180, Host: "127.0.0.1" });
console.log("H1 listening");
const res = await fetch("http://127.0.0.1:3180/up");
const body = await res.text();
console.log(`H1 status=${res.status} body=${body}`);
await Handler.Node.shutdown();
