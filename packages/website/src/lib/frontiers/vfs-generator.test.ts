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

  test("Dir.globAsync walks the directories the stored paths imply", async () => {
    vfsFs(tree());

    expect(await Dir.globAsync("/app/**/*.ts")).toEqual(["/app/models/post.ts"]);
    expect(await Dir.globAsync("/app/models/*")).toEqual(["/app/models/post.ts"]);
    expect(await Dir.globAsync("/nope/*")).toEqual([]);
  });

  test("Dir.globAsync with FNM_DOTMATCH includes dotfiles and dot directories", async () => {
    vfsFs(tree());

    expect(await Dir.globAsync("/app/models/*", File.FNM_DOTMATCH)).toEqual([
      "/app/models/.",
      "/app/models/.keep",
      "/app/models/post.ts",
    ]);
    expect(await Dir.globAsync("/app/**/*.ts", File.FNM_DOTMATCH)).toEqual([
      "/app/.hidden/secret.ts",
      "/app/models/post.ts",
    ]);
  });

  test("FileUtils.rmRfAsync removes everything beneath a directory and ignores a missing path", async () => {
    const files = tree();
    vfsFs(files);

    await FileUtils.rmRfAsync(["/app/models", "/missing"]);

    expect(Object.keys(files).sort()).toEqual([
      "/README.md",
      "/app/.hidden/secret.ts",
      "/app/views/posts/index.html.tse",
    ]);
  });

  test("FileUtils.rmRAsync rejects for a missing path, and rm for a directory unless recursive", async () => {
    const fs = vfsFs(tree());

    await expect(FileUtils.rmRAsync("/missing")).rejects.toThrow(/ENOENT/);
    await expect(fs.rm!("/app/models")).rejects.toThrow(/EISDIR/);
  });

  test("lstat tells a file from a directory and rejects for neither", async () => {
    const fs = vfsFs(tree());

    expect((await fs.lstat!("/app/models")).isDirectory()).toBe(true);
    expect((await fs.lstat!("/README.md")).isFile()).toBe(true);
    await expect(fs.lstat!("/missing")).rejects.toThrow(/ENOENT/);
    expect(await File.isSymlinkAsync("/README.md")).toBe(false);
  });

  test("FileUtils.chmodRAsync is a no-op, the VFS having no permission bits", async () => {
    vfsFs(tree());

    expect(await FileUtils.chmodRAsync(0o755, "/app")).toEqual(["/app"]);
  });

  test("File.symlinkAsync and File.linkAsync raise NotImplementedError, the VFS holding no links", async () => {
    vfsFs(tree());

    await expect(File.symlinkAsync("/README.md", "/link")).rejects.toThrow(
      "symlink() function is unimplemented on this machine",
    );
    await expect(File.linkAsync("/README.md", "/link")).rejects.toThrow(
      "link() function is unimplemented on this machine",
    );
    expect(await File.isIdenticalAsync("/README.md", "/README.md")).toBe(false);
  });

  test("writeFile stores the content and unlink removes it", async () => {
    const files = tree();
    const fs = vfsFs(files);

    await fs.writeFile!("/bin/trails", new TextEncoder().encode("#!/usr/bin/env node"), {
      mode: 0o755,
    });
    expect(files["/bin/trails"]).toBe("#!/usr/bin/env node");
    await fs.unlink!("/bin/trails");
    expect(files["/bin/trails"]).toBeUndefined();
    await expect(fs.unlink!("/bin/trails")).rejects.toThrow(/ENOENT/);
  });
});
