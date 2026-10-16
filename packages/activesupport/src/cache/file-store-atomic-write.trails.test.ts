import { describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { FileStore } from "./file-store.js";
import { MemoryStore } from "./memory-store.js";

describe("FileStore atomic write and inspect", () => {
  async function withStore(fn: (store: FileStore, dir: string) => unknown): Promise<void> {
    const dir = mkdtempSync(join(tmpdir(), "trails-file-store-"));
    try {
      await fn(new FileStore(dir), dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("leaves no temp file behind after a write", async () => {
    await withStore(async (store, dir) => {
      await store.write("foo", "bar");
      expect(await store.read("foo")).toBe("bar");
      const strays = readdirSync(dir).filter((f) => f.startsWith("."));
      expect(strays).toEqual([]);
    });
  });

  it("round-trips a non-ASCII payload through atomic_write and binread", async () => {
    await withStore(async (store) => {
      await store.write("greeting", "héllo 日本 🚂");
      expect(await store.read("greeting")).toBe("héllo 日本 🚂");
    });
  });

  it("increments through lock_file", async () => {
    await withStore(async (store) => {
      expect(await store.increment("counter")).toBe(1);
      expect(await store.increment("counter")).toBe(2);
      expect(await store.decrement("counter")).toBe(1);
    });
  });

  it("serialises concurrent in-process increments through lock_file", async () => {
    await withStore(async (store) => {
      await store.write("counter", 0);
      await Promise.all([
        store.increment("counter"),
        store.increment("counter"),
        store.increment("counter"),
      ]);
      expect(await store.read("counter")).toBe(3);
    });
  });

  it("does not lose concurrent increments", { timeout: 60_000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), "trails-file-store-"));
    const iterations = 100;
    try {
      const store = new FileStore(dir);
      await store.write("counter", 0);
      const worker = new Worker(new URL("./file-store-lock-worker.trails.mjs", import.meta.url), {
        workerData: { dir, iterations },
        execArgv: [
          "--import",
          new URL("./file-store-lock-worker-loader.trails.mjs", import.meta.url).href,
        ],
      });
      let increments: Promise<void> = Promise.resolve();
      const finished = new Promise<void>((resolve, reject) => {
        worker.on("message", (message) => {
          if (message === "ready") {
            worker.postMessage("go");
            increments = (async () => {
              for (let i = 0; i < iterations; i++) await store.increment("counter");
            })();
          } else {
            resolve();
          }
        });
        worker.on("error", reject);
      });
      await finished;
      await increments;
      await worker.terminate();
      expect(await store.read("counter")).toBe(iterations * 2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("inspect reports the cache path and options", async () => {
    await withStore(async (store, dir) => {
      expect(store.inspect()).toBe(
        `#<FileStore cache_path=${dir}, options={:compress=>true, :compressThreshold=>1024}>`,
      );
    });
  });

  it("MemoryStore inspect reports entry count and size", async () => {
    const store = new MemoryStore();
    expect(store.inspect()).toMatch(/^#<MemoryStore entries=0, size=0, options=\{.*\}>$/);
    await store.write("foo", "bar");
    expect(store.inspect()).toMatch(/^#<MemoryStore entries=1, size=\d+, options=\{.*\}>$/);
  });
});
