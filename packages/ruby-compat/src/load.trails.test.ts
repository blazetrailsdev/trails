import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { rbFLoad } from "./load.js";
import { registeredConstant, rbModRemoveConst } from "./variable.js";

describe("rbFLoad", () => {
  it("evaluates the file on every call and seats its constant-named exports", async () => {
    const root = await mkdtemp(join(tmpdir(), "trails-rb-f-load-"));
    const fname = join(root, "probe.mjs");
    try {
      await writeFile(fname, `export const RbFLoadProbe = 1;\nexport const helper = 0;\n`);
      expect(await rbFLoad(fname)).toBe(true);
      expect(registeredConstant("RbFLoadProbe")).toBe(1);
      expect(registeredConstant("helper")).toBeUndefined();

      await writeFile(fname, `export const RbFLoadProbe = 2;\n`);
      await rbFLoad(fname);
      expect(registeredConstant("RbFLoadProbe")).toBe(2);
      expect(rbModRemoveConst(Object, "RbFLoadProbe")).toBe(2);
      expect(() => rbModRemoveConst(Object, "RbFLoadProbe")).toThrow(/not defined/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
