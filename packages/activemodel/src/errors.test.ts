import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  assertEmpty,
  assertNotEmpty,
  assertIncludes,
  assertNotIncludes,
  assertNot,
  assertNotSame,
  assertNothingRaised,
  assertNotRespondTo,
  assertPredicate,
  assertNotPredicate,
  assertRaises,
  assertSame,
  isBlank,
} from "@blazetrails/activesupport";
import { FrozenError } from "@blazetrails/ruby-compat";
import { Errors } from "./errors.js";
import { Error as ModelError } from "./error.js";
import { I18n } from "./i18n.js";
import { resetI18n } from "./test-helpers/i18n.js";

class Person {
  errors: Errors<Person>;
  name: string | null = null;
  age: number | null = null;
  gender: string | null = null;
  city: string | null = null;

  constructor() {
    this.errors = new Errors(this);
  }

  validateBang(): void {
    if (this.name === null) this.errors.add("name", ":blank", { message: "cannot be nil" });
  }

  readAttributeForValidation(attr: string): unknown {
    return (this as unknown as Record<string, unknown>)[attr];
  }

  static humanAttributeName(attr: string, _options: object = {}): string {
    return attr;
  }

  static lookupAncestors(): unknown[] {
    return [this];
  }
}

describe("ErrorsTest", () => {
  beforeEach(() => {
    resetI18n();
  });

  afterEach(() => {
    resetI18n();
  });

  it("delete", () => {
    const errors = new Errors(new Person());
    errors.add("name", ":blank");
    errors.delete("name");
    assertEmpty(errors.messagesFor("name"));
  });

  it("include?", () => {
    const errors = new Errors(new Person());
    errors.add("foo", "omg");
    assertIncludes(errors, "foo", "errors should include :foo");
    assertIncludes(errors, "foo", "errors should include 'foo' as :foo");
  });

  it("each when arity is negative", () => {
    const errors = new Errors(new Person());
    errors.add("name", ":blank");
    errors.add("gender", ":blank");

    expect(errors.map((e) => e.attribute)).toEqual(["name", "gender"]);
  });

  it("any?", () => {
    const errors = new Errors(new Person());
    errors.add("name");
    assertPredicate(errors, (e) => e.isAny(), "any? should return true");
    expect(errors.isAny(() => true)).toBeTruthy();
  });

  it("first", () => {
    const errors = new Errors(new Person());
    errors.add("name", ":blank");

    const error = errors.first();
    expect(error).toBeInstanceOf(ModelError);
  });

  it("dup", () => {
    const errors = new Errors(new Person());
    errors.add("name");
    const errorsDup = errors.dup();
    assertNotSame(errorsDup.errors, errors.errors);
  });

  it("has key?", () => {
    const errors = new Errors(new Person());
    errors.add("foo", "omg");
    expect(errors.hasKey("foo")).toBe(true);
    expect(errors.hasKey("foo")).toBe(true);
  });

  it("has no key", () => {
    const errors = new Errors(new Person());
    expect(errors.hasKey("name")).toBe(false);
  });

  it("key?", () => {
    const errors = new Errors(new Person());
    errors.add("foo", "omg");
    expect(errors.isKey("foo")).toBe(true);
    expect(errors.isKey("foo")).toBe(true);
  });

  it("no key", () => {
    const errors = new Errors(new Person());
    expect(errors.isKey("name")).toBe(false);
  });

  it("clear errors", () => {
    const person = new Person();
    person.validateBang();

    expect(person.errors.count).toBe(1);
    person.errors.clear();
    assertEmpty(person.errors);
  });

  it("error access is indifferent", () => {
    const errors = new Errors(new Person());
    errors.add("name", "omg");

    expect(errors.messagesFor("name")).toEqual(["omg"]);
  });

  it("attribute_names returns the error attributes", () => {
    const errors = new Errors(new Person());
    errors.add("foo", "omg");
    errors.add("baz", "zomg");

    expect(errors.attributeNames).toEqual(["foo", "baz"]);
  });

  it("attribute_names only returns unique attribute names", () => {
    const errors = new Errors(new Person());
    errors.add("foo", "omg");
    errors.add("foo", "zomg");

    expect(errors.attributeNames).toEqual(["foo"]);
  });

  it("attribute_names returns an empty array after try to get a message only", () => {
    const errors = new Errors(new Person());
    errors.messages.get("foo");
    errors.messages.get("baz");

    expect(errors.attributeNames).toEqual([]);
  });

  it("detecting whether there are errors with empty?, blank?, include?", () => {
    const person = new Person();
    person.errors.messagesFor("foo");
    assertEmpty(person.errors);
    assertPredicate(person.errors, (e) => isBlank(e));
    assertNotIncludes(person.errors, "foo");

    person.errors.add("foo", "New error");
    assertNotEmpty(person.errors);
    assertNotPredicate(person.errors, (e) => isBlank(e));
    assertIncludes(person.errors, "foo");
  });

  it("include? does not add a key to messages hash", () => {
    const person = new Person();
    person.errors.include("foo");

    assertNot(person.errors.messages.has("foo"));
  });

  it("adding errors using conditionals with Person#validate!", () => {
    const person = new Person();
    person.validateBang();
    expect(person.errors.fullMessages).toEqual(["name cannot be nil"]);
    expect(person.errors.messagesFor("name")).toEqual(["cannot be nil"]);
  });

  it("add creates an error object and returns it", () => {
    const person = new Person();
    const error = person.errors.add("name", ":blank");

    expect(error.attribute).toBe("name");
    expect(error.type).toBe(":blank");
    expect(person.errors.objects[0]).toBe(error);
  });

  it("add, with type as symbol", () => {
    const person = new Person();
    person.errors.add("name", ":blank");

    expect(person.errors.objects[0].type).toBe(":blank");
    expect(person.errors.messagesFor("name")).toEqual(["can't be blank"]);
  });

  it("add, with type as String", () => {
    const msg = "custom msg";

    const person = new Person();
    person.errors.add("name", msg);

    expect(person.errors.messagesFor("name")).toEqual([msg]);
  });

  it("add, with type as nil", () => {
    const person = new Person();
    person.errors.add("name");

    expect(person.errors.objects[0].type).toBe(":invalid");
    expect(person.errors.messagesFor("name")).toEqual(["is invalid"]);
  });

  it("add, with type as Proc, which evaluates to String", () => {
    const msg = "custom msg";
    const type = () => msg;

    const person = new Person();
    person.errors.add("name", type);

    expect(person.errors.messagesFor("name")).toEqual([msg]);
  });

  it("add, type being Proc, which evaluates to Symbol", () => {
    const type = () => ":blank";

    const person = new Person();
    person.errors.add("name", type);

    expect(person.errors.objects[0].type).toBe(":blank");
    expect(person.errors.messagesFor("name")).toEqual(["can't be blank"]);
  });

  it("add an error message on a specific attribute with a defined type", () => {
    const person = new Person();
    person.errors.add("name", ":blank", { message: "cannot be blank" });
    expect(person.errors.messagesFor("name")).toEqual(["cannot be blank"]);
  });

  it("initialize options[:message] as Proc, which evaluates to String", () => {
    const msg = "custom msg";
    const type = () => msg;

    const person = new Person();
    person.errors.add("name", ":blank", { message: type });

    expect(person.errors.objects[0].type).toBe(":blank");
    expect(person.errors.messagesFor("name")).toEqual([msg]);
  });

  it("add, with options[:message] as Proc, which evaluates to String, where type is nil", () => {
    const msg = "custom msg";
    const type = () => msg;

    const person = new Person();
    person.errors.add("name", undefined, { message: type });

    expect(person.errors.objects[0].type).toBe(":invalid");
    expect(person.errors.messagesFor("name")).toEqual([msg]);
  });

  it("added? when attribute was added through a collection", () => {
    const person = new Person();
    person.errors.add("family_members.name", ":too_long", { count: 25 });
    expect(person.errors.added("family_members.name", ":too_long", { count: 25 })).toBeTruthy();
    assertNot(person.errors.added("family_members.name", ":too_long"));
    assertNot(person.errors.added("family_members.name", ":too_long", { name: "hello" }));
  });

  it("added? ignores callback option", () => {
    const person = new Person();

    person.errors.add("name", ":too_long", { if: () => true });
    expect(person.errors.added("name", ":too_long")).toBeTruthy();
  });

  it("added? ignores message option", () => {
    const person = new Person();

    person.errors.add("name", ":too_long", { message: () => "foo" });
    expect(person.errors.added("name", ":too_long")).toBeTruthy();
  });

  it("added? detects indifferent if a specific error was added to the object", () => {
    const person = new Person();
    person.errors.add("name", "cannot be blank");
    expect(person.errors.added("name", "cannot be blank")).toBeTruthy();
    expect(person.errors.added("name", "cannot be blank")).toBeTruthy();
  });

  it("added? handles symbol message", () => {
    const person = new Person();
    person.errors.add("name", ":blank");
    expect(person.errors.added("name", ":blank")).toBeTruthy();
  });

  it("added? returns true when string attribute is used with a symbol message", () => {
    const person = new Person();
    person.errors.add("name", ":blank");
    expect(person.errors.added("name", ":blank")).toBeTruthy();
  });

  it("added? handles proc messages", () => {
    const person = new Person();
    const message = () => "cannot be blank";
    person.errors.add("name", message);
    expect(person.errors.added("name", message)).toBeTruthy();
  });

  it("added? defaults message to :invalid", () => {
    const person = new Person();
    person.errors.add("name");
    expect(person.errors.added("name")).toBeTruthy();
  });

  it("added? matches the given message when several errors are present for the same attribute", () => {
    const person = new Person();
    person.errors.add("name", "cannot be blank");
    person.errors.add("name", "is invalid");
    expect(person.errors.added("name", "cannot be blank")).toBeTruthy();
    expect(person.errors.added("name", "is invalid")).toBeTruthy();
    assertNot(person.errors.added("name", "incorrect"));
  });

  it("added? returns false when no errors are present", () => {
    const person = new Person();
    assertNot(person.errors.added("name"));
  });

  it("added? returns false when checking a nonexisting error and other errors are present for the given attribute", () => {
    const person = new Person();
    person.errors.add("name", "is invalid");
    assertNot(person.errors.added("name", "cannot be blank"));
  });

  it("added? returns false when checking for an error, but not providing message argument", () => {
    const person = new Person();
    person.errors.add("name", "cannot be blank");
    assertNot(person.errors.added("name"));
  });

  it("added? returns false when checking for an error with an incorrect or missing option", () => {
    const person = new Person();
    person.errors.add("name", ":too_long", { count: 25 });

    expect(person.errors.added("name", ":too_long", { count: 25 })).toBeTruthy();
    expect(person.errors.added("name", "is too long (maximum is 25 characters)")).toBeTruthy();
    assertNot(person.errors.added("name", ":too_long", { count: 24 }));
    assertNot(person.errors.added("name", ":too_long"));
    assertNot(person.errors.added("name", "is too long"));
  });

  it("added? returns false when checking for an error by symbol and a different error with same message is present", () => {
    I18n.backend().storeTranslations("en", {
      errors: { attributes: { name: { wrong: "is wrong", used: "is wrong" } } },
    });
    const person = new Person();
    person.errors.add("name", ":wrong");
    assertNot(person.errors.added("name", ":used"));
    expect(person.errors.added("name", ":wrong")).toBeTruthy();
  });

  it("of_kind? returns false when checking for an error, but not providing message argument", () => {
    const person = new Person();
    person.errors.add("name", "cannot be blank");
    assertNot(person.errors.ofKind("name"));
  });

  it("of_kind? returns false when checking a nonexisting error and other errors are present for the given attribute", () => {
    const person = new Person();
    person.errors.add("name", "is invalid");
    assertNot(person.errors.ofKind("name", "cannot be blank"));
  });

  it("of_kind? returns false when no errors are present", () => {
    const person = new Person();
    assertNot(person.errors.ofKind("name"));
  });

  it("of_kind? matches the given message when several errors are present for the same attribute", () => {
    const person = new Person();
    person.errors.add("name", "cannot be blank");
    person.errors.add("name", "is invalid");
    expect(person.errors.ofKind("name", "cannot be blank")).toBeTruthy();
    expect(person.errors.ofKind("name", "is invalid")).toBeTruthy();
    assertNot(person.errors.ofKind("name", "incorrect"));
  });

  it("of_kind? defaults message to :invalid", () => {
    const person = new Person();
    person.errors.add("name");
    expect(person.errors.ofKind("name")).toBeTruthy();
  });

  it("of_kind? handles proc messages", () => {
    const person = new Person();
    const message = () => "cannot be blank";
    person.errors.add("name", message);
    expect(person.errors.ofKind("name", message)).toBeTruthy();
  });

  it("of_kind? returns true when string attribute is used with a symbol message", () => {
    const person = new Person();
    person.errors.add("name", ":blank");
    expect(person.errors.ofKind("name", ":blank")).toBeTruthy();
  });

  it("of_kind? handles symbol message", () => {
    const person = new Person();
    person.errors.add("name", ":blank");
    expect(person.errors.ofKind("name", ":blank")).toBeTruthy();
  });

  it("of_kind? detects indifferent if a specific error was added to the object", () => {
    const person = new Person();
    person.errors.add("name", "cannot be blank");
    expect(person.errors.ofKind("name", "cannot be blank")).toBeTruthy();
    expect(person.errors.ofKind("name", "cannot be blank")).toBeTruthy();
  });

  it("of_kind? ignores options", () => {
    const person = new Person();
    person.errors.add("name", ":too_long", { count: 25 });

    expect(person.errors.ofKind("name", ":too_long")).toBeTruthy();
    expect(person.errors.ofKind("name", "is too long (maximum is 25 characters)")).toBeTruthy();
  });

  it("of_kind? returns false when checking for an error by symbol and a different error with same message is present", () => {
    I18n.backend().storeTranslations("en", {
      errors: { attributes: { name: { wrong: "is wrong", used: "is wrong" } } },
    });
    const person = new Person();
    person.errors.add("name", ":wrong");
    assertNot(person.errors.ofKind("name", ":used"));
    expect(person.errors.ofKind("name", ":wrong")).toBeTruthy();
  });

  it("size calculates the number of error messages", () => {
    const person = new Person();
    person.errors.add("name", "cannot be blank");
    expect(person.errors.size).toBe(1);
  });

  it("count calculates the number of error messages", () => {
    const person = new Person();
    person.errors.add("name", "cannot be blank");
    expect(person.errors.count).toBe(1);
  });

  it("to_a returns the list of errors with complete messages containing the attribute names", () => {
    const person = new Person();
    person.errors.add("name", "cannot be blank");
    person.errors.add("name", "cannot be nil");
    expect(person.errors.toArray()).toEqual(["name cannot be blank", "name cannot be nil"]);
  });

  it("to_hash returns the error messages hash", () => {
    const person = new Person();
    person.errors.add("name", "cannot be blank");
    expect(Object.fromEntries(person.errors.toHash())).toEqual({ name: ["cannot be blank"] });
  });

  it("to_hash returns a hash without default proc", () => {
    const person = new Person();
    expect(person.errors.toHash().defaultProc()).toBeUndefined();
  });

  it("as_json returns a hash without default proc", () => {
    const person = new Person();
    expect((person.errors.asJson() as { defaultProc?: unknown }).defaultProc).toBeUndefined();
  });

  it("messages returns empty frozen array when accessed with non-existent attribute", async () => {
    const errors = new Errors(new Person());

    expect(errors.messages.get("foo")).toEqual([]);
    await assertRaises([FrozenError], {}, () =>
      (errors.messages.get("foo") as string[]).push("foo"),
    );
    await assertRaises(
      [FrozenError],
      {},
      () => ((errors.messages.get("foo") as string[]).length = 0),
    );
  });

  it("full_messages doesn't require the base object to respond to `:errors", () => {
    class Model {
      _errors: Errors<Model>;

      constructor() {
        this._errors = new Errors(this);
        this._errors.add("name", "bar");
      }

      static humanAttributeName(_attr: string, _options: object = {}): string {
        return "foo";
      }

      call(): { modelErrors: Errors<Model> } {
        return { modelErrors: this._errors };
      }
    }

    expect(new Model().call().modelErrors.fullMessages).toEqual(["foo bar"]);
  });

  it("full_messages creates a list of error messages with the attribute name included", () => {
    const person = new Person();
    person.errors.add("name", "cannot be blank");
    person.errors.add("name", "cannot be nil");
    expect(person.errors.fullMessages).toEqual(["name cannot be blank", "name cannot be nil"]);
  });

  it("full_messages_for contains all the error messages for the given attribute indifferent", () => {
    const person = new Person();
    person.errors.add("name", "cannot be blank");
    person.errors.add("name", "cannot be nil");
    expect(person.errors.fullMessagesFor("name")).toEqual([
      "name cannot be blank",
      "name cannot be nil",
    ]);
  });

  it("full_messages_for does not contain error messages from other attributes", () => {
    const person = new Person();
    person.errors.add("name", "cannot be blank");
    person.errors.add("email", "cannot be blank");
    expect(person.errors.fullMessagesFor("name")).toEqual(["name cannot be blank"]);
    expect(person.errors.fullMessagesFor("name")).toEqual(["name cannot be blank"]);
  });

  it("full_messages_for returns an empty list in case there are no errors for the given attribute", () => {
    const person = new Person();
    person.errors.add("name", "cannot be blank");
    expect(person.errors.fullMessagesFor("email")).toEqual([]);
  });

  it("full_message returns the given message when attribute is :base", () => {
    const person = new Person();
    expect(person.errors.fullMessage("base", "press the button")).toBe("press the button");
  });

  it("full_message returns the given message with the attribute name included", () => {
    const person = new Person();
    expect(person.errors.fullMessage("name", "cannot be blank")).toBe("name cannot be blank");
    expect(person.errors.fullMessage("name_test", "cannot be blank")).toBe(
      "name_test cannot be blank",
    );
  });

  it("as_json creates a json formatted representation of the errors hash", () => {
    const person = new Person();
    person.validateBang();

    expect(person.errors.asJson()).toEqual({ name: ["cannot be nil"] });
  });

  it("as_json with :full_messages option creates a json formatted representation of the errors containing complete messages", () => {
    const person = new Person();
    person.validateBang();

    expect(person.errors.asJson({ fullMessages: true })).toEqual({ name: ["name cannot be nil"] });
  });

  it("generate_message works without i18n_scope", async () => {
    const person = new Person();
    assertNotRespondTo(Person, "i18nScope");
    await assertNothingRaised(() => {
      return person.errors.generateMessage("name", ":blank");
    });
  });

  it("details returns added error detail", () => {
    const person = new Person();
    person.errors.add("name", ":invalid");
    expect(Object.fromEntries(person.errors.details)).toEqual({ name: [{ error: ":invalid" }] });
  });

  it("details returns added error detail with custom option", () => {
    const person = new Person();
    person.errors.add("name", ":greater_than", { count: 5 });
    expect(Object.fromEntries(person.errors.details)).toEqual({
      name: [{ error: ":greater_than", count: 5 }],
    });
  });

  it("details do not include message option", () => {
    const person = new Person();
    person.errors.add("name", ":invalid", { message: "is bad" });
    expect(Object.fromEntries(person.errors.details)).toEqual({ name: [{ error: ":invalid" }] });
  });

  it("details retains original type as error", () => {
    const errors = new Errors(new Person());
    errors.add("name", "cannot be nil");
    errors.add("foo", "bar");
    errors.add("baz", null);
    errors.add("age", ":invalid", { count: 3, message: "%{count} is too low" });

    expect(Object.fromEntries(errors.details)).toEqual({
      name: [{ error: "cannot be nil" }],
      foo: [{ error: "bar" }],
      baz: [{ error: null }],
      age: [{ error: ":invalid", count: 3 }],
    });
  });

  it("group_by_attribute", () => {
    const person = new Person();
    const error = person.errors.add("name", ":invalid", { message: "is bad" });
    const hash = person.errors.groupByAttribute();

    expect(hash).toEqual({ name: [error] });
  });

  it("dup duplicates details", () => {
    const errors = new Errors(new Person());
    errors.add("name", ":invalid");
    const errorsDup = errors.dup();
    errorsDup.add("name", ":taken");
    expect(Object.fromEntries(errorsDup.details)).not.toEqual(Object.fromEntries(errors.details));
  });

  it("delete returns nil when no errors were deleted", () => {
    const errors = new Errors(new Person());

    expect(errors.delete("name")).toBeNull();
  });

  it("delete removes details on given attribute", () => {
    const errors = new Errors(new Person());
    errors.add("name", ":invalid");
    errors.delete("name");
    assertNot(errors.added("name"));
  });

  it("delete returns the deleted messages", () => {
    const errors = new Errors(new Person());
    errors.add("name", ":invalid");
    expect(errors.delete("name")).toEqual(["is invalid"]);
  });

  it("clear removes details", () => {
    const person = new Person();
    person.errors.add("name", ":invalid");

    expect(person.errors.details.size).toBe(1);
    person.errors.clear();
    assertEmpty(person.errors.details);
  });

  it("details returns empty array when accessed with non-existent attribute", async () => {
    const errors = new Errors(new Person());

    expect(errors.details.get("foo")).toEqual([]);
    await assertRaises([FrozenError], {}, () =>
      (errors.details.get("foo") as unknown[]).push("foo"),
    );
    await assertRaises(
      [FrozenError],
      {},
      () => ((errors.details.get("foo") as unknown[]).length = 0),
    );
  });

  it("copy errors", () => {
    const errors = new Errors(new Person());
    errors.add("name", ":invalid");
    const person = new Person();
    person.errors.copyBang(errors);

    expect(person.errors.added("name", ":invalid")).toBeTruthy();
    person.errors.each((error) => {
      assertSame(person, error.base);
    });
  });

  it("merge errors", () => {
    const errors = new Errors(new Person());
    errors.add("name", ":invalid");

    const person = new Person();
    person.errors.add("name", ":blank");
    person.errors.mergeBang(errors);

    expect(person.errors.added("name", ":invalid")).toBeTruthy();
    expect(person.errors.added("name", ":blank")).toBeTruthy();
  });

  it("merge does not import errors when merging with self", () => {
    const errors = new Errors(new Person());
    errors.add("name", ":invalid");
    const errorsBeforeMerge = errors.dup();

    errors.mergeBang(errors);

    expect(errors.errors).toEqual(errorsBeforeMerge.errors);
  });

  it.skip("errors are marshalable", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/parity/unported-files/unscoped.ts) — marshal
  });

  it.skip("errors are compatible with YAML dumped from Rails 6.x", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/parity/unported-files/unscoped.ts) — psych
  });

  it("inspect", () => {
    const errors = new Errors(new Person());
    errors.add("base");

    expect(errors.inspect()).toBe(`#<ActiveModel::Errors [${errors.objects[0].inspect()}]>`);
  });
});
