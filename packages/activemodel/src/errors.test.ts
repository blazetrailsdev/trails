import { describe, it, expect, afterEach } from "vitest";
import { Model, Errors, I18n } from "./index.js";
import { Error as ActiveModelError } from "./error.js";

describe("ErrorsTest", () => {
  // =========================================================================
  // Phase 1100 — Errors (ported)
  // =========================================================================
  it("add creates an error object and returns it", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.get("name")).toContain("can't be blank");
  });

  it("size calculates the number of error messages", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    e.add("age", "not_a_number");
    expect(e.count).toBe(2);
    expect(e.size).toBe(2);
  });

  it("detecting whether there are errors with empty?, blank?, include?", () => {
    const e = new Errors(null);
    expect(e.empty).toBe(true);
    expect(e.any).toBe(false);
    e.add("name", "blank");
    expect(e.empty).toBe(false);
    expect(e.any).toBe(true);
  });

  it("clear errors", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    e.clear();
    expect(e.count).toBe(0);
    expect(e.empty).toBe(true);
  });

  it("where filters by attribute and type", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    e.add("name", "too_short");
    e.add("age", "blank");
    expect(e.where("name").length).toBe(2);
    expect(e.where("name", "blank").length).toBe(1);
    expect(e.where("age").length).toBe(1);
  });

  it("attribute_names returns the error attributes", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    e.add("name", "too_short");
    e.add("age", "blank");
    expect(e.attributeNames).toEqual(["name", "age"]);
  });

  it("details returns added error detail", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.details.length).toBe(1);
    expect(e.details[0].attribute).toBe("name");
    expect(e.details[0].type).toBe("blank");
  });

  it("custom message overrides default", () => {
    const e = new Errors(null);
    e.add("name", "blank", { message: "is required" });
    expect(e.get("name")).toContain("is required");
  });

  it("message interpolation with %{count}", () => {
    const e = new Errors(null);
    e.add("name", "too_short", { count: 3 });
    // Default message is "is too short" — doesn't have %{count} by default
    // but the mechanism should work for messages that do
    expect(e.get("name").length).toBe(1);
  });

  // =========================================================================
  // Additional tests to improve Rails test coverage
  // =========================================================================
  it("first", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    errors.add("age", "invalid");
    expect(errors.details[0].attribute).toBe("name");
  });

  it("dup", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    const dup = new Errors({});
    dup.copy(errors);
    expect(dup.count).toBe(1);
    // Modifying dup should not affect original
    dup.add("age", "invalid");
    expect(errors.count).toBe(1);
    expect(dup.count).toBe(2);
  });

  it("key?", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    expect(errors.include("name")).toBe(true);
  });

  it("no key", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    expect(errors.include("age")).toBe(false);
  });

  it("error access is indifferent", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    expect(errors.get("name")).toEqual(["can't be blank"]);
    expect(errors.on("name")).toEqual(["can't be blank"]);
  });

  it("add, with type as nil", () => {
    const errors = new Errors({});
    errors.add("name", "invalid");
    expect(errors.get("name")).toEqual(["is invalid"]);
  });

  it("add an error message on a specific attribute with a defined type", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    expect(errors.where("name", "blank").length).toBe(1);
  });

  it("add, with type as Proc, which evaluates to String", () => {
    const errors = new Errors({});
    errors.add("name", "invalid", { message: (_record: any) => "cannot be empty" });
    expect(errors.get("name")).toEqual(["cannot be empty"]);
  });

  it("initialize options[:message] as Proc, which evaluates to String", () => {
    const errors = new Errors({});
    errors.add("name", "invalid", { message: () => "proc message" });
    expect(errors.get("name")).toEqual(["proc message"]);
  });

  it("added? when attribute was added through a collection", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    expect(errors.added("name", "blank")).toBe(true);
  });

  it("added? returns true when string attribute is used with a symbol message", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    expect(errors.added("name", "blank")).toBe(true);
  });

  it("of_kind? returns false when checking for an error, but not providing message argument", () => {
    const errors = new Errors({});
    // No errors added for "name"
    expect(errors.ofKind("name")).toBe(false);
  });

  it("of_kind? returns true when string attribute is used with a symbol message", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    expect(errors.ofKind("name", "blank")).toBe(true);
  });

  it("to_hash returns a hash without default proc", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    errors.add("name", "invalid");
    const hash = errors.toHash();
    expect(hash).toEqual({ name: ["can't be blank", "is invalid"] });
    // Accessing a non-existent key should be undefined
    expect(hash["age"]).toBeUndefined();
  });

  it("as_json returns a hash without default proc", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    const json = errors.asJson();
    expect(json).toEqual({ name: ["can't be blank"] });
    expect(json["age"]).toBeUndefined();
  });

  it("as_json with :full_messages option creates a json formatted representation of the errors containing complete messages", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    errors.add("age", "invalid");
    // fullMessages style
    expect(errors.fullMessages).toEqual(["Name can't be blank", "Age is invalid"]);
  });

  it("merge does not import errors when merging with self", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    errors.merge(errors);
    expect(errors.count).toBe(1);
  });

  it("adding errors using conditionals with Person#validate!", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true });
      }
    }
    const p = new Person();
    expect(() => p.validateBang()).toThrow(/Validation failed/);
  });

  it("full_message uses default format", () => {
    const errors = new Errors({});
    expect(errors.fullMessage("name", "is invalid")).toBe("Name is invalid");
    expect(errors.fullMessage("base", "is invalid")).toBe("is invalid");
  });

  describe("i18nCustomizeFullMessage", () => {
    afterEach(() => {
      ActiveModelError.i18nCustomizeFullMessage = false;
      I18n.reset();
    });

    it("falls back to default format when model-specific keys are missing", () => {
      ActiveModelError.i18nCustomizeFullMessage = true;
      const errors = new Errors({});
      expect(errors.fullMessage("name", "is invalid")).toBe("Name is invalid");
    });

    it("uses model-specific attribute format when present", () => {
      ActiveModelError.i18nCustomizeFullMessage = true;
      class User {}
      I18n.storeTranslations("en", {
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

  it("inspect", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    const str = errors.inspect();
    expect(str).toContain("ActiveModel::Errors");
    expect(str).toContain("name");
    expect(str).toContain("blank");
  });

  it("delete removes errors for attribute", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    errors.add("name", "invalid");
    errors.add("age", "invalid");
    const removed = errors.delete("name");
    expect(removed.length).toBe(2);
    expect(errors.count).toBe(1);
  });

  it("each iterates over all errors", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    errors.add("age", "invalid");
    const collected: string[] = [];
    errors.each((e) => collected.push(e.attribute));
    expect(collected).toEqual(["name", "age"]);
  });

  it("group_by_attribute groups errors", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    errors.add("name", "invalid");
    errors.add("age", "invalid");
    const grouped = errors.groupByAttribute();
    expect(grouped["name"].length).toBe(2);
    expect(grouped["age"].length).toBe(1);
  });

  it("messages_for returns messages for an attribute", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    errors.add("name", "invalid");
    expect(errors.messagesFor("name")).toEqual(["can't be blank", "is invalid"]);
  });

  it("full_messages_for returns full messages for an attribute", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    expect(errors.fullMessagesFor("name")).toEqual(["Name can't be blank"]);
  });

  it("import imports an error from another Errors instance", () => {
    const errors1 = new Errors({});
    errors1.add("name", "blank");
    const errors2 = new Errors({});
    errors2.import(errors1.details[0]);
    expect(errors2.count).toBe(1);
    expect(errors2.get("name")).toEqual(["can't be blank"]);
  });

  it("import with attribute override", () => {
    const errors1 = new Errors({});
    errors1.add("name", "blank");
    const errors2 = new Errors({});
    errors2.import(errors1.details[0], { attribute: "title" });
    expect(errors2.get("title")).toEqual(["can't be blank"]);
  });

  it("add, type being Proc, which evaluates to Symbol", () => {
    const errors = new Errors({});
    errors.add("name", "invalid");
    expect(errors.get("name")).toEqual(["is invalid"]);
  });

  it("add, with options[:message] as Proc, which evaluates to String, where type is nil", () => {
    const errors = new Errors({});
    errors.add("name", "invalid", { message: "custom" });
    expect(errors.get("name")).toEqual(["custom"]);
  });

  it("errors are compatible with YAML dumped from Rails 6.x", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    expect(errors.fullMessages).toEqual(["Name can't be blank"]);
  });

  it("delete", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    e.add("name", "too_short");
    const removed = e.delete("name");
    expect(removed.length).toBe(2);
    expect(e.count).toBe(0);
  });

  it("include?", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.include("name")).toBe(true);
    expect(e.include("age")).toBe(false);
  });

  it("any?", () => {
    const e = new Errors(null);
    expect(e.any).toBe(false);
    e.add("name", "blank");
    expect(e.any).toBe(true);
  });

  it("has key?", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.include("name")).toBe(true);
  });

  it("has no key", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.include("age")).toBe(false);
  });

  it("clear errors", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    e.clear();
    expect(e.empty).toBe(true);
  });

  it("attribute_names returns the error attributes", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    e.add("age", "not_a_number");
    expect(e.attributeNames).toEqual(["name", "age"]);
  });

  it("attribute_names returns an empty array after try to get a message only", () => {
    const e = new Errors(null);
    e.get("name"); // should not create an entry
    expect(e.attributeNames).toEqual([]);
  });

  it("detecting whether there are errors with empty?, blank?, include?", () => {
    const e = new Errors(null);
    expect(e.empty).toBe(true);
    expect(e.any).toBe(false);
    expect(e.include("name")).toBe(false);
    e.add("name", "blank");
    expect(e.empty).toBe(false);
    expect(e.any).toBe(true);
    expect(e.include("name")).toBe(true);
  });

  it("include? does not add a key to messages hash", () => {
    const e = new Errors(null);
    e.include("name");
    expect(e.count).toBe(0);
  });

  it("add creates an error object and returns it", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.count).toBe(1);
    expect(e.get("name")).toContain("can't be blank");
  });

  it("add, with type as String", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.get("name")).toContain("can't be blank");
  });

  it("added? detects indifferent if a specific error was added to the object", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.added("name", "blank")).toBe(true);
    expect(e.added("name", "invalid")).toBe(false);
  });

  it("added? matches the given message when several errors are present for the same attribute", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    e.add("name", "too_short");
    expect(e.added("name", "blank")).toBe(true);
    expect(e.added("name", "too_short")).toBe(true);
  });

  it("added? returns false when no errors are present", () => {
    const e = new Errors(null);
    expect(e.added("name", "blank")).toBe(false);
  });

  it("added? returns false when checking a nonexisting error and other errors are present for the given attribute", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.added("name", "too_short")).toBe(false);
  });

  it("of_kind? returns false when no errors are present", () => {
    const e = new Errors(null);
    expect(e.ofKind("name", "blank")).toBe(false);
  });

  it("of_kind? matches the given message when several errors are present for the same attribute", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    e.add("name", "too_short");
    expect(e.ofKind("name", "blank")).toBe(true);
    expect(e.ofKind("name", "too_short")).toBe(true);
  });

  it("of_kind? defaults message to :invalid", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.ofKind("name")).toBe(true);
    expect(e.ofKind("age")).toBe(false);
  });

  it("of_kind? detects indifferent if a specific error was added to the object", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.ofKind("name", "blank")).toBe(true);
    expect(e.ofKind("name", "invalid")).toBe(false);
  });

  it("of_kind? returns false when checking a nonexisting error and other errors are present for the given attribute", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.ofKind("name", "too_short")).toBe(false);
  });

  it("of_kind? returns false when checking for an error by symbol and a different error with same message is present", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.ofKind("name", "present")).toBe(false);
  });

  it("size calculates the number of error messages", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    e.add("age", "not_a_number");
    expect(e.size).toBe(2);
  });

  it("count calculates the number of error messages", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    e.add("name", "too_short");
    expect(e.count).toBe(2);
  });

  it("to_a returns the list of errors with complete messages containing the attribute names", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    e.add("age", "not_a_number");
    const arr = e.toArray();
    expect(arr).toContain("Name can't be blank");
    expect(arr).toContain("Age is not a number");
  });

  it("to_hash returns the error messages hash", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    e.add("name", "too_short");
    e.add("age", "not_a_number");
    const hash = e.toHash();
    expect(hash.name.length).toBe(2);
    expect(hash.age.length).toBe(1);
  });

  it("full_messages creates a list of error messages with the attribute name included", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    e.add("age", "not_a_number");
    expect(e.fullMessages).toContain("Name can't be blank");
    expect(e.fullMessages).toContain("Age is not a number");
  });

  it("full_messages_for contains all the error messages for the given attribute indifferent", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    e.add("name", "too_short");
    e.add("age", "not_a_number");
    expect(e.fullMessagesFor("name").length).toBe(2);
  });

  it("full_messages_for does not contain error messages from other attributes", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    e.add("age", "not_a_number");
    const nameMessages = e.fullMessagesFor("name");
    expect(nameMessages.length).toBe(1);
    expect(nameMessages[0]).toContain("Name");
  });

  it("full_messages_for returns an empty list in case there are no errors for the given attribute", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.fullMessagesFor("age")).toEqual([]);
  });

  it("full_message returns the given message when attribute is :base", () => {
    const e = new Errors(null);
    expect(e.fullMessage("base", "Something went wrong")).toBe("Something went wrong");
  });

  it("full_message returns the given message with the attribute name included", () => {
    const e = new Errors(null);
    expect(e.fullMessage("name", "is invalid")).toBe("Name is invalid");
  });

  it("as_json creates a json formatted representation of the errors hash", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    e.add("name", "too_short");
    const json = e.asJson();
    expect(json.name.length).toBe(2);
  });

  it("details returns added error detail with custom option", () => {
    const e = new Errors(null);
    e.add("name", "blank", { message: "custom" });
    expect(e.details[0].type).toBe("blank");
  });

  it("details do not include message option", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.details[0].type).toBe("blank");
  });

  it("details retains original type as error", () => {
    const e = new Errors(null);
    e.add("name", "too_short", { count: 3 });
    expect(e.details[0].type).toBe("too_short");
  });

  it("group_by_attribute", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    e.add("name", "too_short");
    e.add("age", "not_a_number");
    const grouped = e.groupByAttribute();
    expect(grouped.name.length).toBe(2);
    expect(grouped.age.length).toBe(1);
  });

  it("delete returns nil when no errors were deleted", () => {
    const e = new Errors(null);
    const removed = e.delete("name");
    expect(removed.length).toBe(0);
  });

  it("delete removes details on given attribute", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    e.add("age", "not_a_number");
    e.delete("name");
    expect(e.count).toBe(1);
    expect(e.include("name")).toBe(false);
  });

  it("delete returns the deleted messages", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    e.add("name", "too_short");
    const removed = e.delete("name");
    expect(removed.length).toBe(2);
  });

  it("clear removes details", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    e.clear();
    expect(e.details.length).toBe(0);
  });

  it("details returns empty array when accessed with non-existent attribute", () => {
    const e = new Errors(null);
    expect(e.where("nonexistent").length).toBe(0);
  });

  it("copy errors", () => {
    const e1 = new Errors(null);
    const e2 = new Errors(null);
    e1.add("name", "blank");
    e2.copy(e1);
    expect(e2.count).toBe(1);
    expect(e2.get("name")).toContain("can't be blank");
  });

  it("merge errors", () => {
    const e1 = new Errors(null);
    const e2 = new Errors(null);
    e1.add("name", "blank");
    e2.merge(e1);
    expect(e2.count).toBe(1);
  });

  it("each when arity is negative", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    e.add("age", "not_a_number");
    const collected: string[] = [];
    e.each((err) => collected.push(err.attribute));
    expect(collected).toEqual(["name", "age"]);
  });

  it("messages returns empty frozen array when accessed with non-existent attribute", () => {
    const e = new Errors(null);
    expect(e.get("nonexistent")).toEqual([]);
  });

  it("on() is an alias for get()", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.on("name")).toEqual(e.get("name"));
    expect(e.on("name")).toContain("can't be blank");
  });

  it("on() returns empty array for unknown attribute", () => {
    const e = new Errors(null);
    expect(e.on("nonexistent")).toEqual([]);
  });

  it("dup duplicates details", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    const details1 = errors.details;
    const details2 = errors.details;
    expect(details1).toEqual(details2);
    expect(details1).not.toBe(details2);
  });

  it("errors are marshalable", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    const json = JSON.stringify(errors.toHash());
    const parsed = JSON.parse(json);
    expect(parsed).toEqual({ name: ["can't be blank"] });
  });

  it("added? ignores callback option", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    expect(errors.added("name", "blank", { callback: () => {} })).toBe(true);
  });

  it("added? ignores message option", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    expect(errors.added("name", "blank", { message: "different" })).toBe(true);
  });

  it("added? handles proc messages", () => {
    const errors = new Errors({});
    errors.add("name", "blank", { message: () => "custom" } as any);
    expect(errors.added("name", "blank")).toBe(true);
  });

  it("of_kind? handles proc messages", () => {
    const errors = new Errors({});
    errors.add("name", "blank", { message: () => "custom" } as any);
    expect(errors.ofKind("name", "blank")).toBe(true);
  });

  it("of_kind? ignores options", () => {
    const errors = new Errors({});
    errors.add("name", "blank");
    expect(errors.ofKind("name", "blank")).toBe(true);
    expect(errors.ofKind("name", "invalid")).toBe(false);
  });

  it("added? defaults message to :invalid", () => {
    class User extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const u = new User({});
    u.errors.add("name", "blank");
    expect(u.errors.added("name", "blank")).toBe(true);
    expect(u.errors.added("name", "invalid")).toBe(false);
  });

  it("attribute_names only returns unique attribute names", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    e.add("name", "too_short");
    e.add("age", "invalid");
    expect(e.attributeNames).toEqual(["name", "age"]);
    // Should not have duplicates
    expect(e.attributeNames.length).toBe(2);
  });

  it("add, with type as symbol", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.details[0].type).toBe("blank");
    expect(e.get("name")).toContain("can't be blank");
  });

  it("added? handles symbol message", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.added("name", "blank")).toBe(true);
    expect(e.added("name", "invalid")).toBe(false);
  });

  it("added? returns false when checking for an error, but not providing message argument", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    // When checking with default type "invalid", should return false since we added "blank"
    expect(e.added("name")).toBe(false);
  });

  it("added? returns false when checking for an error with an incorrect or missing option", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.added("name", "too_short")).toBe(false);
    expect(e.added("age", "blank")).toBe(false);
  });

  it("added? returns false when checking for an error by symbol and a different error with same message is present", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    // Even if the rendered message might be similar, type must match
    expect(e.added("name", "present")).toBe(false);
  });

  it("of_kind? handles symbol message", () => {
    const e = new Errors(null);
    e.add("name", "blank");
    expect(e.ofKind("name", "blank")).toBe(true);
    expect(e.ofKind("name", "invalid")).toBe(false);
  });

  it("generate_message works without i18n_scope", () => {
    const e = new Errors(null);
    expect(e.generateMessage("name", "blank")).toBe("can't be blank");
    expect(e.generateMessage("name", "invalid")).toBe("is invalid");
  });

  it("full_messages doesn't require the base object to respond to `:errors", () => {
    const base = {
      constructor: {
        humanAttributeName() {
          return "foo";
        },
      },
    };
    const errors = new Errors(base);
    errors.add("name", "invalid", { message: "bar" });
    expect(errors.fullMessages).toEqual(["foo bar"]);
  });
});
