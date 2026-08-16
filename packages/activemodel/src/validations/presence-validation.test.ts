import { describe, it, expect, afterEach } from "vitest";
import { assertPredicate } from "@blazetrails/activesupport";
import { Model, StrictValidationFailed } from "../index.js";

// Mirrors: activemodel/test/models/topic.rb
class Topic extends Model {
  static {
    this.attribute("title", "string");
    this.attribute("content", "string");
  }
}

// Mirrors: activemodel/test/models/person.rb
class Person extends Model {
  static {
    this.attribute("karma", "string");
  }
}

// Mirrors: activemodel/test/models/custom_reader.rb — validation reads through
// `read_attribute_for_validation`, and `p[:karma] = x` writes the backing hash.
class CustomReader extends Model {
  data: Record<string, unknown> = {};

  override readAttributeForValidation(attribute: string): unknown {
    return this.data[attribute];
  }
}

describe("PresenceValidationTest", () => {
  afterEach(() => {
    Topic.clearValidatorsBang();
    Person.clearValidatorsBang();
    CustomReader.clearValidatorsBang();
  });

  it("validate presences", async () => {
    Topic.validatesPresenceOf("title", "content");

    const t = new Topic();
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    expect(t.errors.get("title")).toEqual(["can't be blank"]);
    expect(t.errors.get("content")).toEqual(["can't be blank"]);

    t.title = "something";
    t.content = "   ";

    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    expect(t.errors.get("content")).toEqual(["can't be blank"]);

    t.content = "like stuff";

    assertPredicate(await t.isValid(), (valid) => valid);
  });

  it("accepts array arguments", async () => {
    // Rails: `Topic.validates_presence_of %w(title content)` — a single array
    // argument, flattened by `_merge_attributes` (`attr_names.flatten!`).
    Topic.validatesPresenceOf(["title", "content"]);
    const t = new Topic();
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    expect(t.errors.get("title")).toEqual(["can't be blank"]);
    expect(t.errors.get("content")).toEqual(["can't be blank"]);
  });

  it("validates acceptance of with custom error using quotes", async () => {
    Person.validatesPresenceOf("karma", {
      message: "This string contains 'single' and \"double\" quotes",
    });
    const p = new Person();
    assertPredicate(await p.isInvalid(), (invalid) => invalid);
    expect(p.errors.get("karma").at(-1)).toEqual(
      "This string contains 'single' and \"double\" quotes",
    );
  });

  it("validates presence of for ruby class", async () => {
    Person.validatesPresenceOf("karma");

    const p = new Person();
    assertPredicate(await p.isInvalid(), (invalid) => invalid);

    expect(p.errors.get("karma")).toEqual(["can't be blank"]);

    p.karma = "Cold";
    assertPredicate(await p.isValid(), (valid) => valid);
  });

  it("validates presence of for ruby class with custom reader", async () => {
    CustomReader.validatesPresenceOf("karma");

    const p = new CustomReader();
    assertPredicate(await p.isInvalid(), (invalid) => invalid);

    expect(p.errors.get("karma")).toEqual(["can't be blank"]);

    p.data["karma"] = "Cold";
    assertPredicate(await p.isValid(), (valid) => valid);
  });

  it("validates presence of with allow nil option", async () => {
    Topic.validatesPresenceOf("title", { allowNil: true });

    const t = new Topic({ title: "something" });
    assertPredicate(await t.isValid(), (valid) => valid);

    t.title = "";
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    expect(t.errors.get("title")).toEqual(["can't be blank"]);

    t.title = "  ";
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    expect(t.errors.get("title")).toEqual(["can't be blank"]);

    t.title = null;
    assertPredicate(await t.isValid(), (valid) => valid);
  });

  it("validates presence of with allow blank option", async () => {
    Topic.validatesPresenceOf("title", { allowBlank: true });

    const t = new Topic({ title: "something" });
    assertPredicate(await t.isValid(), (valid) => valid);

    t.title = "";
    assertPredicate(await t.isValid(), (valid) => valid);

    t.title = "  ";
    assertPredicate(await t.isValid(), (valid) => valid);

    t.title = null;
    assertPredicate(await t.isValid(), (valid) => valid);
  });

  it("passes custom interpolation vars through to errors.add", async () => {
    class Interpolated extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: { message: "is %{kind}", kind: "wrong" } });
      }
    }
    const p = new Interpolated({});
    await p.isValid();
    expect(p.errors.get("name")).toContain("is wrong");
  });

  it("strict: true raises StrictValidationFailed via filteredErrorOptions", async () => {
    class Strict extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: { strict: true } });
      }
    }
    await expect(new Strict({}).isValid()).rejects.toThrow(StrictValidationFailed);
  });
});
