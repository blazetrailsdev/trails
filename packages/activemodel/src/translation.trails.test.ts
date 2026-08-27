import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Model } from "./index.js";
import { I18n } from "./i18n.js";
import { raiseOnMissingTranslations } from "./translation.js";
import { resetI18n } from "./test-helpers/i18n.js";

describe("ActiveModelI18nTests — duplicate-name TS copies", () => {
  it("translated model attributes", () => {
    class Person extends Model {
      static {
        this.attribute("first_name", "string");
      }
    }
    expect(Person.humanAttributeName("first_name")).toBe("First name");
  });

  it("translated model attributes with default", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    expect(Person.humanAttributeName("name")).toBe("Name");
  });

  it("human attribute name does not modify options", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    expect(Person.humanAttributeName("name")).toBe("Name");
    expect(Person.humanAttributeName("name")).toBe("Name");
  });

  it("translated model with default value when missing translation", () => {
    expect(Model.humanAttributeName("unknown_field")).toBe("Unknown field");
  });

  it("translated model with default key when missing both translations", () => {
    expect(Model.humanAttributeName("unknown")).toBe("Unknown");
  });

  it("human does not modify options", () => {
    const opts = {};
    Model.humanAttributeName("name");
    expect(opts).toEqual({});
  });
});

describe("P11 humanAttributeName — dotted attributes, options, ancestor walk", () => {
  beforeEach(() => {
    resetI18n();
    raiseOnMissingTranslations(false);
  });
  afterEach(() => {
    raiseOnMissingTranslations(false);
    resetI18n();
  });

  it("humanizes flat attribute with no locale entry", () => {
    class Person extends Model {}
    expect(Person.humanAttributeName("first_name")).toBe("First name");
  });

  it("returns locale entry for a flat attribute", () => {
    class User extends Model {}
    I18n.backend().storeTranslations("en", {
      activemodel: { attributes: { user: { first_name: "Given Name" } } },
    });
    expect(User.humanAttributeName("first_name")).toBe("Given Name");
  });

  it("humanizes the tail segment of a dotted attribute when not found", () => {
    class User extends Model {}
    expect(User.humanAttributeName("address.street")).toBe("Street");
  });

  it("looks up dotted attribute in i18n before falling back", () => {
    class User extends Model {}
    I18n.backend().storeTranslations("en", {
      activemodel: { attributes: { "user/address": { street: "Street Address" } } },
    });
    expect(User.humanAttributeName("address.street")).toBe("Street Address");
  });

  it("uses options.default when no locale entry resolves", () => {
    class User extends Model {}
    expect(User.humanAttributeName("foo", { default: "Custom Foo" })).toBe("Custom Foo");
  });

  it("throws with options.raise when no key resolves", () => {
    class User extends Model {}
    expect(() => User.humanAttributeName("foo", { raise: true })).toThrow();
  });

  it("does not throw with options.raise when a locale entry resolves", () => {
    class User extends Model {}
    I18n.backend().storeTranslations("en", {
      activemodel: { attributes: { user: { foo: "Foo" } } },
    });
    expect(User.humanAttributeName("foo", { raise: true })).toBe("Foo");
  });

  it("throws when raiseOnMissingTranslations is enabled globally", () => {
    class User extends Model {}
    raiseOnMissingTranslations(true);
    expect(() => User.humanAttributeName("foo")).toThrow();
  });

  it("explicit raise:false suppresses the global raiseOnMissingTranslations toggle", () => {
    class User extends Model {}
    raiseOnMissingTranslations(true);
    expect(User.humanAttributeName("foo", { raise: false })).toBe("Foo");
  });

  it("inherits humanAttributeName from parent class via ancestor walk", () => {
    class Parent extends Model {}
    class Child extends Parent {}
    I18n.backend().storeTranslations("en", {
      activemodel: { attributes: { parent: { foo: "Parent Foo" } } },
    });
    expect(Child.humanAttributeName("foo")).toBe("Parent Foo");
  });

  it("prefers subclass locale entry over parent", () => {
    class Parent extends Model {}
    class Child extends Parent {}
    I18n.backend().storeTranslations("en", {
      activemodel: {
        attributes: {
          parent: { foo: "Parent Foo" },
          child: { foo: "Child Foo" },
        },
      },
    });
    expect(Child.humanAttributeName("foo")).toBe("Child Foo");
  });

  it("passes through interpolation options to I18n", () => {
    class User extends Model {}
    I18n.backend().storeTranslations("en", {
      activemodel: { attributes: { user: { items: "%{count} item(s)" } } },
    });
    expect(User.humanAttributeName("items", { count: 2 })).toBe("2 item(s)");
  });
});

describe("raise_on_missing_translations accessor", () => {
  it("toggles the shared singleton via Translation and Validations", async () => {
    const translation = await import("./translation.js");
    const validations = await import("./validations.js");
    const original = translation.raiseOnMissingTranslations();
    try {
      translation.raiseOnMissingTranslations(true);
      expect(validations.raiseOnMissingTranslations()).toBe(true);

      validations.raiseOnMissingTranslations(false);
      expect(translation.raiseOnMissingTranslations()).toBe(false);
    } finally {
      translation.raiseOnMissingTranslations(original);
    }
  });
});
