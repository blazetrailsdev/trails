/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side. */
import { describe, it, expect, afterEach } from "vitest";
import { assertPredicate, include } from "@blazetrails/activesupport";
import { Model } from "../index.js";
import { Attributes, type AttributesClassHalf } from "../attributes.js";

class Topic extends Model {
  declare content: string | null;
  declare title: string | null;
  declare static attribute: AttributesClassHalf["attribute"];

  static {
    include(this, Attributes);
    this.attribute("title", "string");
    this.attribute("content", "string");
  }
}
interface Topic extends Attributes {}

class Person extends Model {
  declare karma: string | null;
  declare static attribute: AttributesClassHalf["attribute"];

  static {
    include(this, Attributes);
    this.attribute("karma", "string");
  }
}
interface Person extends Attributes {}

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
    expect(t.errors.messagesFor("title")).toEqual(["must be blank"]);
    expect(t.errors.messagesFor("content")).toEqual(["must be blank"]);
    t.title = "";
    t.content = "something";
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    expect(t.errors.messagesFor("content")).toEqual(["must be blank"]);
    expect(t.errors.messagesFor("title")).toEqual([]);
    t.content = "";
    assertPredicate(await t.isValid(), (valid) => valid);
  });

  it("validates absence of with array arguments", async () => {
    Topic.validatesAbsenceOf(["title", "content"]);
    const t = new Topic();
    t.title = "foo";
    t.content = "bar";
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    expect(t.errors.messagesFor("title")).toEqual(["must be blank"]);
    expect(t.errors.messagesFor("content")).toEqual(["must be blank"]);
  });

  it("validates absence of with custom error using quotes", async () => {
    Person.validatesAbsenceOf("karma", {
      message: "This string contains 'single' and \"double\" quotes",
    });
    const p = new Person();
    p.karma = "good";
    assertPredicate(await p.isInvalid(), (invalid) => invalid);
    expect(p.errors.messagesFor("karma").at(-1)).toEqual(
      "This string contains 'single' and \"double\" quotes",
    );
  });

  it("validates absence of for ruby class", async () => {
    Person.validatesAbsenceOf("karma");
    const p = new Person();
    p.karma = "good";
    assertPredicate(await p.isInvalid(), (invalid) => invalid);
    expect(p.errors.messagesFor("karma")).toEqual(["must be blank"]);
    p.karma = null;
    assertPredicate(await p.isValid(), (valid) => valid);
  });

  it("validates absence of for ruby class with custom reader", async () => {
    CustomReader.validatesAbsenceOf("karma");
    const p = new CustomReader();
    p.data["karma"] = "excellent";
    assertPredicate(await p.isInvalid(), (invalid) => invalid);
    expect(p.errors.messagesFor("karma")).toEqual(["must be blank"]);
    p.data["karma"] = "";
    assertPredicate(await p.isValid(), (valid) => valid);
  });

  it("passes custom interpolation vars through to errors.add", async () => {
    class Interpolated extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validates("name", { absence: { message: "must be %{kind}", kind: "empty" } });
      }
    }
    interface Interpolated extends Attributes {}

    const p = new Interpolated({ name: "Alice" });
    await p.isValid();
    expect(p.errors.messagesFor("name")).toContain("must be empty");
  });
});
