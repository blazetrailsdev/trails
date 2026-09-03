import { parentPort, workerData } from "node:worker_threads";
import { getCryptoAsync } from "@blazetrails/ruby-compat";
import { FileStore } from "./file-store.js";

await getCryptoAsync();

const { dir, iterations } = workerData;
const store = new FileStore(dir);

parentPort.on("message", () => {
  for (let i = 0; i < iterations; i++) store.increment("counter");
  parentPort.postMessage("done");
});

parentPort.postMessage("ready");
