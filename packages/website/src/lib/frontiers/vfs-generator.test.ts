import { describe, test, expect } from "vitest";
import { Dir, File, FileUtils, getFs } from "@blazetrails/ruby-compat";
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
    list(): VfsFile[] {
      return Object.keys(files)
        .sort()
        .map((path) => this.read(path)!);
    },
    write(path: string, content: string): void {
      files[path] = content;
    },
    delete(path: string): boolean {
      const existed = files[path] !== undefined;
      delete files[path];
      return existed;
    },
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

describe("the VFS FsAdapter's async verbs", () => {
  const tree = (): Record<string, string> => ({
    "/app/models/post.ts": "post",
    "/app/models/.keep": "",
    "/app/views/posts/index.html.tse": "index",
    "/app/.hidden/secret.ts": "secret",
    "/README.md": "readme",
  });

  test("Dir.globAsync walks the directories the stored paths imply, dot entries under FNM_DOTMATCH", async () => {
    vfsFs(tree());
    const glob = async (pattern: string, flags = 0): Promise<string> =>
      (await Dir.globAsync(pattern, flags)).join(" ");

    expect(await glob("/app/**/*.ts")).toBe("/app/models/post.ts");
    expect(await glob("/nope/*")).toBe("");
    expect(await glob("/app/models/*", File.FNM_DOTMATCH)).toBe(
      "/app/models/. /app/models/.keep /app/models/post.ts",
    );
    expect(await glob("/app/**/*.ts", File.FNM_DOTMATCH)).toBe(
      "/app/.hidden/secret.ts /app/models/post.ts",
    );
  });

  test("FileUtils.rmRfAsync removes everything beneath a directory and ignores a missing path", async () => {
    const files = tree();
    vfsFs(files);

    await FileUtils.rmRfAsync(["/app/models", "/missing"]);

    expect(Object.keys(files).sort().join(" ")).toBe(
      "/README.md /app/.hidden/secret.ts /app/views/posts/index.html.tse",
    );
    await expect(FileUtils.rmRAsync("/missing")).rejects.toThrow(/ENOENT/);
  });

  test("a made directory exists while empty, to the sync and the async verbs alike", async () => {
    const fs = vfsFs(tree());

    await fs.mkdir!("/tmp/cache", { recursive: true });

    expect(await fs.exists("/tmp/cache")).toBe(true);
    expect((await fs.lstat!("/tmp/cache")).isDirectory()).toBe(true);
    expect(fs.statSync("/tmp").isDirectory()).toBe(true);
    expect(await fs.readdir!("/tmp")).toEqual(["cache"]);
    expect(fs.readdirSync("/tmp/cache")).toEqual([]);
    expect(await Dir.globAsync("/tmp/*")).toEqual(["/tmp/cache"]);
    await expect(fs.rmdir!("/tmp")).rejects.toThrow(/ENOTEMPTY/);
    await fs.rmdir!("/tmp/cache");
    expect(fs.statSync("/tmp").isDirectory()).toBe(true);
    await fs.unlink!("/app/views/posts/index.html.tse");
    expect(await fs.readdir!("/app/views/posts")).toEqual([]);

    await FileUtils.rmRfAsync("/tmp");
    expect(fs.existsSync("/tmp")).toBe(false);
    expect(() => fs.readdirSync("/tmp")).toThrow(/ENOENT/);
  });

  test("the sync and the async readdir, stat and exists agree", async () => {
    const fs = vfsFs(tree());

    expect(fs.readdirSync("/app")).toEqual(await fs.readdir!("/app"));
    expect(fs.readdirSync("/app").sort()).toEqual([".hidden", "models", "views"]);
    expect(fs.readdirSync("/.trails/templates/active-record")).toEqual(["migration"]);
    expect(fs.existsSync("/app/models")).toBe(await fs.exists("/app/models"));
    expect(() => fs.statSync("/missing")).toThrow(/ENOENT/);
    await expect(fs.lstat!("/missing")).rejects.toThrow(/ENOENT/);
  });

  test("the VFS holds no links and no permission bits", async () => {
    vfsFs(tree());

    expect(await FileUtils.chmodRAsync(0o755, "/app")).toEqual(["/app"]);
    await expect(File.symlinkAsync("/README.md", "/link")).rejects.toThrow(
      "symlink() function is unimplemented on this machine",
    );
    await expect(File.linkAsync("/README.md", "/link")).rejects.toThrow(
      "link() function is unimplemented on this machine",
    );
    expect(await File.isSymlinkAsync("/README.md")).toBe(false);
    expect(await File.isIdenticalAsync("/README.md", "/README.md")).toBe(false);
  });

  test("writeFile stores UTF-8 content, rejects bytes that are not, and unlink removes it", async () => {
    const files = tree();
    const fs = vfsFs(files);

    await fs.writeFile!("/bin/trails", new TextEncoder().encode("#!/usr/bin/env node"));
    expect(files["/bin/trails"]).toBe("#!/usr/bin/env node");
    await expect(fs.writeFile!("/bin/blob", new Uint8Array([0xff, 0xfe]))).rejects.toThrow();
    await fs.unlink!("/bin/trails");
    expect(files["/bin/trails"]).toBeUndefined();
    await expect(fs.unlink!("/bin/trails")).rejects.toThrow(/ENOENT/);
  });
});
