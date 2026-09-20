/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/date";
import { Duration } from "@blazetrails/activesupport";
import { Error as ModelError } from "./error.js";
import { Range } from "@blazetrails/ruby-compat";
import { Errors, Model } from "./index.js";
import { I18n } from "./i18n.js";
import { resetI18n } from "./test-helpers/i18n.js";
import { Attributes, type AttributesClassHalf } from "./attributes.js";
import { include } from "@blazetrails/activesupport";

describe("Error option value equality", () => {
  const base = {} as never;

  it("compares two separately-constructed equal Ranges as equal", () => {
    const error = new ModelError(base, "name", ":too_long", { count: new Range(5, 20) });

    expect(error.match("name", ":too_long", { count: new Range(5, 20) })).toBe(true);
    expect(error.match("name", ":too_long", { count: new Range(5, 21) })).toBe(false);
    expect(error.match("name", ":too_long", { count: new Range(5, 20, true) })).toBe(false);
    expect(error.strictMatch("name", ":too_long", { count: new Range(5, 20) })).toBe(true);
    expect(
      error.equals(new ModelError(base, "name", ":too_long", { count: new Range(5, 20) })),
    ).toBe(true);
  });

  it("compares two separately-constructed equal Durations as equal", () => {
    const error = new ModelError(base, "startsAt", ":greater_than", { count: Duration.days(2) });

    expect(error.match("startsAt", ":greater_than", { count: Duration.days(2) })).toBe(true);
    expect(error.match("startsAt", ":greater_than", { count: Duration.days(3) })).toBe(false);
    expect(error.strictMatch("startsAt", ":greater_than", { count: Duration.days(2) })).toBe(true);
    expect(
      error.equals(new ModelError(base, "startsAt", ":greater_than", { count: Duration.days(2) })),
    ).toBe(true);
  });

  it("compares two separately-constructed equal Times as equal", () => {
    const at = () => Temporal.Instant.from("2026-08-20T00:00:00Z");
    const error = new ModelError(base, "startsAt", ":greater_than", { count: at() });

    expect(error.match("startsAt", ":greater_than", { count: at() })).toBe(true);
    expect(
      error.match("startsAt", ":greater_than", {
        count: Temporal.Instant.from("2026-08-21T00:00:00Z"),
      }),
    ).toBe(false);
    expect(error.strictMatch("startsAt", ":greater_than", { count: at() })).toBe(true);
    expect(error.equals(new ModelError(base, "startsAt", ":greater_than", { count: at() }))).toBe(
      true,
    );
  });
});

describe("Error and Errors surface", () => {
  it("inspect", () => {
    const errors = new Errors({});
    errors.add("name", ":blank");
    const str = errors.inspect();
    expect(str).toContain("ActiveModel::Errors");
    expect(str).toContain("name");
    expect(str).toContain("blank");
  });

  it("full_messages doesn't require the base object to respond to :errors", () => {
    const errors = new Errors({ name: "test" });
    errors.add("name", ":blank");
    expect(errors.fullMessages).toEqual(["Name can't be blank"]);
  });

  it("merge does not import errors when merging with self", () => {
    const errors = new Errors({});
    errors.add("name", ":blank");
    expect(errors.count).toBe(1);
    errors.mergeBang(errors);
    expect(errors.count).toBe(1);
  });

  it("generateMessage walks ancestor lookup chain", () => {
    class Parent extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static i18nScope = "activemodel";
      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
      static lookupAncestors() {
        return [this];
      }
    }
    interface Parent extends Attributes {}

    class Child extends Parent {
      static override lookupAncestors() {
        return [this, Parent];
      }
    }

    I18n.backend().storeTranslations("en", {
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
      const msg = ModelError.generateMessage("name", ":blank", record);
      expect(msg).toBe("parent-level blank");
    } finally {
      resetI18n();
    }
  });

  it("generateMessage falls back to activemodel scope for non-activemodel i18nScope", () => {
    class ARModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static i18nScope = "activerecord";
      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface ARModel extends Attributes {}

    const record = new ARModel({}) as any;
    const msg = ModelError.generateMessage("name", ":blank", record);
    expect(msg).toBe("can't be blank");
  });

  it("message with identifier-shaped rawType routes through i18n", () => {
    const e = new Errors(null);
    e.add("name", ":blank");
    expect(e.messagesFor("name")).toEqual(["can't be blank"]);
  });

  it("message with non-identifier rawType returns literal string", () => {
    const e = new Errors(null);
    e.add("name", "is really not great");
    expect(e.messagesFor("name")).toEqual(["is really not great"]);
  });

  it("generateMessage with identifier options.message routes through i18n as new type", () => {
    const e = new Errors(null);
    e.add("name", ":blank", { message: ":tooShort" });
    expect(e.messagesFor("name")[0]).toContain("errors.messages.tooShort");
  });

  it("fullMessage strips array notation from attribute", () => {
    ModelError.i18nCustomizeFullMessage = true;
    class Person extends Model {}
    const e = new Errors(new Person({}));
    e.add("items[0].name", "can't be blank");
    const msg = e.fullMessages[0];
    expect(msg).toBe("Items name can't be blank");
    expect(msg).not.toContain("[0]");
    ModelError.i18nCustomizeFullMessage = false;
  });

  it("fullMessage uses last segment of dotted attribute", () => {
    const e = new Errors(null);
    e.add("profile.bio", ":blank");
    const msg = e.fullMessages[0];
    expect(msg).toBe("Profile bio can't be blank");
  });

  it("fullMessage non-nested attribute behaves as before", () => {
    const e = new Errors(null);
    e.add("name", ":blank");
    expect(e.fullMessages[0]).toBe("Name can't be blank");
  });

  it("attributesForHash is accessible via equals", () => {
    const e = new Errors(null);
    e.add("name", ":blank");
    e.add("name", ":blank");
    expect(e.objects[0].equals(e.objects[1])).toBe(true);
  });
});
