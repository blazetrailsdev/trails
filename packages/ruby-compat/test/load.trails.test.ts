import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { rbFLoad, rbFRequireFile, registerCompiledFiles } from "../lib/load.js";
import { TopLevel } from "../lib/object.js";
import { constGet, rbModRemoveConst } from "../lib/variable.js";

describe("rbFLoad", () => {
  it("evaluates the file on every call and seats its constant-named exports", async () => {
    const root = await mkdtemp(join(tmpdir(), "trails-rb-f-load-"));
    const fname = join(root, "probe.mjs");
    try {
      await writeFile(fname, `export const RbFLoadProbe = 1;\nexport const helper = 0;\n`);
      expect(await rbFLoad(fname)).toBe(true);
      expect(constGet(Object, "RbFLoadProbe")).toBe(1);
      expect(Object.hasOwn(TopLevel, "helper")).toBe(false);

      await writeFile(fname, `export const RbFLoadProbe = 2;\n`);
      await rbFLoad(fname);
      expect(constGet(Object, "RbFLoadProbe")).toBe(2);
      expect(rbModRemoveConst(Object, "RbFLoadProbe")).toBe(2);
      expect(() => rbModRemoveConst(Object, "RbFLoadProbe")).toThrow(/not defined/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("registerCompiledFiles", () => {
  it("loads a registered path through its thunk on the first load only", async () => {
    const root = await mkdtemp(join(tmpdir(), "trails-rb-f-compiled-"));
    const fname = join(root, "compiled.js");
    try {
      await writeFile(fname, `export const RbFCompiledProbe = "disk";\n`);
      let calls = 0;
      registerCompiledFiles(root, {
        "compiled.js": async () => {
          calls += 1;
          return { RbFCompiledProbe: "thunk" };
        },
      });
      expect(await rbFRequireFile(fname)).toBe(true);
      expect(calls).toBe(1);
      expect(constGet(Object, "RbFCompiledProbe")).toBe("thunk");
      expect(await rbFRequireFile(fname)).toBe(false);

      await rbFLoad(fname);
      expect(calls).toBe(1);
      expect(rbModRemoveConst(Object, "RbFCompiledProbe")).toBe("disk");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("finds a registered path that is not on disk", async () => {
    let calls = 0;
    registerCompiledFiles("/nonexistent-trails-root", {
      "absent.js": async () => {
        calls += 1;
        return {};
      },
    });
    expect(await rbFRequireFile("/nonexistent-trails-root/absent.js")).toBe(true);
    expect(calls).toBe(1);
  });

  it("finds a registered path named through a relative segment", async () => {
    let calls = 0;
    registerCompiledFiles("/nonexistent-trails-root", {
      "dotted.js": async () => {
        calls += 1;
        return {};
      },
    });
    expect(await rbFLoad("/nonexistent-trails-root/sub/../dotted.js")).toBe(true);
    expect(calls).toBe(1);
  });
});
