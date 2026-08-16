import { describe, it, expect, afterEach } from "vitest";
import { assertPredicate } from "@blazetrails/activesupport";
import { Model } from "../index.js";

// Mirrors: activemodel/test/models/topic.rb — the subset this file exercises.
class Topic extends Model {
  static {
    this.attribute("title", "string");
    this.attribute("content", "string");
  }
}

// Mirrors: activemodel/test/models/person.rb — the subset this file exercises.
class Person extends Model {
  static {
    this.attribute("karma", "string");
  }
}

// Mirrors: activemodel/test/models/custom_reader.rb
class CustomReader extends Model {
  data: Record<string, unknown> = {};

  override readAttributeForValidation(attribute: string): unknown {
    return this.data[attribute];
  }
}

describe("AbsenceValidationTest", () => {
  afterEach(() => {
    Topic.clearValidatorsBang();
    Person.clearValidatorsBang();
    CustomReader.clearValidatorsBang();
  });

  it("validates absence of", async () => {
    Topic.validatesAbsenceOf("title", "content");
    const t = new Topic();
    t.title = "foo";
    t.content = "bar";
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    expect(t.errors.get("title")).toEqual(["must be blank"]);
    expect(t.errors.get("content")).toEqual(["must be blank"]);
    t.title = "";
    t.content = "something";
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    expect(t.errors.get("content")).toEqual(["must be blank"]);
    expect(t.errors.get("title")).toEqual([]);
    t.content = "";
    assertPredicate(await t.isValid(), (valid) => valid);
  });

  it("validates absence of with array arguments", async () => {
    Topic.validatesAbsenceOf(["title", "content"]);
    const t = new Topic();
    t.title = "foo";
    t.content = "bar";
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    expect(t.errors.get("title")).toEqual(["must be blank"]);
    expect(t.errors.get("content")).toEqual(["must be blank"]);
  });

  it("validates absence of with custom error using quotes", async () => {
    Person.validatesAbsenceOf("karma", {
      message: "This string contains 'single' and \"double\" quotes",
    });
    const p = new Person();
    p.karma = "good";
    assertPredicate(await p.isInvalid(), (invalid) => invalid);
    expect(p.errors.get("karma").at(-1)).toEqual(
      "This string contains 'single' and \"double\" quotes",
    );
  });

  it("validates absence of for ruby class", async () => {
    Person.validatesAbsenceOf("karma");
    const p = new Person();
    p.karma = "good";
    assertPredicate(await p.isInvalid(), (invalid) => invalid);
    expect(p.errors.get("karma")).toEqual(["must be blank"]);
    p.karma = null;
    assertPredicate(await p.isValid(), (valid) => valid);
  });

  it("validates absence of for ruby class with custom reader", async () => {
    CustomReader.validatesAbsenceOf("karma");
    const p = new CustomReader();
    p.data["karma"] = "excellent";
    assertPredicate(await p.isInvalid(), (invalid) => invalid);
    expect(p.errors.get("karma")).toEqual(["must be blank"]);
    p.data["karma"] = "";
    assertPredicate(await p.isValid(), (valid) => valid);
  });

  it("passes custom interpolation vars through to errors.add", async () => {
    class Interpolated extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { absence: { message: "must be %{kind}", kind: "empty" } });
      }
    }
    const p = new Interpolated({ name: "Alice" });
    await p.isValid();
    expect(p.errors.get("name")).toContain("must be empty");
  });
});
