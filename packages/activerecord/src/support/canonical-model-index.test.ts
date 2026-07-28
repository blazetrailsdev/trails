import { describe, it, expect } from "vitest";
import { canonicalModelIndex } from "./canonical-model-index.js";
import { autoloadModel, modelRegistry, registerModel } from "../associations.js";
import { constantize, registerConstant, safeConstantize } from "@blazetrails/activesupport";

/** Autoload-then-constantize: the two-step every AR call site now spells out. */
function resolve(name: string): unknown {
  autoloadModel(name);
  return constantize(name);
}
import { Comment } from "../test-helpers/models/comment.js";
import { Owner } from "../test-helpers/models/owner.js";
import { Pet } from "../test-helpers/models/pet.js";
import { Reply } from "../test-helpers/models/reply.js";
import { MyAppBusinessCompany } from "../test-helpers/models/company-in-module.js";

describe("canonical model autoload index (Zeitwerk analog)", () => {
  it("indexes canonical models by their class name", () => {
    // Association-target-only models (no fixture set of their own) are present
    // so they resolve on first reference without a manual `registerModel`.
    expect(canonicalModelIndex.get("Comment")).toBe(Comment);
    expect(canonicalModelIndex.get("Owner")).toBe(Owner);
  });

  it("indexes namespaced models under their `::`-qualified Ruby name", () => {
    // Rails resolves a namespaced association target through the namespace walk
    // (`MyApplication::Business::Company`), not the flat JS constructor name, so
    // the index must carry the qualified key for the walk to hit it.
    expect(canonicalModelIndex.get("MyApplication::Business::Company")).toBe(MyAppBusinessCompany);
    expect(resolve("MyApplication::Business::Company")).toBe(MyAppBusinessCompany);
  });

  it("resolveModel autoloads an indexed model on a registry miss", () => {
    // Whether or not another test already registered it, the two-step returns
    // the canonical class — the fallback covers the un-registered case.
    expect(resolve("Comment")).toBe(Comment);
    expect(resolve("Owner")).toBe(Owner);
  });

  it("autoloads an association-target model through reflection's computeClass", () => {
    // `Pet belongsTo owner` names `Owner` only as a target — no fixture set, no
    // manual `registerModel`. Resolving the reflection's `.klass` must autoload
    // it via the fallback (reflection.ts computeClass), the empirical anchor for
    // this part (HasManyReflection/BelongsToReflection._klass).
    const refl = (
      Pet as unknown as { _reflectOnAssociation(name: string): { klass: unknown } }
    )._reflectOnAssociation("owner");
    expect(refl.klass).toBe(Owner);
  });

  it("autoloads through a `::`-prefixed absolute name", () => {
    // reflection.ts `_klass` tries `computeClass("::#{class_name}")` first
    // (reflection.rb:427). `constantize` strips the prefix itself, so
    // `autoloadModel` must too — otherwise the index (keyed unprefixed) misses
    // and an index-only model can never be faulted in on that path.
    expect(resolve("::Pet")).toBe(Pet);
  });

  it("faults in a model that is constantize-able but absent from the registry", () => {
    // registerSubclass (inheritance.ts:416) and the adapter setter
    // (base.ts:1358) write the constant table WITHOUT registerModel, so an STI
    // subclass can resolve through constantize while missing from
    // modelRegistry — which the join planner reads directly
    // (join-dependency.ts:344,371). autoloadModel must therefore gate on the
    // registry, not on safeConstantize, or the fault-in is skipped and the join
    // silently builds no node.
    const had = modelRegistry.get("Reply");
    modelRegistry.delete("Reply"); // write-through drops the constant too
    registerConstant("Reply", Reply); // re-create registerSubclass's half alone
    try {
      expect(safeConstantize("Reply")).toBe(Reply);
      expect(modelRegistry.has("Reply")).toBe(false);
      autoloadModel("Reply");
      expect(modelRegistry.has("Reply")).toBe(true);
    } finally {
      if (had) registerModel("Reply", had);
    }
  });

  it("throws a constant-not-found error for a genuine miss", () => {
    // A name in neither the registry nor the index must still throw, so the
    // fallback can never silently mask a missing or misnamed model.
    expect(() => resolve("NoSuchCanonicalModel")).toThrow(
      /uninitialized constant NoSuchCanonicalModel/,
    );
  });
});
