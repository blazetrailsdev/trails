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
import {
  configureEncryption,
  snapshotEncryptionConfig,
  restoreEncryptionConfig,
} from "./encryption/test-helpers.js";
import { EncryptedBookWithSerializedFirstBinary } from "./test-helpers/models/book-encrypted.js";
import { EncryptedAttributeType } from "./encryption/encrypted-attribute-type.js";
import { Associations } from "./associations.js";
import {
  ThroughReflection,
  belongsToCounterCacheColumn,
  counterCacheColumnOption,
  create,
} from "./reflection.js";
import { fixtures } from "./test-fixtures.js";

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
    registerModel("ShStableTarget", ShStableTarget);
    expect(ref.klass).toBe(ShStableTarget);
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

  it("create accepts a nil name without a cast", () => {
    // Rails' Reflection.create tolerates a nil name (reflection_test.rb:126).
    // TS-only guard: the signature must admit null so callers need no cast.
    class NilNameOwner extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel("NilNameOwner", NilNameOwner);
    const reflection = create("hasMany", null, null, {}, NilNameOwner);
    expect(reflection.name).toBeNull();
    // Ruby's `nil.to_s.pluralize` is "", not a raise.
    expect(reflection.pluralName).toBe("");
  });

  it("nil name derivations coerce like Ruby to_s, not to the string null", () => {
    // Rails stores `@name = name` but every string derivation interpolates or
    // calls to_s (reflection.rb:453, :821-825, :829), so nil yields the
    // empty-name forms. JS template strings would render "null" instead.
    class NilDerivOwner extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel("NilDerivOwner", NilDerivOwner);

    const hasMany = create("hasMany", null, null, {}, NilDerivOwner);
    expect(hasMany.className).toBe("");

    const belongsTo = create("belongsTo", null, null, {}, NilDerivOwner);
    expect(belongsTo.className).toBe("");
    expect(belongsTo.foreignKey).toBe("_id");

    const poly = create("belongsTo", null, null, { polymorphic: true }, NilDerivOwner);
    expect(poly.foreignType).toBe("_type");
  });

  it("nil name through-source inference coerces like Ruby to_s", () => {
    // Rails: options[:source] ? [options[:source]] : [name.to_s.singularize, name].uniq
    // (reflection.rb:1109) — the singular candidate is coerced, the second is
    // the raw name. singularize(null) would otherwise throw or infer wrongly.
    class NilThroughOwner extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel("NilThroughOwner", NilThroughOwner);

    const through = create(
      "hasMany",
      null,
      null,
      { through: "nilThroughs" },
      NilThroughOwner,
    ) as ThroughReflection;
    expect(through.sourceReflectionNames()).toEqual(["", null]);
  });

  it("plural_name honors pluralize_table_names", () => {
    // Rails: active_record.pluralize_table_names ? name.to_s.pluralize : name.to_s
    // (reflection.rb:395). We previously pluralized unconditionally.
    class PluralOwner extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class SingularOwner extends Base {
      static pluralizeTableNames = false;
      static {
        this.attribute("name", "string");
      }
    }
    registerModel("PluralOwner", PluralOwner);
    registerModel("SingularOwner", SingularOwner);
    expect(create("hasMany", "comment", null, {}, PluralOwner).pluralName).toBe("comments");
    expect(create("hasMany", "comment", null, {}, SingularOwner).pluralName).toBe("comment");
  });

  it("columns reports the column's own type, not the decorated cast type", async () => {
    // Rails' `columns` is `columns_hash.values` (model_schema.rb:432-434) —
    // schema-sourced, never attribute-decorated. trails previously built it
    // from `_attributeDefinitions[].type.constructor.name`, so a decorated
    // column (serialize + encrypts here) reported the wrapper class instead
    // of the column's own type.
    const configSnapshot = snapshotEncryptionConfig();
    configureEncryption();
    try {
      await EncryptedBookWithSerializedFirstBinary.loadSchema();
      const logo = EncryptedBookWithSerializedFirstBinary.columns().find(
        (c: { name: string }) => c.name === "logo",
      );
      expect(logo?.type).toBe("binary");
      // The attribute definition stays decorated — only `columns()` reads
      // the schema column (the encryption idempotence guard depends on it).
      expect(EncryptedBookWithSerializedFirstBinary.typeForAttribute("logo")).toBeInstanceOf(
        EncryptedAttributeType,
      );
    } finally {
      restoreEncryptionConfig(configSnapshot);
    }
  });

  it("source_reflection_name lets a missing model class NameError propagate", () => {
    // reflection.rb:1112-1130 has no rescue: `through_reflection.klass` raising
    // NameError for an unregistered model propagates naming that model. trails
    // used to swallow every error here and memoize a nil source name, which
    // resurfaced from check_validity! as
    // HasManyThroughSourceAssociationNotFoundError — an error naming the wrong
    // cause.
    class NeMember extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("neMemberships", {});
        this.hasMany("neClubs", { through: "neMemberships" });
      }
    }
    registerModel("NeMember", NeMember);

    const ref = reflectOnAssociation(NeMember, "neClubs") as ThroughReflection;
    expect(() => ref.sourceReflectionName()).toThrow(
      "Missing model class NeMembership for the NeMember#neMemberships association.",
    );
  });
});
