/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side. */
import { describe, it, expect, afterEach, expectTypeOf } from "vitest";
import {
  Model,
  Errors,
  I18n,
  StrictValidationFailed,
  Validator,
  EachValidator,
  BlockValidator,
} from "./index.js";
import { Error as ActiveModelError } from "./error.js";
import type { ValidatableRecord } from "./validator.js";
import { resetI18n } from "./test-helpers/i18n.js";
import { Attributes, type AttributesClassHalf } from "./attributes.js";
import { include } from "@blazetrails/activesupport";

describe("Errors — trails-only coverage", () => {
  it("add creates an error object and returns it", () => {
    const e = new Errors(null);
    e.add("name", ":blank");
    expect(e.messagesFor("name")).toContain("can't be blank");
  });

  it("size calculates the number of error messages", () => {
    const e = new Errors(null);
    e.add("name", ":blank");
    e.add("age", ":not_a_number");
    expect(e.count).toBe(2);
    expect(e.size).toBe(2);
  });

  it("detecting whether there are errors with empty?, blank?, include?", () => {
    const e = new Errors(null);
    expect(e.empty).toBe(true);
    expect(e.any).toBe(false);
    e.add("name", ":blank");
    expect(e.empty).toBe(false);
    expect(e.any).toBe(true);
  });

  it("clear errors", () => {
    const e = new Errors(null);
    e.add("name", ":blank");
    e.clear();
    expect(e.count).toBe(0);
    expect(e.empty).toBe(true);
  });

  it("where filters by attribute and type", () => {
    const e = new Errors(null);
    e.add("name", ":blank");
    e.add("name", ":too_short");
    e.add("age", ":blank");
    expect(e.where("name").length).toBe(2);
    expect(e.where("name", ":blank").length).toBe(1);
    expect(e.where("age").length).toBe(1);
  });

  it("attribute_names returns the error attributes", () => {
    const e = new Errors(null);
    e.add("name", ":blank");
    e.add("name", ":too_short");
    e.add("age", ":blank");
    expect(e.attributeNames).toEqual(["name", "age"]);
  });

  it("custom message overrides default", () => {
    const e = new Errors(null);
    e.add("name", ":blank", { message: "is required" });
    expect(e.messagesFor("name")).toContain("is required");
  });

  it("message interpolation with %{count}", () => {
    const e = new Errors(null);
    e.add("name", ":too_short", { count: 3 });
    expect(e.messagesFor("name").length).toBe(1);
  });

  it("has_key?", () => {
    const errors = new Errors({});
    errors.add("foo", "omg");
    expect(errors.hasKey("foo")).toBe(true);
  });

  it("has_no_key", () => {
    const errors = new Errors({});
    expect(errors.hasKey("name")).toBe(false);
  });

  it("full_message uses default format", () => {
    const errors = new Errors({});
    expect(errors.fullMessage("name", "is invalid")).toBe("Name is invalid");
    expect(errors.fullMessage("base", "is invalid")).toBe("is invalid");
  });

  describe("i18nCustomizeFullMessage", () => {
    afterEach(() => {
      ActiveModelError.i18nCustomizeFullMessage = false;
      resetI18n();
    });

    it("falls back to default format when model-specific keys are missing", () => {
      ActiveModelError.i18nCustomizeFullMessage = true;
      const errors = new Errors({});
      expect(errors.fullMessage("name", "is invalid")).toBe("Name is invalid");
    });

    it("uses model-specific attribute format when present", () => {
      ActiveModelError.i18nCustomizeFullMessage = true;
      class User extends Model {}
      I18n.backend().storeTranslations("en", {
        activemodel: {
          errors: {
            models: {
              user: {
                attributes: {
                  name: { format: "%{message}" },
                },
              },
            },
          },
        },
      });
      const errors = new Errors(new User());
      expect(errors.fullMessage("name", "is invalid")).toBe("is invalid");
    });
  });

  it("delete removes errors for attribute", () => {
    const errors = new Errors({});
    errors.add("name", ":blank");
    errors.add("name", ":invalid");
    errors.add("age", ":invalid");
    const removed = errors.delete("name");
    expect(removed!.length).toBe(2);
    expect(errors.count).toBe(1);
  });

  it("each iterates over all errors", () => {
    const errors = new Errors({});
    errors.add("name", ":blank");
    errors.add("age", ":invalid");
    const collected: string[] = [];
    errors.each((e) => collected.push(e.attribute));
    expect(collected).toEqual(["name", "age"]);
  });

  it("group_by_attribute groups errors", () => {
    const errors = new Errors({});
    errors.add("name", ":blank");
    errors.add("name", ":invalid");
    errors.add("age", ":invalid");
    const grouped = errors.groupByAttribute();
    expect(grouped["name"].length).toBe(2);
    expect(grouped["age"].length).toBe(1);
  });

  it("messages_for returns messages for an attribute", () => {
    const errors = new Errors({});
    errors.add("name", ":blank");
    errors.add("name", ":invalid");
    expect(errors.messagesFor("name")).toEqual(["can't be blank", "is invalid"]);
  });

  it("full_messages_for returns full messages for an attribute", () => {
    const errors = new Errors({});
    errors.add("name", ":blank");
    expect(errors.fullMessagesFor("name")).toEqual(["Name can't be blank"]);
  });

  it("import imports an error from another Errors instance", () => {
    const errors1 = new Errors({});
    errors1.add("name", ":blank");
    const errors2 = new Errors({});
    errors2.import(errors1.objects[0]);
    expect(errors2.count).toBe(1);
    expect(errors2.messagesFor("name")).toEqual(["can't be blank"]);
  });

  it("import with attribute override", () => {
    const errors1 = new Errors({});
    errors1.add("name", ":blank");
    const errors2 = new Errors({});
    errors2.import(errors1.objects[0], { attribute: "title" });
    expect(errors2.messagesFor("title")).toEqual(["can't be blank"]);
  });

  it("copy! replaces existing errors rather than appending", () => {
    const e1 = new Errors(null);
    const e2 = new Errors(null);
    e2.add("name", ":blank");
    e1.add("age", ":invalid");
    e2.copyBang(e1);
    expect(e2.count).toBe(1);
    expect(e2.attributeNames).toEqual(["age"]);
  });

  it("copy! deep-dups nested option values (matches Rails deep_dup)", () => {
    const source = new Errors({});
    const nested = { range: { min: 1, max: 5 } };
    source.add("age", ":out_of_range", nested);
    const target = new Errors({});
    target.copyBang(source);
    (source.objects[0].options.range as { min: number }).min = 999;
    expect((target.objects[0].options.range as { min: number }).min).toBe(1);
  });

  it("copy! preserves NestedError class on duplicated errors", () => {
    const source = new Errors({});
    source.add("age", ":invalid");
    const wrapper = new Errors({});
    wrapper.mergeBang(source);
    const target = new Errors({});
    target.copyBang(wrapper);
    expect(target.objects[0].constructor.name).toBe("NestedError");
  });

  describe("where/delete/added/import option-aware filtering (Rails fidelity)", () => {
    it("where filters by options subset match", () => {
      const errors = new Errors({});
      errors.add("age", ":too_short", { count: 3 });
      errors.add("age", ":too_short", { count: 5 });
      expect(errors.where("age", ":too_short", { count: 3 })).toHaveLength(1);
      expect(errors.where("age", ":too_short", { count: 7 })).toHaveLength(0);
    });

    it("delete filters by options subset match", () => {
      const errors = new Errors({});
      errors.add("age", ":too_short", { count: 3 });
      errors.add("age", ":too_short", { count: 5 });
      const removed = errors.delete("age", ":too_short", { count: 3 });
      expect(removed).toHaveLength(1);
      expect(errors.count).toBe(1);
      expect(errors.objects[0].options.count).toBe(5);
    });

    it("added? distinguishes between option values", () => {
      const errors = new Errors({});
      errors.add("age", ":too_short", { count: 3 });
      expect(errors.added("age", ":too_short", { count: 3 })).toBe(true);
      expect(errors.added("age", ":too_short", { count: 5 })).toBe(false);
    });

    it("where matches structurally-equal array options (not just by reference)", () => {
      const errors = new Errors({});
      errors.add("role", ":inclusion", { in: [1, 2, 3] });
      expect(errors.where("role", ":inclusion", { in: [1, 2, 3] })).toHaveLength(1);
      expect(errors.where("role", ":inclusion", { in: [1, 2] })).toHaveLength(0);
    });

    it("matches RegExp option values by source + flags, not reference", () => {
      const errors = new Errors({});
      errors.add("email", ":invalid", { with: /^\w+@\w+$/i });
      expect(errors.where("email", ":invalid", { with: /^\w+@\w+$/i })).toHaveLength(1);
      expect(errors.where("email", ":invalid", { with: /^\w+@\w+$/g })).toHaveLength(0);
      expect(errors.where("email", ":invalid", { with: /other/i })).toHaveLength(0);
    });

    it("added? matches structurally-equal nested object options", () => {
      const errors = new Errors({});
      errors.add("age", ":out_of_range", { range: { min: 1, max: 5 } });
      expect(errors.added("age", ":out_of_range", { range: { min: 1, max: 5 } })).toBe(true);
      expect(errors.added("age", ":out_of_range", { range: { min: 1, max: 9 } })).toBe(false);
    });

    it("mergeBang returns the error array on both arms, as Ruby's merge! does", () => {
      const errors = new Errors({});
      errors.add("name", ":blank");
      expect(errors.mergeBang(errors)).toBe(errors.objects);

      const other = new Errors({});
      other.add("age", ":invalid");
      expect(errors.mergeBang(other)).toBe(other.objects);
      expect(errors.count).toBe(2);
    });

    it("import symbolizes a string :type override so added matches it", () => {
      const source = new Errors({});
      source.add("name", ":invalid");
      const target = new Errors({});
      target.import(source.objects[0], { type: "too_short" });
      expect(target.added("name", ":too_short")).toBe(true);
    });

    it("import accepts :attribute and :type override (rawType stays on inner)", () => {
      const source = new Errors({});
      source.add("name", ":invalid");
      const target = new Errors({});
      target.import(source.objects[0], { attribute: "title", type: "wrong" });
      const imported = target.objects[0];
      expect(imported.attribute).toBe("title");
      expect(imported.type).toBe(":wrong");
      expect(imported.rawType).toBe(":invalid");

      const copy = new Errors({});
      copy.copyBang(target);
      const round = copy.objects[0];
      expect(round.attribute).toBe("title");
      expect(round.type).toBe(":wrong");
      expect(round.rawType).toBe(":invalid");
    });
  });

  it("copy! dups each error without recursing into a NestedError's inner error", () => {
    const source = new Errors({});
    source.add("age", ":out_of_range", { range: { min: 1 } });
    const wrapper = new Errors({});
    wrapper.mergeBang(source);
    const target = new Errors({});
    target.copyBang(wrapper);
    const srcInner = (
      wrapper.objects[0] as unknown as { innerError: { options: Record<string, unknown> } }
    ).innerError;
    const tgtInner = (
      target.objects[0] as unknown as { innerError: { options: Record<string, unknown> } }
    ).innerError;
    expect(tgtInner).toBe(srcInner);
    expect(target.objects[0].options).not.toBe(wrapper.objects[0].options);
  });

  it("copy! rebinds each error's base to the receiver", () => {
    const base1 = { tag: "one" };
    const base2 = { tag: "two" };
    const e1 = new Errors(base1);
    e1.add("name", ":blank");
    const e2 = new Errors(base2);
    e2.copyBang(e1);
    expect(e2.objects[0].base).toBe(base2);
    expect(e1.objects[0].base).toBe(base1);
  });

  it("merge! appends imported errors as NestedError", () => {
    const e1 = new Errors({});
    e1.add("name", ":blank");
    const e2 = new Errors({});
    e2.add("age", ":invalid");
    e2.mergeBang(e1);
    expect(e2.count).toBe(2);
    const imported = e2.objects.find((e) => e.attribute === "name")!;
    expect(imported.constructor.name).toBe("NestedError");
  });

  it("objects returns the backing error array", () => {
    const errors = new Errors(null);
    errors.add("name", ":blank");
    expect(errors.objects).toHaveLength(1);
    expect(errors.objects[0].attribute).toBe("name");
  });

  it("uniq! removes duplicates with identical attribute/type/options", () => {
    const errors = new Errors({});
    errors.add("name", ":blank");
    errors.add("name", ":blank");
    errors.add("age", ":too_short", { count: 2 });
    errors.add("age", ":too_short", { count: 2 });
    errors.add("age", ":too_short", { count: 3 });
    errors.uniqBang();
    expect(errors.count).toBe(3);
    expect(errors.objects.filter((e) => e.attribute === "age")).toHaveLength(2);
  });

  describe("add strict + Enumerable (Rails fidelity)", () => {
    it("add returns the new Error object", () => {
      const errors = new Errors({});
      const err = errors.add("name", ":blank");
      expect(err).toBeInstanceOf(ActiveModelError);
      expect(err.attribute).toBe("name");
      expect(err.type).toBe(":blank");
      expect(errors.objects[0]).toBe(err);
    });

    it("add with strict: true raises StrictValidationFailed", () => {
      const errors = new Errors({});
      expect(() => errors.add("name", ":blank", { strict: true })).toThrow(StrictValidationFailed);
      expect(errors.count).toBe(0);
    });

    it("add with strict: CustomErrorClass raises that class", () => {
      class NameIsInvalid extends globalThis.Error {}
      const errors = new Errors({});
      expect(() => errors.add("name", ":blank", { strict: NameIsInvalid })).toThrow(NameIsInvalid);
      expect(errors.count).toBe(0);
    });

    it("is iterable via for..of", () => {
      const errors = new Errors({});
      errors.add("name", ":blank");
      errors.add("age", ":invalid");
      const collected: string[] = [];
      for (const e of errors) {
        collected.push(e.attribute);
      }
      expect(collected).toEqual(["name", "age"]);
    });

    it("supports spread and Array.from", () => {
      const errors = new Errors({});
      errors.add("name", ":blank");
      errors.add("age", ":invalid");
      expect([...errors]).toHaveLength(2);
      expect(Array.from(errors, (e) => e.attribute)).toEqual(["name", "age"]);
    });
  });

  it("delete returns array of removed errors when present", () => {
    const e = new Errors(null);
    e.add("name", ":blank");
    e.add("name", ":too_short");
    const removed = e.delete("name");
    expect(removed).not.toBeNull();
    expect(removed!.length).toBe(2);
  });

  it("delete returns null when nothing removed", () => {
    const e = new Errors(null);
    const removed = e.delete("name");
    expect(removed).toBeNull();
  });

  it("messages.get missing key returns frozen empty array", () => {
    const e = new Errors(null);
    const result = e.messages.get("missing");
    expect(result).toEqual([]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(() => (result as string[]).push("x")).toThrow();
  });

  it("messages.get missing keys return the same singleton frozen instance", () => {
    const e = new Errors(null);
    const a = e.messages.get("missing");
    const b = e.messages.get("alsoMissing");
    expect(a).toBe(b);
  });

  it("details shape strips reserved option keys", () => {
    const e = new Errors(null);
    e.add("name", ":blank", { custom: "x", message: "override" });
    const detail = e.details.get("name")![0];
    expect(detail.error).toBe(":blank");
    expect(detail.custom).toBe("x");
    expect(detail.message).toBeUndefined();
  });

  it("details missing-key returns frozen empty array", () => {
    const e = new Errors(null);
    const result = e.details.get("missing");
    expect(result).toEqual([]);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("toHash(true) returns full messages", () => {
    const e = new Errors(null);
    e.add("name", ":blank");
    const full = e.toHash(true);
    expect(full.get("name")![0]).toContain("Name");
    expect(full.get("name")![0]).toContain("can't be blank");
  });

  it("toHash() with no arg returns short messages", () => {
    const e = new Errors(null);
    e.add("name", ":blank");
    const short = e.toHash();
    expect(short.get("name")![0]).toBe("can't be blank");
  });

  it("added returns true for exact type match", () => {
    const e = new Errors(null);
    e.add("name", ":blank");
    expect(e.added("name", ":blank")).toBe(true);
  });

  it("added returns true for full message string (string branch)", () => {
    const e = new Errors(null);
    e.add("name", ":blank");
    expect(e.added("name", "can't be blank")).toBe(true);
  });

  it("added returns false for nonexistent type or message", () => {
    const e = new Errors(null);
    e.add("name", ":blank");
    expect(e.added("name", "nonexistent type xyz")).toBe(false);
  });

  it("ofKind returns true for exact type match", () => {
    const e = new Errors(null);
    e.add("name", ":blank");
    expect(e.ofKind("name", ":blank")).toBe(true);
  });

  it("ofKind returns true for full message string (string branch)", () => {
    const e = new Errors(null);
    e.add("name", ":blank");
    expect(e.ofKind("name", "can't be blank")).toBe(true);
  });

  it("ofKind returns false for nonexistent type or message", () => {
    const e = new Errors(null);
    e.add("name", ":blank");
    expect(e.ofKind("name", "nonexistent type xyz")).toBe(false);
  });
});

describe("Errors<TBase> type parameter", () => {
  interface User {
    name: string;
    age: number;
  }

  it("add() type callback receives TBase | null", () => {
    const e = new Errors<User>({ name: "Alice", age: 30 });
    e.add("name", (record, _opts) => {
      expectTypeOf(record).toEqualTypeOf<User | null>();
      return "invalid";
    });
  });

  it("add() message callback receives TBase | null", () => {
    const e = new Errors<User>({ name: "Alice", age: 30 });
    e.add("name", ":invalid", {
      message: (record) => {
        expectTypeOf(record).toEqualTypeOf<User | null>();
        return "bad";
      },
    });
  });

  it("add() message callback receives TBase | null and options (two-arg form)", () => {
    const e = new Errors<User>({ name: "Alice", age: 30 });
    e.add("name", ":invalid", {
      message: (record, opts) => {
        expectTypeOf(record).toEqualTypeOf<User | null>();
        expectTypeOf(opts).toEqualTypeOf<Record<string, unknown>>();
        return "bad";
      },
    });
  });

  it("unparameterized Errors annotation compiles (default = object)", () => {
    const e: Errors = new Errors({} as object);
    e.add("name", (record, _opts) => {
      expectTypeOf(record).toEqualTypeOf<object | null>();
      return "invalid";
    });
  });

  it("where() type callback receives TBase | null", () => {
    const e = new Errors<User>({ name: "Alice", age: 30 });
    e.where("name", (record, _opts) => {
      expectTypeOf(record).toEqualTypeOf<User | null>();
      return "invalid";
    });
  });

  it("copyBang accepts Errors<U> for a different U", () => {
    interface Post {
      title: string;
    }
    const userErrors = new Errors<User>({ name: "Alice", age: 30 });
    const postErrors = new Errors<Post>({ title: "Hello" });
    expectTypeOf(userErrors.copyBang<Post>).toBeFunction();
    userErrors.copyBang(postErrors);
  });

  it("mergeBang accepts Errors<U> for a different U", () => {
    interface Post {
      title: string;
    }
    const userErrors = new Errors<User>({ name: "Alice", age: 30 });
    const postErrors = new Errors<Post>({ title: "Hello" });
    expectTypeOf(userErrors.mergeBang<Post>).toBeFunction();
    userErrors.mergeBang(postErrors);
  });

  it("normalizeArguments() type callback receives TBase | null", () => {
    const e = new Errors<User>({ name: "Alice", age: 30 });
    e.normalizeArguments("name", (record, _opts) => {
      expectTypeOf(record).toEqualTypeOf<User | null>();
      return "invalid";
    });
  });
});

describe("ValidatableRecord<TBase> type tests", () => {
  interface User {
    name: string;
    age: number;
  }
  interface Post {
    title: string;
  }

  it("ValidatableRecord<User>.errors is Errors<User>", () => {
    type R = ValidatableRecord<User>;
    expectTypeOf<R["errors"]>().toEqualTypeOf<Errors<User>>();
  });

  it("Errors<User> and Errors<Post> are not mutually assignable", () => {
    expectTypeOf<Errors<User>>().not.toMatchTypeOf<Errors<Post>>();
    expectTypeOf<Errors<Post>>().not.toMatchTypeOf<Errors<User>>();
  });

  it("ValidatableRecord<User> and ValidatableRecord<Post> are not mutually assignable", () => {
    expectTypeOf<ValidatableRecord<User>>().not.toMatchTypeOf<ValidatableRecord<Post>>();
    expectTypeOf<ValidatableRecord<Post>>().not.toMatchTypeOf<ValidatableRecord<User>>();
  });

  it("Validator<User>.validate receives ValidatableRecord<User>", () => {
    abstract class UserValidator extends Validator<User> {}
    expectTypeOf<Parameters<UserValidator["validate"]>[0]>().toEqualTypeOf<
      ValidatableRecord<User>
    >();
  });

  it("EachValidator<User>.validateEach receives ValidatableRecord<User>", () => {
    class UserEachValidator extends EachValidator<User> {
      validateEach(_record: ValidatableRecord<User>, _attr: string, _val: unknown): void {}
    }
    expectTypeOf<Parameters<UserEachValidator["validateEach"]>[0]>().toEqualTypeOf<
      ValidatableRecord<User>
    >();
  });

  it("BlockValidator<User> callback receives ValidatableRecord<User>", () => {
    type BlockFn = ConstructorParameters<typeof BlockValidator<User>>[1];
    expectTypeOf<Parameters<BlockFn>[0]>().toEqualTypeOf<ValidatableRecord<User>>();
  });

  it("Model subclass .errors resolves to Errors<ConcreteModel>", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person();
    expectTypeOf(p.errors).toEqualTypeOf<Errors<Person>>();
  });
});
