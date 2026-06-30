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
import { Associations } from "./associations.js";
import {
  belongsToCounterCacheColumn,
  counterCacheColumnOption,
  resolveAliasedColumn,
} from "./reflection.js";
import { setupFixtures } from "./test-helpers/fixtures.js";

setupFixtures();

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
