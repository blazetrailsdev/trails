import { describe, it, expect } from "vitest";
import { resolveMixinParent } from "./rails-file-structure-mixins.js";

describe("resolveMixinParent", () => {
  // The live case: a nested InstanceMethods module of a ported class flattens
  // onto that class rather than the manifest's `functions` bucket.
  const classes = new Set([
    "ActiveModel::Type::Helpers::AcceptsMultiparameterTime",
    "ActiveRecord::QueryCache",
  ]);
  const isClassFqn = (fqn: string) => classes.has(fqn);

  it("maps InstanceMethods of a class to that class, instance-scoped", () => {
    expect(
      resolveMixinParent(
        "ActiveModel::Type::Helpers::AcceptsMultiparameterTime::InstanceMethods",
        isClassFqn,
      ),
    ).toEqual({
      className: "AcceptsMultiparameterTime",
      parentFqn: "ActiveModel::Type::Helpers::AcceptsMultiparameterTime",
      extendsSingleton: false,
    });
  });

  it("maps ClassMethods of a class to that class, singleton-scoped (extend)", () => {
    expect(resolveMixinParent("ActiveRecord::QueryCache::ClassMethods", isClassFqn)).toEqual({
      className: "QueryCache",
      parentFqn: "ActiveRecord::QueryCache",
      extendsSingleton: true,
    });
  });

  it("does not sweep InstanceMethods/ClassMethods of a MODULE parent", () => {
    // The overwhelmingly common shape: a concern (module) with a ClassMethods
    // sub-module. These port as standalone functions, not onto a class.
    expect(resolveMixinParent("ActiveRecord::Persistence::ClassMethods", isClassFqn)).toBeNull();
  });

  it("ignores arbitrarily-named nested modules of a class", () => {
    expect(resolveMixinParent("ActiveRecord::QueryCache::Runtime", isClassFqn)).toBeNull();
  });

  it("returns null for a top-level module with no parent", () => {
    expect(resolveMixinParent("InstanceMethods", isClassFqn)).toBeNull();
  });
});
