import { describe, test, expect } from "vitest";
import { getFs } from "@blazetrails/ruby-compat";
import { VfsMigrationGenerator } from "./vfs-generator.js";
import type { VfsFile, VirtualFS } from "./virtual-fs.js";

function stubVfs(files: Record<string, string>): VirtualFS {
  return {
    read(path: string): VfsFile | null {
      const content = files[path];
      if (content === undefined) return null;
      return { path, content, language: "typescript", created_at: "", updated_at: "" };
    },
    exists(path: string): boolean {
      return files[path] !== undefined;
    },
    write(): void {},
  } as unknown as VirtualFS;
}

/**
 * Constructing any of the VFS generators is what registers the VFS adapter and
 * points ActiveSupport at it, so this is the adapter the module actually
 * installs — not a copy of it reached through an export widened for the test.
 */
function vfsFs(files: Record<string, string>) {
  new VfsMigrationGenerator({ vfs: stubVfs(files), output: () => {} });
  return getFs();
}

describe("the VFS FsAdapter's readFile", () => {
  test("returns the content as a string when an encoding is given", async () => {
    const fs = vfsFs({ "/app/models/post.ts": "export class Post {}" });

    expect(await fs.readFile("/app/models/post.ts", "utf-8")).toBe("export class Post {}");
  });

  test("returns bytes that decode through toString when no encoding is given", async () => {
    const fs = vfsFs({ "/app/models/post.ts": "export class Post {}" });

    const bytes = await fs.readFile("/app/models/post.ts");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.toString("utf8")).toBe("export class Post {}");
  });

  test("rejects for a path the VFS does not hold", async () => {
    const fs = vfsFs({});

    await expect(fs.readFile("/app/models/missing.ts", "utf-8")).rejects.toThrow(/ENOENT/);
  });
});
