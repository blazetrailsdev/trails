import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { OptimizedFileSystemResolver } from "./optimized-file-system-resolver.js";

describe("OptimizedFileSystemResolver", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ofs-resolver-"));
    mkdirSync(join(dir, "posts"), { recursive: true });
    writeFileSync(join(dir, "posts", "index.html.tse"), "<h1>Posts</h1>");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("caches find results and serves the same Template instance", () => {
    const resolver = new OptimizedFileSystemResolver(dir);
    const a = resolver.find("index", "posts", "html", ["tse"]);
    const b = resolver.find("index", "posts", "html", ["tse"]);
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });

  test("clearCache invalidates cached lookups", () => {
    const resolver = new OptimizedFileSystemResolver(dir);
    const a = resolver.find("index", "posts", "html", ["tse"]);
    resolver.clearCache();
    const b = resolver.find("index", "posts", "html", ["tse"]);
    expect(a).not.toBe(b);
  });
});
