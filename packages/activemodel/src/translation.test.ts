import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { I18n } from "./i18n.js";
import { raiseOnMissingTranslations } from "./translation.js";
import { resetI18n } from "./test-helpers/i18n.js";
import { Person, Child, Gender } from "./test-helpers/models/person.js";

describe("ActiveModelI18nTests", () => {
  beforeEach(() => {
    resetI18n();
  });

  afterEach(() => {
    resetI18n();
  });

  it("translated model attributes", () => {
    I18n.backend().storeTranslations("en", {
      activemodel: { attributes: { person: { name: "person name attribute" } } },
    });
    expect(Person.humanAttributeName("name")).toBe("person name attribute");
  });

  it("translated model attributes with default", () => {
    I18n.backend().storeTranslations("en", { attributes: { name: "name default attribute" } });
    expect(Person.humanAttributeName("name")).toBe("name default attribute");
  });

  it("translated model attributes using default option", () => {
    expect(Person.humanAttributeName("name", { default: "name default attribute" })).toBe(
      "name default attribute",
    );
  });

  it("translated model attributes using default option as symbol", () => {
    I18n.backend().storeTranslations("en", { default_name: "name default attribute" });
    expect(Person.humanAttributeName("name", { default: ":default_name" })).toBe(
      "name default attribute",
    );
  });

  it("translated model attributes falling back to default", () => {
    expect(Person.humanAttributeName("name")).toBe("Name");
  });

  it("translated model attributes using default option as symbol and falling back to default", () => {
    expect(Person.humanAttributeName("name", { default: ":default_name" })).toBe("Name");
  });

  it("translated model attributes with symbols", () => {
    I18n.backend().storeTranslations("en", {
      activemodel: { attributes: { person: { name: "person name attribute" } } },
    });
    expect(Person.humanAttributeName("name")).toBe("person name attribute");
  });

  it("translated model attributes with ancestor", () => {
    I18n.backend().storeTranslations("en", {
      activemodel: { attributes: { child: { name: "child name attribute" } } },
    });
    expect(Child.humanAttributeName("name")).toBe("child name attribute");
  });

  it("translated model attributes with ancestors fallback", () => {
    I18n.backend().storeTranslations("en", {
      activemodel: { attributes: { person: { name: "person name attribute" } } },
    });
    expect(Child.humanAttributeName("name")).toBe("person name attribute");
  });

  it("translated model attributes with attribute matching namespaced model name", () => {
    I18n.backend().storeTranslations("en", {
      activemodel: {
        attributes: {
          person: { gender: "person gender" },
          "person/gender": { attribute: "person gender attribute" },
        },
      },
    });

    expect(Person.humanAttributeName("gender")).toBe("person gender");
    expect(Gender.humanAttributeName("attribute")).toBe("person gender attribute");
  });

  it("translated deeply nested model attributes", () => {
    I18n.backend().storeTranslations("en", {
      activemodel: {
        attributes: { "person/contacts/addresses": { street: "Deeply Nested Address Street" } },
      },
    });
    expect(Person.humanAttributeName("contacts.addresses.street")).toBe(
      "Deeply Nested Address Street",
    );
  });

  it("translated nested model attributes", () => {
    I18n.backend().storeTranslations("en", {
      activemodel: { attributes: { "person/addresses": { street: "Person Address Street" } } },
    });
    expect(Person.humanAttributeName("addresses.street")).toBe("Person Address Street");
  });

  it("translated nested model attributes with namespace fallback", () => {
    I18n.backend().storeTranslations("en", {
      activemodel: { attributes: { addresses: { street: "Cool Address Street" } } },
    });
    expect(Person.humanAttributeName("addresses.street")).toBe("Cool Address Street");
  });

  it("translated model names", () => {
    I18n.backend().storeTranslations("en", { activemodel: { models: { person: "person model" } } });
    expect(Person.modelName.human()).toBe("person model");
  });

  it("translated model when missing translation", () => {
    expect(Person.modelName.human()).toBe("Person");
  });

  it("translated model with namespace", () => {
    I18n.backend().storeTranslations("en", {
      activemodel: { models: { "person/gender": "gender model" } },
    });
    expect(Gender.modelName.human()).toBe("gender model");
  });

  it("translated subclass model", () => {
    I18n.backend().storeTranslations("en", { activemodel: { models: { child: "child model" } } });
    expect(Child.modelName.human()).toBe("child model");
  });

  it("translated subclass model when ancestor translation", () => {
    I18n.backend().storeTranslations("en", { activemodel: { models: { person: "person model" } } });
    expect(Child.modelName.human()).toBe("person model");
  });

  it("translated attributes when nil", () => {
    I18n.backend().storeTranslations("en", {
      activemodel: { attributes: { "person/addresses": { street: "Person Address Street" } } },
    });
    expect(Person.humanAttributeName("addresses.")).toBe("Addresses");
  });

  it("translated deeply nested attributes when nil", () => {
    I18n.backend().storeTranslations("en", {
      activemodel: {
        attributes: { "person/contacts/addresses": { street: "Deeply Nested Address Street" } },
      },
    });
    expect(Person.humanAttributeName("addresses.contacts.")).toBe("Addresses/contacts");
  });

  it("translated subclass model when missing translation", () => {
    expect(Child.modelName.human()).toBe("Child");
  });

  it("translated model with default value when missing translation", () => {
    expect(Person.modelName.human({ default: "dude" })).toBe("dude");
  });

  it("translated model with default key when missing both translations", () => {
    expect(Person.modelName.human({ default: ":this_key_does_not_exist" })).toBe("Person");
  });

  it("human does not modify options", () => {
    const options = { default: "person model" };
    Person.modelName.human(options);
    expect(options).toEqual({ default: "person model" });
  });

  it("human attribute name does not modify options", () => {
    const options = { default: "Cool gender" };
    Person.humanAttributeName("gender", options);
    expect(options).toEqual({ default: "Cool gender" });
  });

  it("raise on missing translations", () => {
    const original = raiseOnMissingTranslations();
    raiseOnMissingTranslations(true);
    try {
      expect(() => Person.humanAttributeName("name")).toThrow();
    } finally {
      raiseOnMissingTranslations(original);
    }
  });
});
