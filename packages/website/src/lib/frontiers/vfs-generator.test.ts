import { describe, test, expect } from "vitest";
import { createVfsFsAdapter } from "./vfs-generator.js";
import type { VfsFile, VirtualFS } from "./virtual-fs.js";

function stubVfs(files: Record<string, string>): VirtualFS {
  return {
    read(path: string): VfsFile | null {
      const content = files[path];
      if (content === undefined) return null;
      return {
        path,
        content,
        language: "typescript",
        created_at: "",
        updated_at: "",
      };
    },
  } as unknown as VirtualFS;
}

describe("the VFS FsAdapter's readFile", () => {
  test("returns the content as a string when an encoding is given", async () => {
    const fs = createVfsFsAdapter(stubVfs({ "/app/models/post.ts": "export class Post {}" }));

    expect(await fs.readFile("/app/models/post.ts", "utf-8")).toBe("export class Post {}");
  });

  test("returns the content as bytes when no encoding is given", async () => {
    const fs = createVfsFsAdapter(stubVfs({ "/app/models/post.ts": "export class Post {}" }));

    const bytes = await fs.readFile("/app/models/post.ts");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(bytes)).toBe("export class Post {}");
  });

  test("rejects for a path the VFS does not hold", async () => {
    const fs = createVfsFsAdapter(stubVfs({}));

    await expect(fs.readFile("/app/models/missing.ts", "utf-8")).rejects.toThrow(/ENOENT/);
  });
});
