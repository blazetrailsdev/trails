/**
 * trails-specific reflection invariants with no Rails counterpart in
 * reflection_test.rb. These guard TS/JS-only behaviors: the runtime
 * className/sourceType guard rejects only ES classes (Ruby's
 * `options[name].class == Class` check has no direct JS analog), the
 * demodulize-top-level-first klass resolution branch, and the internal
 * counter-cache column helpers exported from reflection.ts.
 */
import { describe, it, expect } from "vitest";
import { Base, reflectOnAssociation, registerModel } from "./index.js";
import { Associations, modelRegistry } from "./associations.js";
import {
  AssociationReflection,
  ThroughReflection,
  belongsToCounterCacheColumn,
  counterCacheColumnOption,
  resolveAliasedColumn,
} from "./reflection.js";
import { fixtures } from "./test-helpers/fixtures.js";

fixtures({});

describe("ReflectionTest", () => {
  it("plain function for source type does not raise (only ES classes are rejected)", () => {
    // Same Rails semantics as the className case, exercised through
    // ThroughReflection so the helper's lift to AbstractReflection is
    // covered for both call sites.
    class NsTagB extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class NsPostB extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel("NsTagB", NsTagB);
    registerModel("NsPostB", NsPostB);
    const fn = function namedFactory() {
      return "NsPostB";
    };
    expect(() =>
      Associations.hasMany.call(NsTagB, "taggedPostsB", {
        through: "taggings",
        source: "taggable",
        // @ts-expect-error sourceType typed as string; here we exercise the runtime guard
        sourceType: fn,
      }),
    ).not.toThrow();
  });

  it("plain function for class name does not raise (only ES classes are rejected)", () => {
    // Rails check is `options[option_name].class == Class` — only literal
    // Class instances are rejected; a Proc or other callable passes through
    // (it is not invoked as a factory, just not flagged here). We mirror
    // that by matching `/^class[\s{]/` on Function.prototype.toString so
    // plain functions are accepted at construction. Downstream resolution
    // still expects a string and will fail later if the user passes a
    // non-string — same as Rails.
    class HostA extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class TargetA extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel("HostA", HostA);
    registerModel("TargetA", TargetA);
    const fn = function namedFactory() {
      return "TargetA";
    };
    expect(() =>
      // @ts-expect-error className typed as string; here we exercise the runtime guard
      Associations.hasMany.call(HostA, "targetAs", { className: fn }),
    ).not.toThrow();
  });

  it("reflection klass demodulize top-level-first resolution", async () => {
    // Rails _klass: when demodulize(activeRecord.name) == className,
    // top-level ::ClassName is tried before namespace-relative lookup.
    class TopUser extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class NsAdminUser extends Base {
      static {
        this.attribute("name", "string");
        this.hasOne("user", {});
        this.hasOne("adminUser", { className: "Admin::User" });
      }
    }
    // Top-level "User" and namespaced "Admin::User" are both in the registry.
    registerModel("User", TopUser);
    registerModel("Admin::User", NsAdminUser);
    // NsAdminUser.demodulize("Admin::User") == "User" == className("user")
    // → _klass tries ::User first → resolves to top-level TopUser
    const ref = reflectOnAssociation(NsAdminUser, "user");
    expect(ref!.klass).toBe(TopUser);
    // When className is explicitly qualified it bypasses the demodulize path
    const nsRef = reflectOnAssociation(NsAdminUser, "adminUser");
    expect(nsRef!.klass).toBe(NsAdminUser);
  });

  it("reflection klass re-resolves when the registry rebinds the class name", () => {
    // The klass memo is keyed by class NAME via the global modelRegistry, so a
    // model re-registered under a name a reflection already resolved must not
    // keep serving the old class (a bespoke registration in one test file would
    // otherwise poison canonical reflections for the whole vitest worker).
    class ShFirstTarget extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class ShSecondTarget extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class ShOwner extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("shTargets", { className: "ShTarget" });
      }
    }
    registerModel("ShOwner", ShOwner);
    registerModel("ShTarget", ShFirstTarget);

    const ref = reflectOnAssociation(ShOwner, "shTargets")!;
    expect(ref.klass).toBe(ShFirstTarget);
    // Memoized while the registry is unchanged.
    expect(ref.klass).toBe(ShFirstTarget);

    registerModel("ShTarget", ShSecondTarget);
    expect(ref.klass).toBe(ShSecondTarget);
  });

  it("re-registering the same class under the same name keeps the klass memo", () => {
    // Registration is idempotent and happens constantly during model loading;
    // only a rebind to a *different* class may invalidate a memo.
    class ShStableTarget extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class ShStableOwner extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("shStableTargets", { className: "ShStableTarget" });
      }
    }
    registerModel("ShStableOwner", ShStableOwner);
    registerModel("ShStableTarget", ShStableTarget);

    const ref = reflectOnAssociation(ShStableOwner, "shStableTargets")!;
    expect(ref.klass).toBe(ShStableTarget);
    const generationBefore = modelRegistry.generation;
    expect(typeof generationBefore).toBe("number");
    registerModel("ShStableTarget", ShStableTarget);
    expect(modelRegistry.generation).toBe(generationBefore);
    expect(ref.klass).toBe(ShStableTarget);
  });

  it("inverse_of re-resolves when the registry rebinds the class name", () => {
    // inverseOf/inverseName memo values resolved off `this.klass` — an inverse
    // reflection owned by the target class, and a name derived from scanning it.
    // They have to heal with `klass`, or a healed klass still hands back the
    // previous target's reflection.
    class ShInvFirst extends Base {
      static {
        this.attribute("name", "string");
        this.belongsTo("shInvOwner", { className: "ShInvOwner" });
      }
    }
    class ShInvSecond extends Base {
      static {
        this.attribute("name", "string");
        this.belongsTo("shInvOwner", { className: "ShInvOwner" });
      }
    }
    class ShInvOwner extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("shInvTargets", { className: "ShInvTarget" });
      }
    }
    registerModel("ShInvOwner", ShInvOwner);
    registerModel("ShInvTarget", ShInvFirst);

    const ref = reflectOnAssociation(ShInvOwner, "shInvTargets") as AssociationReflection;
    expect(ref.inverseOf()!.activeRecord).toBe(ShInvFirst);

    registerModel("ShInvTarget", ShInvSecond);
    expect(ref.klass).toBe(ShInvSecond);
    expect(ref.inverseOf()!.activeRecord).toBe(ShInvSecond);
  });

  it("through reflection inverse_of re-resolves when the registry rebinds the class name", () => {
    // ThroughReflection keeps its own _inverseOfCache holding a reflection
    // resolved off its klass, so it needs the same gate as the
    // AssociationReflection memo — a healed klass must not still hand back an
    // inverse owned by the previous target.
    class TiTagFirst extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("tiPosts", { className: "TiPost" });
      }
    }
    class TiTagSecond extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("tiPosts", { className: "TiPost" });
      }
    }
    class TiTagging extends Base {
      static {
        this.attribute("name", "string");
        this.belongsTo("tiTag", { className: "TiTag" });
      }
    }
    class TiPost extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("tiTaggings", { className: "TiTagging" });
        this.hasMany("tiTags", { through: "tiTaggings", source: "tiTag", inverseOf: "tiPosts" });
      }
    }
    registerModel("TiPost", TiPost);
    registerModel("TiTagging", TiTagging);
    registerModel("TiTag", TiTagFirst);

    const ref = reflectOnAssociation(TiPost, "tiTags") as ThroughReflection;
    expect(ref.inverseOf()!.activeRecord).toBe(TiTagFirst);

    registerModel("TiTag", TiTagSecond);
    expect(ref.klass).toBe(TiTagSecond);
    expect(ref.inverseOf()!.activeRecord).toBe(TiTagSecond);
  });

  it("through reflection source re-resolves when the through target is rebound", () => {
    // The shape of the PreloaderTest failure this fix targets: a bespoke
    // through model with no source association is registered first, poisoning
    // Post.tags' source/through memos; re-registering the real model must heal
    // them rather than keep raising SourceAssociationNotFound.
    class ShTag extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class ShSourcelessTagging extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class ShRealTagging extends Base {
      static {
        this.attribute("name", "string");
        this.belongsTo("shTag", { className: "ShTag" });
      }
    }
    class ShTaggedPost extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("shTaggings", { className: "ShTagging" });
        this.hasMany("shTags", { through: "shTaggings", source: "shTag" });
      }
    }
    registerModel("ShTag", ShTag);
    registerModel("ShTaggedPost", ShTaggedPost);
    registerModel("ShTagging", ShSourcelessTagging);

    const ref = reflectOnAssociation(ShTaggedPost, "shTags")!;
    // Sourceless target: no source reflection resolvable, and the memo sticks.
    expect(ref.sourceReflection).toBeNull();

    registerModel("ShTagging", ShRealTagging);
    expect(ref.sourceReflection).not.toBeNull();
    expect(ref.sourceReflection!.name).toBe("shTag");
    expect(ref.klass).toBe(ShTag);
  });

  it("counter cache column option extracts the explicit column from raw forms", () => {
    expect(counterCacheColumnOption(true)).toBeNull();
    expect(counterCacheColumnOption("custom_count")).toBe("custom_count");
    expect(counterCacheColumnOption({ column: "custom_count" })).toBe("custom_count");
    expect(counterCacheColumnOption({ active: true, column: null })).toBeNull();
    expect(counterCacheColumnOption(undefined)).toBeNull();
  });

  it("belongs_to counter cache column demodulizes a namespaced owner", () => {
    // Rails: active_record.name.demodulize.underscore.pluralize + _count
    expect(belongsToCounterCacheColumn(true, "Comment")).toBe("comments_count");
    expect(belongsToCounterCacheColumn(true, "Admin::Post")).toBe("posts_count");
    expect(belongsToCounterCacheColumn("legacy_comments_count", "Comment")).toBe(
      "legacy_comments_count",
    );
    expect(belongsToCounterCacheColumn(false, "Comment")).toBeNull();
  });

  it("resolves a snake_case counter column through a camelCase attribute alias", () => {
    const model = { _attributeAliases: { commentsCount: "legacy_comments_count" } };
    expect(resolveAliasedColumn(model, "comments_count")).toBe("legacy_comments_count");
    expect(resolveAliasedColumn(model, "replies_count")).toBe("replies_count");
    expect(resolveAliasedColumn(undefined, "comments_count")).toBe("comments_count");
  });
});
