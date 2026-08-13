import { describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { FileStore } from "./file-store.js";
import { MemoryStore } from "./memory-store.js";

// trails-only coverage for the members Rails' file_store_test.rb exercises only
// indirectly: `write_serialized_entry`'s `File.atomic_write`
// (file_store.rb:135), `lock_file` around `modify_value` (file_store.rb:140-153,
// :228), and the `inspect` strings (file_store.rb:97-99,
// memory_store.rb:186-188).
describe("FileStore atomic write and inspect", () => {
  function withStore(fn: (store: FileStore, dir: string) => void): void {
    const dir = mkdtempSync(join(tmpdir(), "trails-file-store-"));
    try {
      fn(new FileStore(dir), dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("leaves no temp file behind after a write", () => {
    withStore((store, dir) => {
      store.write("foo", "bar");
      expect(store.read("foo")).toBe("bar");
      // The tempfile is created in cache_path itself (`File.atomic_write(key,
      // cache_path)`), so a leaked one shows up as a stray root child.
      const strays = readdirSync(dir).filter((f) => f.startsWith("."));
      expect(strays).toEqual([]);
    });
  });

  it("increments through lock_file", () => {
    withStore((store) => {
      expect(store.increment("counter")).toBe(1);
      expect(store.increment("counter")).toBe(2);
      expect(store.decrement("counter")).toBe(1);
    });
  });

  it("does not lose concurrent increments", { timeout: 60_000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), "trails-file-store-"));
    const iterations = 100;
    try {
      const store = new FileStore(dir);
      const worker = new Worker(new URL("./file-store-lock-worker.trails.mjs", import.meta.url), {
        workerData: { dir, iterations },
        execArgv: [
          "--import",
          new URL("./file-store-lock-worker-loader.trails.mjs", import.meta.url).href,
        ],
      });
      const finished = new Promise<void>((resolve, reject) => {
        worker.on("message", (message) => {
          if (message === "ready") {
            worker.postMessage("go");
            for (let i = 0; i < iterations; i++) store.increment("counter");
          } else {
            resolve();
          }
        });
        worker.on("error", reject);
      });
      await finished;
      await worker.terminate();
      expect(store.read("counter")).toBe(iterations * 2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("inspect reports the cache path and options", () => {
    withStore((store, dir) => {
      expect(store.inspect()).toBe(
        `#<FileStore cache_path=${dir}, options={:compress=>true, :compressThreshold=>1024}>`,
      );
    });
  });

  it("MemoryStore inspect reports entry count and size", () => {
    const store = new MemoryStore();
    expect(store.inspect()).toMatch(/^#<MemoryStore entries=0, size=0, options=\{.*\}>$/);
    store.write("foo", "bar");
    expect(store.inspect()).toMatch(/^#<MemoryStore entries=1, size=\d+, options=\{.*\}>$/);
  });
});
