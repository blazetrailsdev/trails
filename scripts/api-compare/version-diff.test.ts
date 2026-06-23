import { describe, expect, it } from "vitest";

import type { ApiManifest, ClassInfo, MethodInfo, ParamInfo } from "./types.js";
import { annotateAgainstTs, diffManifests } from "./version-diff.js";

function method(name: string, over: Partial<MethodInfo> = {}): MethodInfo {
  return { name, visibility: "public", params: [], ...over };
}
const hashOpt = (def: string): ParamInfo => ({
  name: "opts",
  kind: "keyword",
  default: def,
  literal: { kind: "hash" },
});
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
    const target = man("ruby", { Kept: klass("Kept"), New: klass("New") }, { Up: klass("Up") });
    const pkg = diffManifests(base, target).packages[0];
    const fmt = (cs: { kind: string; name: string }[]) => cs.map((c) => `${c.kind}:${c.name}`);
    expect(fmt(pkg.addedClasses)).toEqual(["class:New", "module:Up"]);
    expect(fmt(pkg.removedClasses)).toEqual(["module:Gone", "class:Old"]);
  });

  it("detects added/removed methods without colliding static and instance namesakes", () => {
    const M = (insts: string[], statics: string[]) =>
      man("ruby", {
        M: klass("M", {
          instanceMethods: insts.map((n) => method(n)),
          classMethods: statics.map((n) => method(n)),
        }),
      });
    const c = diffManifests(M(["save", "find"], ["find"]), M(["save", "touch"], ["find"]))
      .packages[0].changedClasses[0];
    expect(c.addedMethods).toEqual([{ name: "touch", isStatic: false }]);
    expect(c.removedMethods).toEqual([{ name: "find", isStatic: false }]);
  });

  it("detects signature (incl. non-primitive default text), visibility, and call-set changes", () => {
    const find = (extra: ParamInfo[], opts: string) =>
      method("find", { params: [{ name: "id", kind: "required" }, ...extra, hashOpt(opts)] });
    const base = man("ruby", {
      M: klass("M", {
        instanceMethods: [
          find([], "{}"),
          method("vis"),
          method("save", { calls: ["validate", "persist"] }),
        ],
      }),
    });
    const target = man("ruby", {
      M: klass("M", {
        instanceMethods: [
          find(
            [{ name: "limit", kind: "optional", literal: { kind: "int", value: "10" } }],
            "{ a: 1 }",
          ),
          method("vis", { visibility: "private" }),
          method("save", { calls: ["validate", "commit", "audit"] }),
        ],
      }),
    });
    const changed = diffManifests(base, target).packages[0].changedClasses[0].changedMethods;
    const byName = Object.fromEntries(changed.map((m) => [m.name, m]));
    // opts={}→{ a: 1 } is a hash default (literal.value undefined) — caught only via p.default fallback.
    expect(byName.find.signatureChanged).toEqual({
      before: "required id, keyword opts={}",
      after: "required id, optional limit=10, keyword opts={ a: 1 }",
    });
    expect(byName.vis.visibilityChanged).toEqual({ before: "public", after: "private" });
    expect(byName.save.callsChanged).toEqual({ added: ["audit", "commit"], removed: ["persist"] });
  });

  it("skips one-sided packages (extraction asymmetry) and identical manifests", () => {
    const m = man("ruby", { M: klass("M", { instanceMethods: [method("save")] }) });
    const extra: ApiManifest = {
      ...m,
      packages: { ...m.packages, actionview: { classes: { V: klass("V") }, modules: {} } },
    };
    expect(diffManifests(m, extra).packages).toEqual([]); // actionview only one-sided
    expect(diffManifests(m, m).packages).toEqual([]);
  });
});

describe("annotateAgainstTs", () => {
  it("flags ported classes and added/removed/changed methods, and counts them", () => {
    const base = man("ruby", {
      M: klass("M", {
        instanceMethods: [
          method("save", { params: [{ name: "x", kind: "required" }] }),
          method("legacy"),
        ],
      }),
      Gone: klass("Gone"),
    });
    const target = man("ruby", {
      M: klass("M", { instanceMethods: [method("save"), method("touch")] }),
      Fresh: klass("Fresh"),
    });
    const ts = man("typescript", { M: klass("M"), Gone: klass("Gone") }); // TS has M (no methods) + Gone
    const drift = annotateAgainstTs(diffManifests(base, target), ts);
    const pkg = drift.packages[0];
    expect(pkg.removedClasses.find((c) => c.name === "Gone")!.ported).toBe(true);
    expect(pkg.addedClasses.find((c) => c.name === "Fresh")!.ported).toBe(false);
    const c = pkg.changedClasses[0];
    expect(c.ported).toBe(true); // class M is ported
    expect(c.addedMethods[0].ported).toBe(true); // touch — ported via class
    expect(c.removedMethods[0].ported).toBe(true); // legacy — ported via class
    expect(c.changedMethods[0].ported).toBe(false); // save — not in our TS M
    expect(drift.summary.portedAffected).toBe(3); // Gone + touch + legacy; changed save excluded
  });
});
