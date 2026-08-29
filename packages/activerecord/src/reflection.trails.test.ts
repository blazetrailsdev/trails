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
    registerModel("User", TopUser);
    registerModel("Admin::User", NsAdminUser);
    const ref = reflectOnAssociation(NsAdminUser, "user");
    expect(ref!.klass).toBe(TopUser);
    const nsRef = reflectOnAssociation(NsAdminUser, "adminUser");
    expect(nsRef!.klass).toBe(NsAdminUser);
  });

  it("re-registering the same class under the same name keeps the klass memo", () => {
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
    expect(belongsToCounterCacheColumn(true, "Comment")).toBe("comments_count");
    expect(belongsToCounterCacheColumn(true, "Admin::Post")).toBe("posts_count");
    expect(belongsToCounterCacheColumn("legacy_comments_count", "Comment")).toBe(
      "legacy_comments_count",
    );
    expect(belongsToCounterCacheColumn(false, "Comment")).toBeNull();
  });

  it("create accepts a nil name without a cast", () => {
    class NilNameOwner extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel("NilNameOwner", NilNameOwner);
    const reflection = create("hasMany", null, null, {}, NilNameOwner);
    expect(reflection.name).toBeNull();
    expect(reflection.pluralName).toBe("");
  });

  it("nil name derivations coerce like Ruby to_s, not to the string null", () => {
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
    const configSnapshot = snapshotEncryptionConfig();
    configureEncryption();
    try {
      await EncryptedBookWithSerializedFirstBinary.loadSchema();
      const logo = EncryptedBookWithSerializedFirstBinary.columns().find(
        (c: { name: string }) => c.name === "logo",
      );
      expect(logo?.type).toBe("binary");
      expect(EncryptedBookWithSerializedFirstBinary.typeForAttribute("logo")).toBeInstanceOf(
        EncryptedAttributeType,
      );
    } finally {
      restoreEncryptionConfig(configSnapshot);
    }
  });

  it("source_reflection_name lets a missing model class NameError propagate", () => {
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
