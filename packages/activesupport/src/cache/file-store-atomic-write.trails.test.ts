import { describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { FileStore } from "./file-store.js";
import { MemoryStore } from "./memory-store.js";

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
      const strays = readdirSync(dir).filter((f) => f.startsWith("."));
      expect(strays).toEqual([]);
    });
  });

  it("round-trips a non-ASCII payload through atomic_write and binread", () => {
    // file_store.rb:127 writes through File.atomic_write, binmode at core_ext/file/atomic.rb:25, and :124 reads it back with File.binread (vendor/ruby/io.c:12242) — a BYTE round-trip on both sides.
    withStore((store) => {
      store.write("greeting", "héllo 日本 🚂");
      expect(store.read("greeting")).toBe("héllo 日本 🚂");
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
      store.write("counter", 0);
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
