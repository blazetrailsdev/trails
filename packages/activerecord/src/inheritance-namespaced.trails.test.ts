import { describe, it, expect, beforeAll } from "vitest";
import { moduleParent, moduleParents } from "@blazetrails/activesupport";
import { rbModName } from "@blazetrails/ruby-compat";
import { stiName, polymorphicName } from "./inheritance.js";
import { fixtures } from "./test-fixtures.js";
import {
  ClothingItem,
  ClothingItemUsed,
  ClothingItemSized,
} from "./test-helpers/models/clothing-item.js";
import { AdminUser } from "./test-helpers/models/admin/user.js";
import { AdminAccount } from "./test-helpers/models/admin/account.js";

describe("InheritanceTest (module-namespaced sti_name)", () => {
  fixtures([]);
  beforeAll(async () => {
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

describe("module-namespaced name / polymorphic_name", () => {
  it("name is the constant path", () => {
    expect(rbModName(ClothingItemUsed)).toBe("ClothingItem::Used");
    expect(rbModName(AdminUser)).toBe("Admin::User");
  });

  it("module_parent resolves the top-level parent constant", () => {
    expect(moduleParent(ClothingItemUsed)).toBe(ClothingItem);
    expect(moduleParents(ClothingItemUsed)).toEqual([ClothingItem, Object]);
    expect(ClothingItemUsed.modelName.name).toBe("ClothingItem::Used");
  });

  it("polymorphic_name returns the full base_class name", () => {
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

  it("param key keeps the namespace prefix (Admin is not an isolated engine namespace)", () => {
    expect(AdminUser.modelName.paramKey).toBe("admin_user");
  });
});

describe("namespaced STI hydration goes through the single instantiate path", () => {
  fixtures([]);

  it("terminates on the namespaced subclass instead of re-dispatching", () => {
    const record = ClothingItemSized._instantiate({
      id: "5",
      clothing_type: "pants",
      color: "blue",
      size: "M",
      type: "ClothingItem::Sized",
    });

    expect(record).toBeInstanceOf(ClothingItemSized);
    expect(record.id).toBe(5);
  });
});
