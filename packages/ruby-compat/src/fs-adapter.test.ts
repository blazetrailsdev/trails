import { describe, test, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { getFs, getPath, type FsAdapter } from "./fs-adapter.js";

const fsAdapterPath = fileURLToPath(new URL("./fs-adapter.ts", import.meta.url));

describe("fs-adapter auto-registration", () => {
  test("sync getFs resolves the node adapter under pure ESM", () => {
    const script = `
      if (typeof require !== "undefined") { console.error("not pure ESM"); process.exit(2); }
      const { getFs, getPath } = await import(${JSON.stringify(fsAdapterPath)});
      console.log(typeof getFs().readFileSync, typeof getPath().join);
    `;
    const out = execFileSync(process.execPath, ["--input-type=module", "--eval", script], {
      encoding: "utf-8",
    });
    expect(out.trim()).toBe("function function");
  });
});

describe("FsAdapter#readFile", () => {
  test("is callable without a guard, and reads the file", async () => {
    const fs = getFs();
    const source = await fs.readFile(fsAdapterPath, "utf8");
    expect(source).toContain("export interface FsAdapter");
  });

  test("returns bytes when no encoding is given", async () => {
    const fs = getFs();
    const bytes = await fs.readFile(fsAdapterPath);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.toString("utf8")).toContain("export interface FsAdapter");
  });

  test("rejects for a path that does not exist", async () => {
    const fs = getFs();
    await expect(fs.readFile(`${fsAdapterPath}.missing`, "utf8")).rejects.toThrow(/ENOENT/);
  });
});

describe("FsAdapter#rm", () => {
  test("removes a tree", async () => {
    const fs = getFs();
    const path = getPath();
    const dir = await fs.mkdtemp!(path.join(tmpdir(), "fs-adapter-rm-"));
    await fs.mkdir!(path.join(dir, "a", "b"), { recursive: true });
    await fs.writeFile!(path.join(dir, "a", "b", "file.txt"), "x");
    await fs.rm!(dir, { recursive: true, force: true });
    expect(await fs.exists(dir)).toBe(false);
  });

  test("force ignores a path that does not exist", async () => {
    const fs = getFs();
    const missing = getPath().join(tmpdir(), "fs-adapter-rm-missing");
    await expect(fs.rm!(missing, { recursive: true, force: true })).resolves.toBeUndefined();
    await expect(fs.rm!(missing)).rejects.toThrow(/ENOENT/);
  });
});

describe("the node adapter", () => {
  const contract: Record<keyof FsAdapter, true> = {
    readFileSync: true,
    writeFileSync: true,
    existsSync: true,
    mkdirSync: true,
    appendFileSync: true,
    unlinkSync: true,
    readdirSync: true,
    rmSync: true,
    rmdirSync: true,
    renameSync: true,
    flockSync: true,
    statSync: true,
    fstatSync: true,
    lstatSync: true,
    chmodSync: true,
    utimesSync: true,
    chownSync: true,
    lchmodSync: true,
    lchownSync: true,
    readlinkSync: true,
    symlinkSync: true,
    realpathSync: true,
    accessSync: true,
    openSync: true,
    readSync: true,
    writeSync: true,
    closeSync: true,
    copyFileSync: true,
    cwd: true,
    exists: true,
    stat: true,
    lstat: true,
    mkdtempSync: true,
    readFile: true,
    writeFile: true,
    unlink: true,
    rm: true,
    rename: true,
    mkdtemp: true,
    realpath: true,
    rmdir: true,
    readdir: true,
    mkdir: true,
    symlink: true,
    link: true,
    chmod: true,
  };

  test("carries only the verbs FsAdapter declares", () => {
    const extra = Object.keys(getFs()).filter((key) => !(key in contract));
    expect(extra).toEqual([]);
  });

  test("exposes no callback-style node:fs function", () => {
    const fs = getFs() as unknown as Record<string, unknown>;
    for (const verb of ["copyFile", "appendFile", "access", "open", "cp"]) {
      expect(fs[verb]).toBeUndefined();
    }
  });
});
