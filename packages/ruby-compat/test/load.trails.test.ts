import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LOAD_PATH,
  isCompiledFile,
  rbFLoad,
  rbFRequireFile,
  registerCompiledFiles,
} from "../lib/load.js";
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

  it("loads a registered path with no source through its thunk on every load", async () => {
    let calls = 0;
    registerCompiledFiles("/nonexistent-trails-root", {
      "repeat.js": async () => {
        calls += 1;
        return {};
      },
    });
    expect(isCompiledFile("/nonexistent-trails-root/repeat.js")).toBe(true);
    expect(isCompiledFile("/nonexistent-trails-root/unregistered.js")).toBe(false);
    await rbFLoad("/nonexistent-trails-root/repeat.js");
    await rbFLoad("/nonexistent-trails-root/repeat.js");
    expect(calls).toBe(2);
  });
});

describe("rbFRequireFile", () => {
  async function withLoadPath(block: (root: string) => Promise<void>): Promise<void> {
    const root = await mkdtemp(join(tmpdir(), "trails-rb-f-require-"));
    LOAD_PATH.push(root);
    try {
      await block(root);
    } finally {
      LOAD_PATH.splice(LOAD_PATH.indexOf(root), 1);
      await rm(root, { recursive: true, force: true });
    }
  }

  it("finds feature.ts when no feature.js is on the load path", async () => {
    await withLoadPath(async (root) => {
      await writeFile(join(root, "rb_f_require_ts.ts"), `export const RbFRequireTs = "ts";\n`);
      expect(await rbFRequireFile("rb_f_require_ts")).toBe(true);
      expect(rbModRemoveConst(Object, "RbFRequireTs")).toBe("ts");
    });
  });

  it("prefers feature.js over feature.ts in the same directory", async () => {
    await withLoadPath(async (root) => {
      await writeFile(join(root, "rb_f_require_both.js"), `export const RbFRequireBoth = "js";\n`);
      await writeFile(join(root, "rb_f_require_both.ts"), `export const RbFRequireBoth = "ts";\n`);
      expect(await rbFRequireFile("rb_f_require_both")).toBe(true);
      expect(rbModRemoveConst(Object, "RbFRequireBoth")).toBe("js");
    });
  });

  it("searches a feature with an explicit extension as given", async () => {
    await withLoadPath(async (root) => {
      await writeFile(join(root, "rb_f_require_ext.js"), `export const RbFRequireExt = "js";\n`);
      await writeFile(join(root, "rb_f_require_ext.ts"), `export const RbFRequireExt = "ts";\n`);
      expect(await rbFRequireFile("rb_f_require_ext.ts")).toBe(true);
      expect(rbModRemoveConst(Object, "RbFRequireExt")).toBe("ts");
    });
  });
});
