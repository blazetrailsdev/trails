import { parentPort, workerData } from "node:worker_threads";
import { getCryptoAsync } from "../crypto-adapter.js";
import { FileStore } from "./file-store.js";

// `File.atomic_write` names its temp file through `Dir::Tmpname::RANDOM.next`,
// which reads the CSPRNG synchronously. A worker thread has no synchronous
// auto-registration path for the node crypto adapter, so warm the registry here
// before any store call reaches it.
await getCryptoAsync();

// The second "process" for the lock_file regression test
// (file-store-atomic-write.trails.test.ts): a worker thread hammering the same
// cache entry through its own FileStore, so `lock_file` (file_store.rb:140-153)
// has real concurrency to exclude.
const { dir, iterations } = workerData;
const store = new FileStore(dir);

parentPort.on("message", () => {
  for (let i = 0; i < iterations; i++) store.increment("counter");
  parentPort.postMessage("done");
});

parentPort.postMessage("ready");
