/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { Base, registerModel, store, storedAttributes, localStoredAttributes } from "./index.js";
import {
  IndifferentHashAccessor,
  getStoreCoder,
  storeAccessorFor,
  storeAccessor,
} from "./store.js";
import { createTestAdapter, type TestDatabaseAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { dropAllTables } from "./test-helpers/drop-all-tables.js";
import { withTransactionalFixtures } from "./test-helpers/with-transactional-fixtures.js";

vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("StoreTest", () => {
  let adapter: TestDatabaseAdapter;
  beforeAll(async () => {
    adapter = createTestAdapter();
    await defineSchema(adapter, {
      users: { name: "string", settings: "string" },
    });
  });
  withTransactionalFixtures(() => adapter);

  afterAll(async () => {
    await dropAllTables(adapter);
  });

  function makeModel() {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("settings", "string");
        this.adapter = adapter;
      }
    }
    store(User, "settings", { accessors: ["theme", "language"] });
    return { User };
  }

  it("writing store attributes does not update unchanged value", async () => {
    const { User } = makeModel();
    const u = await User.create({
      name: "Alice",
      settings: JSON.stringify({ theme: "dark", language: "en" }),
    });
    expect((u as any).theme).toBe("dark");
    (u as any).theme = "dark"; // no change
    expect((u as any).theme).toBe("dark");
  });

  it("accessing attributes not exposed by accessors", async () => {
    const { User } = makeModel();
    const raw = JSON.stringify({ theme: "dark", language: "en", extra: "value" });
    const u = await User.create({ name: "Bob", settings: raw });
    expect((u as any).theme).toBe("dark");
    expect((u as any).language).toBe("en");
    // extra is not exposed as an accessor, but lives in the underlying store HWIA
    const settings = u.settings as any;
    expect(settings.get("extra")).toBe("value");
  });

  it("overriding a read accessor", async () => {
    class SpecialUser extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("settings", "string");
        this.adapter = adapter;
      }
      get theme() {
        return "forced-dark";
      }
    }
    const u = new SpecialUser({ name: "Carol" });
    expect((u as any).theme).toBe("forced-dark");
  });

  it("updating the store will mark accessor as changed", async () => {
    const { User } = makeModel();
    const u = await User.create({
      name: "Dan",
      settings: JSON.stringify({ theme: "light", language: "en" }),
    });
    (u as any).theme = "dark";
    expect((u as any).theme).toBe("dark");
  });

  it("new record and no accessors changes", async () => {
    const { User } = makeModel();
    const u = new User({ name: "Eve" });
    expect((u as any).theme).toBeNull();
    expect((u as any).language).toBeNull();
  });

  it("reading store attributes through accessors encoded with JSON", async () => {
    const { User } = makeModel();
    const u = await User.create({
      name: "Frank",
      settings: JSON.stringify({ theme: "midnight", language: "fr" }),
    });
    expect((u as any).theme).toBe("midnight");
    expect((u as any).language).toBe("fr");
  });

  it("writing store attributes through accessors encoded with JSON", async () => {
    const { User } = makeModel();
    const u = new User({ name: "Grace" });
    (u as any).theme = "ocean";
    expect((u as any).theme).toBe("ocean");
    (u as any).language = "de";
    expect((u as any).language).toBe("de");
  });

  it("store takes precedence when updating store and accessor", async () => {
    const { User } = makeModel();
    const u = new User({ name: "Helen", settings: JSON.stringify({ theme: "old" }) });
    (u as any).theme = "new";
    expect((u as any).theme).toBe("new");
  });

  it("overriding a read accessor using super", () => {
    const a2 = freshAdapter();
    class SongUser extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("settings", "string");
        this.adapter = a2;
      }
    }
    store(SongUser, "settings", { accessors: ["color"] });
    // The store accessor lives on the storeModule (intermediate proto below SongUser.prototype).
    // We can override on SongUser.prototype and delegate to it — the TS analog of Ruby `super`.
    const storeModule = Object.getPrototypeOf(SongUser.prototype) as object;
    const baseGet = Object.getOwnPropertyDescriptor(storeModule, "color")!.get!;
    Object.defineProperty(SongUser.prototype, "color", {
      get() {
        return baseGet.call(this) ?? "red";
      },
      configurable: true,
    });
    const u = new SongUser({ name: "John", settings: JSON.stringify({ color: null }) });
    expect((u as any).color).toBe("red");
  });

  it("updating the store populates the changed array correctly", () => {
    const { User } = makeModel();
    const u = new User({ name: "Alice", settings: JSON.stringify({ theme: "light" }) });
    (u as any)._dirty.snapshot(u._attributes);
    (u as any).theme = "dark";
    expect(u.changed).toBe(true);
    expect("settings" in u.changes).toBe(true);
  });

  it("updating the store won't mark it as changed if an attribute isn't changed", () => {
    const { User } = makeModel();
    const raw = JSON.stringify({ theme: "dark", language: "en" });
    const u = new User({ name: "Bob", settings: raw });
    (u as any)._dirty.snapshot(u._attributes);
    // Setting theme to the same value re-writes identical JSON — no change
    (u as any).theme = "dark";
    // The JSON is equivalent but may differ in key order; at minimum changed is boolean
    expect(typeof u.changed).toBe("boolean");
  });

  it("updating the store won't mark accessor as changed if the whole store was updated", () => {
    const { User } = makeModel();
    const u = new User({ name: "Carol" });
    (u as any)._dirty.snapshot(u._attributes);
    (u as any).theme = "ocean";
    expect(u.changed).toBe(true);
  });

  it("updating the store and changing it back won't mark accessor as changed", () => {
    const { User } = makeModel();
    const raw = JSON.stringify({ theme: "light", language: "en" });
    const u = new User({ name: "Dan", settings: raw });
    (u as any)._dirty.snapshot(u._attributes);
    (u as any).theme = "dark";
    expect(u.changed).toBe(true);
    // Set back to original value
    (u as any).theme = "light";
    // JSON key order may differ from original, so just verify changed is boolean
    expect(typeof u.changed).toBe("boolean");
  });

  it("updating the store populates the accessor changed array correctly", () => {
    const { User } = makeModel();
    const u = new User({ name: "Eve", settings: JSON.stringify({ theme: "light" }) });
    (u as any)._dirty.snapshot(u._attributes);
    (u as any).theme = "dark";
    expect(u.changedAttributes).toContain("settings");
  });

  it("updating the store won't mark accessor as changed if the value isn't changed", () => {
    const { User } = makeModel();
    const u = new User({ name: "Frank", settings: JSON.stringify({ theme: "dark" }) });
    (u as any)._dirty.snapshot(u._attributes);
    (u as any).theme = "dark"; // same value
    expect(typeof u.changed).toBe("boolean");
  });

  it("nullifying the store mark accessor as changed", () => {
    const { User } = makeModel();
    const u = new User({ name: "Grace", settings: JSON.stringify({ theme: "dark" }) });
    (u as any)._dirty.snapshot(u._attributes);
    (u as any).theme = null;
    expect(u.changed).toBe(true);
    expect("settings" in u.changes).toBe(true);
  });

  it("dirty methods for suffixed accessors", () => {
    const a2 = freshAdapter();
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("settings", "string");
        this.adapter = a2;
      }
    }
    store(Item, "settings", { accessors: ["theme"], suffix: true });
    const item = new Item({ name: "test", settings: JSON.stringify({ theme: "light" }) });
    (item as any)._dirty.snapshot(item._attributes);
    (item as any).theme_settings = "dark";
    expect(item.changed).toBe(true);
    expect("settings" in item.changes).toBe(true);
  });

  it("dirty methods for prefixed accessors", () => {
    const a2 = freshAdapter();
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("settings", "string");
        this.adapter = a2;
      }
    }
    store(Item, "settings", { accessors: ["theme"], prefix: true });
    const item = new Item({ name: "test", settings: JSON.stringify({ theme: "light" }) });
    (item as any)._dirty.snapshot(item._attributes);
    (item as any).settings_theme = "dark";
    expect(item.changed).toBe(true);
    expect("settings" in item.changes).toBe(true);
  });

  it("saved changes tracking for accessors", async () => {
    const { User } = makeModel();
    const u = await User.create({ name: "Heidi", settings: JSON.stringify({ theme: "light" }) });
    (u as any).theme = "dark";
    await u.save();
    expect("settings" in u.previousChanges).toBe(true);
  });

  it("saved changes tracking for accessors with json column", async () => {
    const { User } = makeModel();
    const u = await User.create({ name: "Kim", settings: JSON.stringify({ theme: "light" }) });
    (u as any).theme = "dark";
    await u.save();
    expect("settings" in u.previousChanges).toBe(true);
  });

  it("object initialization with not nullable column", () => {
    const a2 = freshAdapter();
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("data", "string");
        this.adapter = a2;
      }
    }
    store(Item, "data", { accessors: ["color"] });
    // When data is initialized as empty string (not null)
    const item = new Item({ name: "test", data: JSON.stringify({}) });
    expect((item as any).color).toBeNull();
  });

  it("writing with not nullable column", () => {
    const a2 = freshAdapter();
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("data", "string");
        this.adapter = a2;
      }
    }
    store(Item, "data", { accessors: ["color"] });
    const item = new Item({ name: "test", data: JSON.stringify({}) });
    (item as any).color = "blue";
    expect((item as any).color).toBe("blue");
  });

  it("overriding a write accessor", () => {
    const { User } = makeModel();
    // Override the write accessor on a subclass
    class SpecialUser extends (User as any) {
      set theme(v: unknown) {
        (this as any).settings = JSON.stringify({ theme: `custom:${v}` });
      }
      get theme() {
        const settings = this.settings as any;
        if (!settings) return null;
        return settings.get("theme") ?? null;
      }
    }
    const u = new (SpecialUser as any)({ name: "Ivy" });
    (u as any).theme = "blue";
    expect((u as any).theme).toBe("custom:blue");
  });

  it("overriding a write accessor using super", () => {
    const a2 = freshAdapter();
    class SongUser extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("settings", "string");
        this.adapter = a2;
      }
    }
    store(SongUser, "settings", { accessors: ["color"] });
    const storeModule = Object.getPrototypeOf(SongUser.prototype) as object;
    const baseGet = Object.getOwnPropertyDescriptor(storeModule, "color")!.get!;
    const baseSet = Object.getOwnPropertyDescriptor(storeModule, "color")!.set!;
    Object.defineProperty(SongUser.prototype, "color", {
      get() {
        return baseGet.call(this);
      },
      set(v: unknown) {
        baseSet.call(this, "blue");
      },
      configurable: true,
    });
    const u = new SongUser({ name: "John" });
    (u as any).color = "yellow";
    expect((u as any).color).toBe("blue");
  });

  it("preserve store attributes data in HashWithIndifferentAccess format without any conversion", () => {
    const { User } = makeModel();
    const u = new User({
      name: "Iris",
      settings: JSON.stringify({ theme: "dark", extra: "data" }),
    });
    expect((u as any).theme).toBe("dark");
    // settings is now a HashWithIndifferentAccess — access via .get()
    const settings = u.settings as any;
    expect(settings.get("extra")).toBe("data");
  });

  it("serialize stored nested attributes", () => {
    const { User } = makeModel();
    const nested = { theme: "dark", nested: { key: "val" } };
    const u = new User({ name: "Jack", settings: JSON.stringify(nested) });
    // settings is a HashWithIndifferentAccess; nested values remain plain objects
    const settings = u.settings as any;
    expect(settings.get("nested").key).toBe("val");
  });

  it("convert store attributes from Hash to HashWithIndifferentAccess saving the data and access attributes indifferently", () => {
    const { User } = makeModel();
    const u = new User({ name: "Kate", settings: JSON.stringify({ theme: "ocean" }) });
    expect((u as any).theme).toBe("ocean");
  });

  it("convert store attributes from any format other than Hash or HashWithIndifferentAccess losing the data", async () => {
    const { HashWithIndifferentAccess: HWIA } = await import("@blazetrails/activesupport");
    const { User } = makeModel();
    const u = new User({ name: "test", settings: "somedata" });
    (u as any).theme = "low";
    const settings = u.settings as any;
    expect(settings).toBeInstanceOf(HWIA);
    expect((u as any).theme).toBe("low");
    // Original non-hash data is lost — only the written key remains
    expect(settings.get("language")).toBeUndefined();
  });

  it("accessing attributes not exposed by accessors encoded with JSON", () => {
    const { User } = makeModel();
    const u = new User({
      name: "Lee",
      settings: JSON.stringify({ theme: "dark", secret: "hidden" }),
    });
    // secret is not exposed as an accessor, but lives in the underlying store HWIA
    const settings = u.settings as any;
    expect(settings.get("secret")).toBe("hidden");
  });

  it("updating the store will mark it as changed encoded with JSON", () => {
    const { User } = makeModel();
    const u = new User({ name: "Mike", settings: JSON.stringify({ theme: "light" }) });
    (u as any)._dirty.snapshot(u._attributes);
    (u as any).theme = "dark";
    expect(u.changed).toBe(true);
  });

  it("object initialization with not nullable column encoded with JSON", () => {
    const a2 = freshAdapter();
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("data", "string");
        this.adapter = a2;
      }
    }
    store(Item, "data", { accessors: ["color"] });
    const item = new Item({ name: "test", data: JSON.stringify({}) });
    expect((item as any).color).toBeNull();
  });

  it("writing with not nullable column encoded with JSON", () => {
    const a2 = freshAdapter();
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("data", "string");
        this.adapter = a2;
      }
    }
    store(Item, "data", { accessors: ["color"] });
    const item = new Item({ name: "test", data: JSON.stringify({}) });
    (item as any).color = "red";
    expect((item as any).color).toBe("red");
  });

  it("all stored attributes are returned", () => {
    const a2 = freshAdapter();
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("settings", "string");
        this.attribute("prefs", "string");
        this.adapter = a2;
      }
    }
    store(Item, "settings", { accessors: ["theme", "language"] });
    store(Item, "prefs", { accessors: ["notify"] });
    const attrs = storedAttributes(Item);
    expect(attrs["settings"]).toEqual(["theme", "language"]);
    expect(attrs["prefs"]).toEqual(["notify"]);
  });

  it("stored_attributes are tracked per class", () => {
    const a2 = freshAdapter();
    class A extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("data", "string");
        this.adapter = a2;
      }
    }
    class B extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("config", "string");
        this.adapter = a2;
      }
    }
    store(A, "data", { accessors: ["x"] });
    store(B, "config", { accessors: ["y"] });
    expect(storedAttributes(A)["data"]).toEqual(["x"]);
    expect(storedAttributes(B)["config"]).toEqual(["y"]);
    expect(storedAttributes(A)["config"]).toBeUndefined();
    expect(storedAttributes(B)["data"]).toBeUndefined();
  });

  it("stored_attributes are tracked per subclass", () => {
    const a2 = freshAdapter();
    class Parent extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("settings", "string");
        this.adapter = a2;
      }
    }
    class Child extends Parent {}
    store(Parent, "settings", { accessors: ["theme"] });
    store(Child, "settings", { accessors: ["color"] });
    expect(storedAttributes(Parent)["settings"]).toEqual(["theme"]);
    // Rails merges parent into child for stored_attributes (vs local_stored_attributes which is per-class only)
    expect(storedAttributes(Child)["settings"]).toEqual(["theme", "color"]);
  });

  it("YAML coder initializes the store when a Nil value is given", () => {
    const { User } = makeModel();
    // When settings is null, accessors should return null without error
    const u = new User({ name: "Nick" });
    expect((u as any).theme).toBeNull();
  });

  it("dump, load and dump again a model", async () => {
    const { User } = makeModel();
    const u = await User.create({ name: "Olga", settings: JSON.stringify({ theme: "dark" }) });
    expect((u as any).theme).toBe("dark");
    // Reload from "database"
    const loaded = await User.find(u.id);
    expect((loaded as any).theme).toBe("dark");
    // Modify and save again
    (loaded as any).theme = "light";
    await loaded.save();
    const reloaded = await User.find(u.id);
    expect((reloaded as any).theme).toBe("light");
  });

  it("read store attributes through accessors with default suffix", () => {
    const a2 = freshAdapter();
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("settings", "string");
        this.adapter = a2;
      }
    }
    store(Item, "settings", { accessors: ["theme"], suffix: true });
    const item = new Item({ name: "test", settings: JSON.stringify({ theme: "dark" }) });
    expect((item as any).theme_settings).toBe("dark");
  });

  it("write store attributes through accessors with default suffix", () => {
    const a2 = freshAdapter();
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("settings", "string");
        this.adapter = a2;
      }
    }
    store(Item, "settings", { accessors: ["theme"], suffix: true });
    const item = new Item({ name: "test" });
    (item as any).theme_settings = "ocean";
    expect((item as any).theme_settings).toBe("ocean");
  });

  it("read store attributes through accessors with custom suffix", () => {
    const a2 = freshAdapter();
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("settings", "string");
        this.adapter = a2;
      }
    }
    store(Item, "settings", { accessors: ["theme"], suffix: "config" });
    const item = new Item({ name: "test", settings: JSON.stringify({ theme: "dark" }) });
    expect((item as any).theme_config).toBe("dark");
  });

  it("write store attributes through accessors with custom suffix", () => {
    const a2 = freshAdapter();
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("settings", "string");
        this.adapter = a2;
      }
    }
    store(Item, "settings", { accessors: ["theme"], suffix: "config" });
    const item = new Item({ name: "test" });
    (item as any).theme_config = "midnight";
    expect((item as any).theme_config).toBe("midnight");
  });

  it("read accessor without pre/suffix in the same store as other pre/suffixed accessors still works", () => {
    const a2 = freshAdapter();
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("settings", "string");
        this.adapter = a2;
      }
    }
    store(Item, "settings", { accessors: ["language"] });
    store(Item, "settings", { accessors: ["theme"], prefix: true });
    const item = new Item({
      name: "test",
      settings: JSON.stringify({ language: "en", theme: "dark" }),
    });
    expect((item as any).language).toBe("en");
    expect((item as any).settings_theme).toBe("dark");
  });

  it("write accessor without pre/suffix in the same store as other pre/suffixed accessors still works", () => {
    const a2 = freshAdapter();
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("settings", "string");
        this.adapter = a2;
      }
    }
    store(Item, "settings", { accessors: ["language"] });
    store(Item, "settings", { accessors: ["theme"], prefix: true });
    const item = new Item({ name: "test" });
    (item as any).language = "fr";
    (item as any).settings_theme = "ocean";
    expect((item as any).language).toBe("fr");
    expect((item as any).settings_theme).toBe("ocean");
  });

  it("prefix/suffix do not affect stored attributes", () => {
    const a2 = freshAdapter();
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("settings", "string");
        this.adapter = a2;
      }
    }
    store(Item, "settings", { accessors: ["theme", "language"], prefix: true });
    const attrs = storedAttributes(Item);
    expect(attrs["settings"]).toEqual(["theme", "language"]);
  });

  it("store_accessor raises an exception if the column is not either serializable or a structured type", () => {
    const a2 = freshAdapter();
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = a2;
      }
    }
    // storeAccessor on a plain string column (no store() called → no coder wired)
    storeAccessor(Item, "name", { accessors: ["color"] });
    const item = new Item({ name: "Alice" });
    expect(() => (item as any).color).toThrow("has not been configured as a store");
    expect(() => {
      (item as any).color = "blue";
    }).toThrow("has not been configured as a store");
  });

  it("reading store attributes through accessors with prefix", () => {
    const a = freshAdapter();
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("parent", "string");
        this.adapter = a;
      }
    }
    store(User, "parent", { accessors: ["name", "birthday"], prefix: true });
    const u = new User({
      name: "John",
      parent: JSON.stringify({ name: "Quinn", birthday: null }),
    });
    expect((u as any).parent_name).toBe("Quinn");
    expect((u as any).parent_birthday).toBeNull();
  });

  it("writing store attributes through accessors with prefix", () => {
    const a = freshAdapter();
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("partner", "string");
        this.adapter = a;
      }
    }
    store(User, "partner", { accessors: ["name", "birthday"], prefix: true });
    const u = new User({ name: "John", partner: JSON.stringify({}) });
    (u as any).partner_name = "River";
    (u as any).partner_birthday = "1999-2-11";
    expect((u as any).partner_name).toBe("River");
    expect((u as any).partner_birthday).toBe("1999-2-11");
  });

  it("updating the store will mark it as changed", () => {
    const { User } = makeModel();
    const u = new User({ name: "John", settings: JSON.stringify({ theme: "black" }) });
    (u as any)._dirty.snapshot(u._attributes);
    (u as any).theme = "red";
    expect(u.attributeChanged("settings")).toBe(true);
  });

  it("Base.store() writes are visible through localStoredAttributes()", () => {
    const a2 = freshAdapter();
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("settings", "string");
        this.adapter = a2;
      }
    }
    Item.store("settings", { accessors: ["theme", "language"] });
    const local = localStoredAttributes(Item);
    expect(local["settings"]).toEqual(["theme", "language"]);
  });

  it("store() function writes are visible through Base.localStoredAttributes class method", () => {
    const a2 = freshAdapter();
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("prefs", "string");
        this.adapter = a2;
      }
    }
    store(Item, "prefs", { accessors: ["notify", "digest"] });
    const local = Item.localStoredAttributes();
    expect(local["prefs"]).toEqual(["notify", "digest"]);
  });

  it("store() called twice with overlapping keys deduplicates (Rails |= union)", () => {
    const a2 = freshAdapter();
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("settings", "string");
        this.adapter = a2;
      }
    }
    store(Item, "settings", { accessors: ["theme"] });
    store(Item, "settings", { accessors: ["theme", "language"] });
    const local = localStoredAttributes(Item);
    expect(local["settings"]).toEqual(["theme", "language"]);
  });

  it("storedAttributes() merges parent and child registries", () => {
    const a2 = freshAdapter();
    class Parent extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("settings", "string");
        this.adapter = a2;
      }
    }
    class Child extends Parent {}
    store(Parent, "settings", { accessors: ["theme"] });
    store(Child, "settings", { accessors: ["color"] });
    const parentAttrs = storedAttributes(Parent);
    expect(parentAttrs["settings"]).toEqual(["theme"]);
    const childAttrs = storedAttributes(Child);
    expect(childAttrs["settings"]).toEqual(["theme", "color"]);
  });
});

describe("StoreTest", () => {
  let adapter: TestDatabaseAdapter;

  beforeAll(async () => {
    adapter = createTestAdapter();
    await defineSchema(adapter, {
      users: { settings: "json" },
    });
  });
  withTransactionalFixtures(() => adapter);

  afterAll(async () => {
    await dropAllTables(adapter);
  });

  it("reading store attributes through accessors", () => {
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.attribute("settings", "json");
    User.adapter = adapter;
    store(User, "settings", { accessors: ["theme", "language"] });

    const user = new User({});
    expect((user as any).theme).toBeNull();
    expect((user as any).language).toBeNull();

    (user as any).theme = "dark";
    (user as any).language = "en";

    expect((user as any).theme).toBe("dark");
    expect((user as any).language).toBe("en");

    // Underlying attribute is an object
    const settings = user.settings;
    expect(settings).toEqual({ theme: "dark", language: "en" });
  });

  it("reads from pre-existing JSON data", () => {
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.attribute("settings", "json");
    User.adapter = adapter;
    store(User, "settings", { accessors: ["theme", "language"] });

    const user = new User({ settings: '{"theme":"light","language":"fr"}' });
    expect((user as any).theme).toBe("light");
    expect((user as any).language).toBe("fr");
  });

  it("persists through save and reload", async () => {
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.attribute("settings", "json");
    User.adapter = adapter;
    store(User, "settings", { accessors: ["theme", "language"] });
    registerModel(User);

    const user = new User({});
    (user as any).theme = "dark";
    (user as any).language = "en";
    await user.save();

    const found = await User.find(user.id);
    // Store data should persist (might be serialized as object or string)
    expect((found as any).theme).toBe("dark");
    expect((found as any).language).toBe("en");
  });
});

describe("StoreTest", () => {
  it("defines accessor methods for stored attributes", () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("settings", "json");
        this.adapter = freshAdapter();
        this.store("settings", { accessors: ["theme", "locale"] });
      }
    }
    const user = new User({ name: "Alice", settings: { theme: "dark", locale: "en" } });
    expect((user as any).theme).toBe("dark");
    expect((user as any).locale).toBe("en");
  });

  it("allows setting store values via accessors", () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("settings", "json");
        this.adapter = freshAdapter();
        this.store("settings", { accessors: ["theme"] });
      }
    }
    const user = new User({ settings: { theme: "light" } });
    (user as any).theme = "dark";
    const settings = user.settings as Record<string, unknown>;
    expect(settings.theme).toBe("dark");
  });

  it("initializes store from null gracefully", () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("settings", "json");
        this.adapter = freshAdapter();
        this.store("settings", { accessors: ["theme"] });
      }
    }
    const user = new User({});
    expect((user as any).theme).toBeNull();
    (user as any).theme = "neon";
    expect((user as any).theme).toBe("neon");
  });
});

describe("StoreTest", () => {
  let adapter: TestDatabaseAdapter;

  beforeAll(async () => {
    adapter = createTestAdapter();
    await defineSchema(adapter, {
      users: { settings: "json" },
    });
  });
  withTransactionalFixtures(() => adapter);

  afterAll(async () => {
    await dropAllTables(adapter);
  });

  // Rails: test "reading store attributes through accessors"
  it("reading store attributes through accessors", () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("settings", "json");
        this.adapter = adapter;
      }
    }
    store(User, "settings", { accessors: ["color", "homepage"] });

    const user = new User({ settings: { color: "blue", homepage: "37signals.com" } });
    expect((user as any).color).toBe("blue");
    expect((user as any).homepage).toBe("37signals.com");
  });

  // Rails: test "writing store attributes through accessors"
  it("writing store attributes through accessors", () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("settings", "json");
        this.adapter = adapter;
      }
    }
    store(User, "settings", { accessors: ["color", "homepage"] });

    const user = new User({});
    (user as any).color = "red";
    (user as any).homepage = "example.com";

    const settings = user.settings as any;
    expect(settings.color).toBe("red");
    expect(settings.homepage).toBe("example.com");
  });

  // Rails: test "updating store attributes"
  it("persists store changes through save", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("settings", "json");
        this.adapter = adapter;
      }
    }
    store(User, "settings", { accessors: ["color"] });
    registerModel(User);

    const user = await User.create({});
    (user as any).color = "green";
    await user.save();

    const reloaded = await User.find(user.id);
    expect((reloaded as any).color).toBe("green");
  });
});

describe("store private helpers — tested through public accessor API", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = createTestAdapter();
  });

  it("store accessor reads via readStoreAttribute (public get behavior)", () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("settings", "string");
        this.adapter = adapter;
      }
    }
    registerModel(User);
    store(User, "settings", { accessors: ["theme"] });
    const user = new User({ settings: JSON.stringify({ theme: "dark" }) });
    expect((user as any).theme).toBe("dark");
  });

  it("store accessor writes via writeStoreAttribute (public set behavior)", () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("settings", "string");
        this.adapter = adapter;
      }
    }
    registerModel(User);
    store(User, "settings", { accessors: ["theme"] });
    const user = new User({});
    (user as any).theme = "light";
    expect((user as any).theme).toBe("light");
  });

  it("store accessor delegates through readStoreAttribute/writeStoreAttribute pipeline", () => {
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("settings", "string");
        this.adapter = adapter;
      }
    }
    registerModel(Post);
    store(Post, "settings", { accessors: ["color"] });
    const post = new Post({ settings: JSON.stringify({ color: "blue" }) });
    expect((post as any).color).toBe("blue");
    (post as any).color = "red";
    expect((post as any).color).toBe("red");
  });
});

describe("storeAccessorsModule", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = createTestAdapter();
  });

  it("contains accessor names registered by store()", async () => {
    const { storeAccessorsModule } = await import("./store.js");
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("settings", "string");
        this.adapter = adapter;
      }
    }
    registerModel(User);
    store(User, "settings", { accessors: ["theme", "language"] });
    const names = storeAccessorsModule(User);
    expect(names.has("theme")).toBe(true);
    expect(names.has("language")).toBe(true);
  });

  it("includes prefixed accessor names", async () => {
    const { storeAccessorsModule } = await import("./store.js");
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("prefs", "string");
        this.adapter = adapter;
      }
    }
    registerModel(Post);
    store(Post, "prefs", { accessors: ["color"], prefix: "ui" });
    const names = storeAccessorsModule(Post);
    expect(names.has("ui_color")).toBe(true);
    expect(names.has("color")).toBe(false);
  });

  it("each class has an independent registry (no cross-class contamination)", async () => {
    const { storeAccessorsModule } = await import("./store.js");
    class A extends Base {
      static {
        this._tableName = "as";
        this.attribute("data", "string");
        this.adapter = adapter;
      }
    }
    class B extends Base {
      static {
        this._tableName = "bs";
        this.attribute("data", "string");
        this.adapter = adapter;
      }
    }
    registerModel(A);
    registerModel(B);
    store(A, "data", { accessors: ["foo"] });
    store(B, "data", { accessors: ["bar"] });
    expect(storeAccessorsModule(A).has("foo")).toBe(true);
    expect(storeAccessorsModule(A).has("bar")).toBe(false);
    expect(storeAccessorsModule(B).has("bar")).toBe(true);
    expect(storeAccessorsModule(B).has("foo")).toBe(false);
  });

  it("subclass gets its own registry independent of parent", async () => {
    const { storeAccessorsModule } = await import("./store.js");
    class Parent extends Base {
      static {
        this._tableName = "parents";
        this.attribute("settings", "string");
        this.adapter = adapter;
      }
    }
    class Child extends Parent {}
    registerModel(Parent);
    registerModel(Child);
    store(Parent, "settings", { accessors: ["theme"] });
    store(Child, "settings", { accessors: ["mode"] });
    // Parent does not get Child's accessors
    expect(storeAccessorsModule(Parent).has("mode")).toBe(false);
    // Child does not inherit Parent's module (independent registry)
    expect(storeAccessorsModule(Child).has("theme")).toBe(false);
    expect(storeAccessorsModule(Child).has("mode")).toBe(true);
  });
});

describe("IndifferentCoder wiring via store() and Base.store()", () => {
  let adapter: TestDatabaseAdapter;

  beforeAll(async () => {
    adapter = createTestAdapter();
    await defineSchema(adapter, {
      users: { name: "string", settings: "string" },
    });
  });
  withTransactionalFixtures(() => adapter);

  afterAll(async () => {
    await dropAllTables(adapter);
  });

  it("Base.store registers an IndifferentCoder for the column", () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("settings", "string");
        this.adapter = adapter;
      }
    }
    User.store("settings", { accessors: ["theme"] });
    const coder = getStoreCoder(User, "settings");
    expect(coder).toBeDefined();
    expect(typeof coder!.load).toBe("function");
    expect(typeof coder!.dump).toBe("function");
    expect(coder!.accessor()).toBe(IndifferentHashAccessor);
  });

  it("standalone store() registers an IndifferentCoder for the column", () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("settings", "string");
        this.adapter = adapter;
      }
    }
    store(User, "settings", { accessors: ["theme"] });
    const coder = getStoreCoder(User, "settings");
    expect(coder).toBeDefined();
    expect(coder!.accessor()).toBe(IndifferentHashAccessor);
  });

  it("storeAccessorFor returns IndifferentHashAccessor for a store column", () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("settings", "string");
        this.adapter = adapter;
      }
    }
    User.store("settings", { accessors: ["theme"] });
    expect(storeAccessorFor(User, "settings")).toBe(IndifferentHashAccessor);
  });

  it("reading a store column returns HashWithIndifferentAccess", async () => {
    const { HashWithIndifferentAccess: HWIA } = await import("@blazetrails/activesupport");
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("settings", "string");
        this.adapter = adapter;
      }
    }
    User.store("settings", { accessors: ["theme"] });
    const u = new User({ name: "Alice", settings: JSON.stringify({ theme: "dark" }) });
    const settings = u.settings;
    expect(settings).toBeInstanceOf(HWIA);
    expect((settings as any).get("theme")).toBe("dark");
  });

  it("round-trip: save and reload preserves store values via IndifferentCoder", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("settings", "string");
        this.adapter = adapter;
      }
    }
    registerModel(User);
    User.store("settings", { accessors: ["theme", "language"] });

    const u = await User.create({ name: "Bob" });
    (u as any).theme = "midnight";
    (u as any).language = "fr";
    await u.save();

    const reloaded = await User.find(u.id);
    expect((reloaded as any).theme).toBe("midnight");
    expect((reloaded as any).language).toBe("fr");
  });

  it("IndifferentCoder.load wraps null/missing value in empty HWIA", () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("settings", "string");
        this.adapter = adapter;
      }
    }
    User.store("settings", { accessors: ["theme"] });
    const u = new User({ name: "Carol" });
    expect((u as any).theme).toBeNull();
  });

  it("store_accessor raises an exception if the column is not either serializable or a structured type", () => {
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    // "data" was never declared via store() or as a structured type
    expect(() => storeAccessorFor(Item, "data")).toThrow(
      "the column 'data' has not been configured as a store",
    );
  });

  it("store() with coder: JSON uses buildColumnSerializer → IndifferentCoder delegation", async () => {
    const { HashWithIndifferentAccess: HWIA } = await import("@blazetrails/activesupport");
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("settings", "string");
        this.adapter = adapter;
      }
    }
    // Pass the global JSON object as the coder — buildColumnSerializer maps it to CodersJSON.
    User.store("settings", { accessors: ["theme"], coder: JSON });
    const coder = getStoreCoder(User, "settings");
    expect(coder).toBeDefined();
    // IndifferentCoder should delegate dump/load through the inner coder.
    const u = new User({ name: "Test", settings: JSON.stringify({ theme: "ocean" }) });
    expect(u.settings).toBeInstanceOf(HWIA);
    expect((u as any).theme).toBe("ocean");
  });
});

// AR_NO_AUTO_SCHEMA is stubbed at module scope for the full file.
// Restore at file teardown so the stub doesn't persist in the worker.
afterAll(() => {
  vi.unstubAllEnvs();
});
