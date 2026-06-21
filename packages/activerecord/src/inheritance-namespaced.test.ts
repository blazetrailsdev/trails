/**
 * Module-namespaced model names in STI `type` / polymorphic `*_type` columns
 * and `model_name`. Rails stores the full `::`-qualified constant name
 * (`sti_name` / `polymorphic_name` default `store_full_*` to true), and
 * `model_name` derives `singular`/`element`/i18n from the namespace segments.
 *
 * Test names mirror the Rails sources:
 * - `inheritance_test.rb` `test_class_with_store_full_sti_class_returns_full_name`
 * - `naming_test.rb` namespaced `model_name` fields.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { stiName, polymorphicName, qualifiedName, namespaceSegments } from "./inheritance.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import {
  ClothingItem,
  ClothingItemUsed,
  ClothingItemSized,
} from "./test-helpers/models/clothing-item.js";
import { AdminUser } from "./test-helpers/models/admin/user.js";
import { AdminAccount } from "./test-helpers/models/admin/account.js";

describe("InheritanceTest (module-namespaced sti_name)", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema({ clothing_items: canonicalSchema.clothing_items });
    await ClothingItem.loadSchema();
  });

  it("class with store full sti class returns full name", () => {
    expect(stiName(ClothingItemUsed)).toBe("ClothingItem::Used");
    expect(stiName(ClothingItemSized)).toBe("ClothingItem::Sized");
  });

  it("should store full class name with store full sti class option enabled", async () => {
    const used = await ClothingItemUsed.create({ clothing_type: "pants", color: "blue" });
    expect((used as { type: string }).type).toBe("ClothingItem::Used");
  });

  it("finds the namespaced subclass from the persisted full type", async () => {
    await ClothingItemUsed.create({ clothing_type: "pants", color: "blue" });
    const found = await ClothingItem.findBy({ clothing_type: "pants", color: "blue" });
    expect(found).toBeInstanceOf(ClothingItemUsed);
    expect((found as { type: string }).type).toBe("ClothingItem::Used");
  });
});

describe("module-namespaced qualifiedName / polymorphic_name", () => {
  it("qualifiedName prepends the module path to the demodulized name", () => {
    expect(qualifiedName(ClothingItemUsed)).toBe("ClothingItem::Used");
    expect(qualifiedName(AdminUser)).toBe("Admin::User");
  });

  it("namespaceSegments splits moduleName, or [] when absent", () => {
    expect(namespaceSegments(AdminUser)).toEqual(["Admin"]);
    expect(namespaceSegments(ClothingItem)).toEqual([]);
  });

  it("polymorphic_name returns the full base_class name", () => {
    // STI subclass folds to its base; the namespaced base name is qualified.
    expect(polymorphicName(ClothingItemUsed)).toBe("ClothingItem");
    expect(polymorphicName(AdminUser)).toBe("Admin::User");
  });
});

describe("NamingTest (Admin::User model_name)", () => {
  it("name is the full qualified constant", () => {
    expect(AdminUser.modelName.name).toBe("Admin::User");
    expect(AdminAccount.modelName.name).toBe("Admin::Account");
  });

  it("singular flattens the module path with underscores", () => {
    expect(AdminUser.modelName.singular).toBe("admin_user");
  });

  it("element is the demodulized tail", () => {
    expect(AdminUser.modelName.element).toBe("user");
  });

  it("i18n key is the underscored path form", () => {
    expect(AdminUser.modelName.i18nKey).toBe("admin/user");
  });

  it("param key drops the namespace prefix", () => {
    expect(AdminUser.modelName.paramKey).toBe("user");
  });
});
