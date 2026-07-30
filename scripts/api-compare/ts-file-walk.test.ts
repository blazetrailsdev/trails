import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  COMMITTED_TS_FILES,
  COMPARED_TS_FILES,
  walkPackageTsFiles,
  walkTsFilesSync,
} from "./ts-file-walk.js";

let root: string;
let srcDir: string;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "ts-file-walk-"));
  srcDir = path.join(root, "packages", "pkg", "src");
  await fs.mkdir(path.join(srcDir, "nested"), { recursive: true });
  await fs.mkdir(path.join(srcDir, "dist"), { recursive: true });
  await fs.mkdir(path.join(srcDir, "node_modules"), { recursive: true });
  for (const rel of [
    "model.ts",
    "model.test.ts",
    "types.d.ts",
    "notes.md",
    "nested/helper.ts",
    "dist/model.ts",
    "node_modules/dep.ts",
  ]) {
    await fs.writeFile(path.join(srcDir, rel), "");
  }
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const rel = (files: string[]) => files.map((f) => path.relative(srcDir, f)).sort();

describe("walkTsFilesSync", () => {
  it("returns only non-test, non-declaration files for the compared population", () => {
    expect(rel(walkTsFilesSync(srcDir, COMPARED_TS_FILES))).toEqual([
      path.join("dist", "model.ts"),
      "model.ts",
      path.join("nested", "helper.ts"),
      path.join("node_modules", "dep.ts"),
    ]);
  });

  it("prunes full-path excludeDirs", () => {
    expect(
      rel(walkTsFilesSync(srcDir, COMPARED_TS_FILES, [path.join(srcDir, "nested")])),
    ).not.toContain(path.join("nested", "helper.ts"));
  });

  it("prunes the population's skipDirs by name", () => {
    const files = rel(walkTsFilesSync(srcDir, COMMITTED_TS_FILES));
    expect(files).toContain("model.test.ts");
    expect(files).toContain("types.d.ts");
    expect(files).not.toContain(path.join("dist", "model.ts"));
    expect(files).not.toContain(path.join("node_modules", "dep.ts"));
  });

  it("returns no files for a missing directory", () => {
    expect(walkTsFilesSync(path.join(root, "missing"), COMPARED_TS_FILES)).toEqual([]);
  });
});

describe("walkPackageTsFiles", () => {
  it("lists the committed population under each package's src, sorted", async () => {
    expect(rel(await walkPackageTsFiles(path.join(root, "packages"), COMMITTED_TS_FILES))).toEqual([
      "model.test.ts",
      "model.ts",
      path.join("nested", "helper.ts"),
      "types.d.ts",
    ]);
  });

  it("drops tests and declarations for the compared population", async () => {
    expect(rel(await walkPackageTsFiles(path.join(root, "packages"), COMPARED_TS_FILES))).toEqual([
      path.join("dist", "model.ts"),
      "model.ts",
      path.join("nested", "helper.ts"),
      path.join("node_modules", "dep.ts"),
    ]);
  });

  it("returns no files for a missing packages directory", async () => {
    expect(await walkPackageTsFiles(path.join(root, "missing"), COMMITTED_TS_FILES)).toEqual([]);
  });
});
