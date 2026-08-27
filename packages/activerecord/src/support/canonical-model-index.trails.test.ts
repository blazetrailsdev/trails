import { describe, it, expect } from "vitest";
import { canonicalModelIndex } from "./canonical-model-index.js";
import { autoloadModel, modelRegistry, registerModel } from "../associations.js";
import { constantize, registerConstant, safeConstantize } from "@blazetrails/activesupport";

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
    expect(canonicalModelIndex.get("Comment")).toBe(Comment);
    expect(canonicalModelIndex.get("Owner")).toBe(Owner);
  });

  it("indexes namespaced models under their `::`-qualified Ruby name", () => {
    expect(canonicalModelIndex.get("MyApplication::Business::Company")).toBe(MyAppBusinessCompany);
    expect(resolve("MyApplication::Business::Company")).toBe(MyAppBusinessCompany);
  });

  it("resolveModel autoloads an indexed model on a registry miss", () => {
    expect(resolve("Comment")).toBe(Comment);
    expect(resolve("Owner")).toBe(Owner);
  });

  it("autoloads an association-target model through reflection's computeClass", () => {
    const refl = (
      Pet as unknown as { _reflectOnAssociation(name: string): { klass: unknown } }
    )._reflectOnAssociation("owner");
    expect(refl.klass).toBe(Owner);
  });

  it("autoloads through a `::`-prefixed absolute name", () => {
    expect(resolve("::Pet")).toBe(Pet);
  });

  it("faults in a model that is constantize-able but absent from the registry", () => {
    const had = modelRegistry.get("Reply");
    modelRegistry.delete("Reply");
    registerConstant("Reply", Reply);
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
    expect(() => resolve("NoSuchCanonicalModel")).toThrow(
      /uninitialized constant NoSuchCanonicalModel/,
    );
  });
});
