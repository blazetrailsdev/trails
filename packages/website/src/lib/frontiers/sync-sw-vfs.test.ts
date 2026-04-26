import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VfsFile } from "./virtual-fs.js";
import { SyncSwVfs } from "./sync-sw-vfs.js";
import type { SwVfsProxy } from "./sw-vfs-proxy.js";

function createMockProxy(initialFiles: VfsFile[] = []) {
  let files = [...initialFiles];
  const listeners: Array<() => void> = [];

  const proxy: SwVfsProxy = {
    async list() {
      return [...files];
    },
    async read(path: string) {
      return files.find((f) => f.path === path) ?? null;
    },
    async write(path: string, content: string, language?: string) {
      const idx = files.findIndex((f) => f.path === path);
      const now = new Date().toISOString();
      const file: VfsFile = {
        path,
        content,
        language: language ?? "typescript",
        created_at: idx >= 0 ? files[idx].created_at : now,
        updated_at: now,
      };
      if (idx >= 0) files[idx] = file;
      else files.push(file);
    },
    async delete(path: string) {
      const len = files.length;
      files = files.filter((f) => f.path !== path);
      return files.length < len;
    },
    async rename(oldPath: string, newPath: string) {
      const idx = files.findIndex((f) => f.path === oldPath);
      if (idx < 0) return false;
      files[idx] = { ...files[idx], path: newPath };
      return true;
    },
    async exists(path: string) {
      return files.some((f) => f.path === path);
    },
    onChange(fn: () => void) {
      listeners.push(fn);
      return () => {
        const idx = listeners.indexOf(fn);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
    dispose() {
      listeners.length = 0;
    },
  } as SwVfsProxy;

  return { proxy, broadcast: () => listeners.forEach((fn) => fn()) };
}

const sampleFile: VfsFile = {
  path: "app/main.ts",
  content: "console.log('hello')",
  language: "typescript",
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

describe("SyncSwVfs", () => {
  let mock: ReturnType<typeof createMockProxy>;
  let syncVfs: SyncSwVfs;

  beforeEach(async () => {
    mock = createMockProxy([sampleFile]);
    syncVfs = new SyncSwVfs(mock.proxy);
    await syncVfs.hydrate();
  });

  it("lists files after hydration", () => {
    const files = syncVfs.list();
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("app/main.ts");
  });

  it("reads a file from cache", () => {
    const file = syncVfs.read("app/main.ts");
    expect(file).not.toBeNull();
    expect(file!.content).toBe("console.log('hello')");
  });

  it("returns null for missing file", () => {
    expect(syncVfs.read("nonexistent.ts")).toBeNull();
  });

  it("checks existence", () => {
    expect(syncVfs.exists("app/main.ts")).toBe(true);
    expect(syncVfs.exists("nope.ts")).toBe(false);
  });

  it("writes to cache optimistically", () => {
    syncVfs.write("new.ts", "new content");
    expect(syncVfs.read("new.ts")?.content).toBe("new content");
    expect(syncVfs.list()).toHaveLength(2);
  });

  it("deletes from cache optimistically", () => {
    expect(syncVfs.delete("app/main.ts")).toBe(true);
    expect(syncVfs.read("app/main.ts")).toBeNull();
    expect(syncVfs.list()).toHaveLength(0);
  });

  it("returns false for deleting nonexistent file", () => {
    expect(syncVfs.delete("nope.ts")).toBe(false);
  });

  it("renames in cache optimistically", () => {
    expect(syncVfs.rename("app/main.ts", "app/renamed.ts")).toBe(true);
    expect(syncVfs.read("app/main.ts")).toBeNull();
    expect(syncVfs.read("app/renamed.ts")?.content).toBe("console.log('hello')");
  });

  it("fires onChange on write", () => {
    const fn = vi.fn();
    syncVfs.onChange(fn);
    syncVfs.write("new.ts", "x");
    expect(fn).toHaveBeenCalled();
  });

  it("fires onChange on delete", () => {
    const fn = vi.fn();
    syncVfs.onChange(fn);
    syncVfs.delete("app/main.ts");
    expect(fn).toHaveBeenCalled();
  });

  it("rehydrates on proxy broadcast", async () => {
    // Modify the underlying proxy directly
    await mock.proxy.write("extra.ts", "extra content");
    // Trigger broadcast (simulates SW vfs:changed)
    mock.broadcast();
    // Wait for async rehydrate
    await new Promise((r) => setTimeout(r, 50));
    expect(syncVfs.list()).toHaveLength(2);
  });

  it("dispose stops listeners", () => {
    const fn = vi.fn();
    syncVfs.onChange(fn);
    syncVfs.dispose();
    syncVfs.write("x.ts", "y");
    expect(fn).not.toHaveBeenCalled();
  });
});
