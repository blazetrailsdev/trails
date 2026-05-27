import { getFsAsync, getOsAsync, getPathAsync } from "@blazetrails/activesupport";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { OptimizedFileSystemResolver } from "./optimized-file-system-resolver.js";

describe("OptimizedFileSystemResolver", () => {
  let dir: string | undefined;

  beforeEach(async () => {
    const fs = await getFsAsync();
    const path = await getPathAsync();
    const os = await getOsAsync();
    dir = await fs.mkdtemp!(`${os.tmpdir()}${path.sep}ofs-resolver-`);
    await fs.mkdir!(path.join(dir, "posts"), { recursive: true });
    await fs.writeFile!(path.join(dir, "posts", "index.html.tse"), "<h1>Posts</h1>");
  });

  afterEach(async () => {
    if (!dir) return;
    const fs = await getFsAsync();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("caches find results and serves the same Template instance", async () => {
    const resolver = new OptimizedFileSystemResolver(dir!);
    const a = resolver.find("index", "posts", "html", ["tse"]);
    const b = resolver.find("index", "posts", "html", ["tse"]);
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });

  test("clearCache invalidates cached lookups", async () => {
    const resolver = new OptimizedFileSystemResolver(dir!);
    const a = resolver.find("index", "posts", "html", ["tse"]);
    resolver.clearCache();
    const b = resolver.find("index", "posts", "html", ["tse"]);
    expect(a).not.toBe(b);
  });
});
