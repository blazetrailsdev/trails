import { describe, expect, it } from "vitest";

import type { ApiManifest, ClassInfo, MethodInfo } from "./types.js";
import { annotateAgainstTs, diffManifests } from "./version-diff.js";

function method(name: string, over: Partial<MethodInfo> = {}): MethodInfo {
  return { name, visibility: "public", params: [], ...over };
}

function klass(name: string, over: Partial<ClassInfo> = {}): ClassInfo {
  return { name, includes: [], extends: [], instanceMethods: [], classMethods: [], ...over };
}

function man(
  source: "ruby" | "typescript",
  classes: Record<string, ClassInfo>,
  modules: Record<string, ClassInfo> = {},
): ApiManifest {
  return { source, generatedAt: "now", packages: { activerecord: { classes, modules } } };
}

describe("diffManifests", () => {
  it("detects added/removed classes and modules by kind", () => {
    const base = man("ruby", { Old: klass("Old"), Kept: klass("Kept") }, { Gone: klass("Gone") });
    const target = man(
      "ruby",
      { Kept: klass("Kept"), New: klass("New") },
      { Fresh: klass("Fresh") },
    );
    const drift = diffManifests(base, target);
    const pkg = drift.packages[0];
    expect(pkg.addedClasses).toEqual([
      { name: "Fresh", kind: "module" },
      { name: "New", kind: "class" },
    ]);
    expect(pkg.removedClasses).toEqual([
      { name: "Gone", kind: "module" },
      { name: "Old", kind: "class" },
    ]);
    expect(drift.summary.addedClasses).toBe(2);
    expect(drift.summary.removedClasses).toBe(2);
  });

  it("detects added/removed methods without colliding static and instance namesakes", () => {
    const base = man("ruby", {
      Model: klass("Model", {
        instanceMethods: [method("save"), method("find")],
        classMethods: [method("find")],
      }),
    });
    const target = man("ruby", {
      Model: klass("Model", {
        instanceMethods: [method("save"), method("touch")],
        classMethods: [method("find")],
      }),
    });
    const c = diffManifests(base, target).packages[0].changedClasses[0];
    expect(c.addedMethods).toEqual([{ name: "touch", isStatic: false }]);
    expect(c.removedMethods).toEqual([{ name: "find", isStatic: false }]);
  });

  it("detects signature, visibility, and call-set changes", () => {
    const base = man("ruby", {
      Model: klass("Model", {
        instanceMethods: [
          method("find", { params: [{ name: "id", kind: "required" }] }),
          method("internalize", { visibility: "public" }),
          method("save", { calls: ["validate", "persist"] }),
        ],
      }),
    });
    const target = man("ruby", {
      Model: klass("Model", {
        instanceMethods: [
          method("find", {
            params: [
              { name: "id", kind: "required" },
              { name: "limit", kind: "optional", literal: { kind: "int", value: "10" } },
            ],
          }),
          method("internalize", { visibility: "private" }),
          method("save", { calls: ["validate", "commit", "audit"] }),
        ],
      }),
    });
    const drift = diffManifests(base, target);
    const byName = Object.fromEntries(
      drift.packages[0].changedClasses[0].changedMethods.map((m) => [m.name, m]),
    );
    expect(byName.find.signatureChanged).toEqual({
      before: "required id",
      after: "required id, optional limit=10",
    });
    expect(byName.internalize.visibilityChanged).toEqual({ before: "public", after: "private" });
    expect(byName.save.callsChanged).toEqual({ added: ["audit", "commit"], removed: ["persist"] });
    const { signatureChanges, visibilityChanges, callSetChanges } = drift.summary;
    expect([signatureChanges, visibilityChanges, callSetChanges]).toEqual([1, 1, 1]);
  });

  it("ignores one-sided packages and reports nothing for identical manifests", () => {
    const m = man("ruby", { Model: klass("Model", { instanceMethods: [method("save")] }) });
    const extra: ApiManifest = {
      ...m,
      packages: { ...m.packages, actionview: { classes: { V: klass("V") }, modules: {} } },
    };
    expect(diffManifests(m, extra).packages).toEqual([]); // actionview only one-sided
    expect(diffManifests(m, m).packages).toEqual([]);
  });
});

describe("annotateAgainstTs", () => {
  it("marks classes/methods in the TS surface ported and counts portedAffected", () => {
    const base = man("ruby", {
      Model: klass("Model", {
        instanceMethods: [method("save", { params: [{ name: "x", kind: "required" }] })],
      }),
      Gone: klass("Gone"),
    });
    const target = man("ruby", {
      Model: klass("Model", { instanceMethods: [method("save")] }),
      Fresh: klass("Fresh"),
    });
    const ts = man("typescript", { Model: klass("Model"), Gone: klass("Gone") });
    const drift = annotateAgainstTs(diffManifests(base, target), ts);
    const pkg = drift.packages[0];
    expect(pkg.removedClasses.find((c) => c.name === "Gone")!.ported).toBe(true);
    expect(pkg.addedClasses.find((c) => c.name === "Fresh")!.ported).toBe(false);
    const changed = pkg.changedClasses.find((c) => c.name === "Model")!;
    expect(changed.ported).toBe(true); // class is ported...
    expect(changed.changedMethods[0].ported).toBe(false); // ...but this method isn't
    expect(drift.summary.portedAffected).toBe(1); // only Gone (removed, ported)
  });
});
