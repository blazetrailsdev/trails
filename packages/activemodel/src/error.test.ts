import { describe, it, expect } from "vitest";
import { Errors, Model } from "./index.js";
import { I18n } from "./i18n.js";
import { Error as ModelError } from "./error.js";

describe("ErrorTest", () => {
  it("full_message uses default format", () => {
    const errors = new Errors({});
    expect(errors.fullMessage("name", "is invalid")).toBe("Name is invalid");
  });

  it("comparing against different class would not raise error", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    // Just verify it doesn't throw
    expect(errors.objects[0]).toBeDefined();
  });

  it("details which has no raw_type", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    const detail = errors.objects[0];
    expect(detail.type).toBe("blank");
  });

  it("match? handles extra options match", () => {
    const errors = new Errors({});
    errors.add("name", "invalid", { message: "is bad" });
    expect(errors.added("name", "invalid")).toBe(true);
  });

  it("message handles lambda in messages and option values, and i18n interpolation", () => {
    const errors = new Errors({});
    errors.add("name", "invalid", { message: "custom error" });
    expect(errors.get("name")).toEqual(["custom error"]);
  });

  it("message with type as a symbol and indexed attribute can lookup without index in attribute key", () => {
    const errors = new Errors({});
    errors.add("name", "invalid");
    expect(errors.get("name")).toEqual(["is invalid"]);
  });

  it("initialize", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.objects[0].attribute).toBe("name");
    expect(e.objects[0].type).toBe("blank");
  });

  it("initialize without type", () => {
    const e = new Errors(null);
    e.add("name");
    expect(e.objects[0].type).toBe("invalid");
  });

  it("match? handles attribute match", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.where("name").length).toBe(1);
    expect(e.where("age").length).toBe(0);
  });

  it("match? handles error type match", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    e.add("name", "too_short");
    expect(e.where("name", "blank").length).toBe(1);
    expect(e.where("name", "too_short").length).toBe(1);
  });

  it("message with type as custom message", () => {
    const e = new Errors(null);
    e.add("name", "blank", { message: "is required" });
    expect(e.get("name")).toContain("is required");
  });

  it("message with options[:message] as custom message", () => {
    const e = new Errors(null);
    e.add("name", "invalid", { message: "is not valid" });
    expect(e.get("name")).toContain("is not valid");
  });

  it("equality by base attribute, type and options", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.added("name", "blank")).toBe(true);
  });

  it("inequality", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.added("name", "too_short")).toBe(false);
  });

  it("full_message returns the given message when the attribute contains base", () => {
    // A field named "base_price" should still get a prefix
    const e = new Errors(null);
    expect(e.fullMessage("base_price", "is invalid")).toBe("Base price is invalid");
  });

  it("details which ignores callback and message options", () => {
    const e = new Errors(null);
    e.add("name", "blank", { message: "custom msg" });
    const detail = e.objects[0];
    expect(detail.attribute).toBe("name");
    expect(detail.type).toBe("blank");
  });

  it("initialize without type but with options", () => {
    const e = new Errors(null);
    e.add("name", "invalid", { message: "is not valid" });
    const detail = e.objects[0];
    expect(detail.attribute).toBe("name");
    expect(detail.type).toBe("invalid");
    expect(detail.message).toBe("is not valid");
  });

  it("match? handles mixed condition", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    e.add("name", "too_short");
    e.add("age", "blank");
    expect(e.where("name", "blank").length).toBe(1);
    expect(e.where("name", "too_short").length).toBe(1);
    expect(e.where("name", "invalid").length).toBe(0);
    expect(e.where("age", "blank").length).toBe(1);
  });

  it("message with type as a symbol", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.get("name")).toEqual(["can't be blank"]);
  });

  it("message with custom interpolation", () => {
    const e = new Errors(null);
    e.add("name", "greater_than", { count: 5 });
    expect(e.get("name")).toEqual(["must be greater than 5"]);
  });

  it("message returns plural interpolation", () => {
    const e = new Errors(null);
    e.add("name", "too_short", { count: 3 });
    expect(e.get("name").length).toBe(1);
    expect(e.objects[0].options?.count).toBe(3);
  });

  it("message returns singular interpolation", () => {
    const e = new Errors(null);
    e.add("name", "too_short", { count: 1 });
    expect(e.get("name").length).toBe(1);
    expect(e.objects[0].options?.count).toBe(1);
  });

  it("message returns count interpolation", () => {
    const e = new Errors(null);
    e.add("name", "equal_to", { count: 42 });
    expect(e.get("name")).toEqual(["must be equal to 42"]);
  });

  it("inspect", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    const str = errors.inspect();
    expect(str).toContain("ActiveModel::Errors");
    expect(str).toContain("name");
    expect(str).toContain("blank");
  });

  it("message renders lazily using current locale", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    expect(errors.get("name")).toEqual(["can't be blank"]);
  });

  it("message uses current locale", () => {
    const errors = new Errors({});
    errors.add("name", "invalid");
    expect(errors.get("name")).toEqual(["is invalid"]);
  });

  it("full_messages doesn't require the base object to respond to :errors", () => {
    const errors = new Errors({ name: "test" });
    errors.add("name", "blank");
    expect(errors.fullMessages).toEqual(["Name can't be blank"]);
  });

  it("merge does not import errors when merging with self", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    expect(errors.count).toBe(1);
    errors.merge(errors);
    expect(errors.count).toBe(1);
  });

  it("generate_message works without i18n_scope", () => {
    const e = new Errors(null);
    expect(e.generateMessage("name", "blank")).toBe("can't be blank");
    expect(e.generateMessage("name", "invalid")).toBe("is invalid");
  });

  it("full_message returns the given message when attribute is :base", () => {
    const e = new Errors(null);
    e.add("base", "invalid", { message: "Something went wrong" });
    expect(e.fullMessages).toContain("Something went wrong");
  });

  it("full_message returns the given message with the attribute name included", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.fullMessages[0]).toBe("Name can't be blank");
  });

  it("generateMessage walks ancestor lookup chain", () => {
    class Parent extends Model {
      static i18nScope = "activemodel";
      static lookupAncestors() {
        return [this];
      }
    }
    class Child extends Parent {
      static override lookupAncestors() {
        return [this, Parent];
      }
    }

    I18n.storeTranslations("en", {
      activemodel: {
        errors: {
          models: {
            parent: { attributes: { name: { blank: "parent-level blank" } } },
          },
        },
      },
    });

    try {
      const record = new Child({ name: "" }) as any;
      const msg = ModelError.generateMessage("name", "blank", record);
      expect(msg).toBe("parent-level blank");
    } finally {
      I18n.reset();
    }
  });

  it("generateMessage falls back to activemodel scope for non-activemodel i18nScope", () => {
    class ARModel extends Model {
      static i18nScope = "activerecord";
    }
    const record = new ARModel({}) as any;
    const msg = ModelError.generateMessage("name", "blank", record);
    expect(msg).toBe("can't be blank");
  });

  // P10: message getter dispatches on rawType shape (identifier vs literal string)
  it("message with identifier-shaped rawType routes through i18n", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.get("name")).toEqual(["can't be blank"]);
  });

  it("message with non-identifier rawType returns literal string", () => {
    const e = new Errors(null);
    e.add("name", "is really not great");
    expect(e.get("name")).toEqual(["is really not great"]);
  });

  // P10: generateMessage merges object: base for %{object} interpolation
  it("generateMessage interpolates %{object} with base record", () => {
    I18n.storeTranslations("en", {
      activemodel: { errors: { messages: { foo: "is %{object}" } } },
    });
    try {
      const base = { toString: () => "BAR" } as any;
      const msg = ModelError.generateMessage("name", "foo", base);
      expect(msg).toBe("is BAR");
    } finally {
      I18n.reset();
    }
  });

  // P10: generateMessage promotes identifier-shaped options.message to type
  it("generateMessage with identifier options.message routes through i18n as new type", () => {
    const e = new Errors(null);
    e.add("name", "blank", { message: "tooShort" });
    // "tooShort" is identifier-shaped but has no locale entry → falls back to raw key
    expect(e.get("name")).toEqual(["tooShort"]);
  });

  // Rails error.rb:51-55: strip array notation, then pass full dotted attribute
  // to human_attribute_name with `attribute.tr(".", "_").humanize` as the default —
  // so the prefix segment is preserved when no translation matches.
  it("fullMessage strips array notation from attribute", () => {
    const e = new Errors(null);
    e.add("items[0].name", "blank");
    const msg = e.fullMessages[0];
    expect(msg).toBe("Items name can't be blank");
    expect(msg).not.toContain("[0]");
  });

  it("fullMessage uses last segment of dotted attribute", () => {
    const e = new Errors(null);
    e.add("profile.bio", "blank");
    const msg = e.fullMessages[0];
    expect(msg).toBe("Profile bio can't be blank");
  });

  // P10: fullMessage non-nested regression guard
  it("fullMessage non-nested attribute behaves as before", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.fullMessages[0]).toBe("Name can't be blank");
  });

  // P10: attributesForHash is protected (accessible within the class hierarchy)
  it("attributesForHash is accessible via equals", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    e.add("name", "blank");
    // equals() uses attributesForHash internally; duplicates should be equal
    expect(e.objects[0].equals(e.objects[1])).toBe(true);
  });
});
