import { describe, it, expect, afterEach } from "vitest";
import {
  assert,
  assertEmpty,
  assertNot,
  assertNotEmpty,
  assertNothingRaised,
  assertNotPredicate,
  assertPredicate,
  assertRaises,
} from "@blazetrails/activesupport";
import {
  ArgumentError,
  LengthValidator,
  Model,
  NoMethodError,
  PresenceValidator,
  StrictValidationFailed,
  ValidationError,
  Validator,
} from "./index.js";
import type { ConditionalOptions } from "./validations.js";
import { FormatValidator } from "./validations/format.js";

class Topic extends Model {
  static {
    this.attribute("title", "string");
    this.attribute("author_name", "string");
    this.attribute("content", "string");
    this.afterValidation((t: Topic) => t.performAfterValidation());
  }

  declare title: string | null;
  declare author_name: string | null;
  declare content: string | null;

  afterValidationPerformed = false;

  performAfterValidation(): void {
    this.afterValidationPerformed = true;
  }
}

class Reply extends Topic {
  static {
    this.validate("errorsOnEmptyContent");
    this.validate("titleIsWrongCreate", { on: "create" });

    this.validate("checkEmptyTitle");
    this.validate("checkContentMismatch", { on: "create" });
    this.validate("checkWrongUpdate", { on: "update" });
  }

  checkEmptyTitle(): void {
    if (!(this.title != null && this.title.length > 0)) this.errors.add("title", "is Empty");
  }

  errorsOnEmptyContent(): void {
    if (!(this.content != null && this.content.length > 0)) this.errors.add("content", "is Empty");
  }

  checkContentMismatch(): void {
    if (this.title != null && this.content != null && this.content === "Mismatch") {
      this.errors.add("title", "is Content Mismatch");
    }
  }

  titleIsWrongCreate(): void {
    if (this.title != null && this.title === "Wrong Create")
      this.errors.add("title", "is Wrong Create");
  }

  checkWrongUpdate(): void {
    if (this.title != null && this.title === "Wrong Update")
      this.errors.add("title", "is Wrong Update");
  }
}

class Person extends Model {
  static {
    this.attribute("title", "string");
  }
}

class CustomReader extends Model {
  data: Record<string, unknown>;

  constructor(data: Record<string, unknown> = {}) {
    super();
    this.data = data;
  }

  override readAttributeForValidation(key: string): unknown {
    return this.data[key];
  }
}

describe("ValidationsTest", () => {
  afterEach(() => {
    Topic.clearValidatorsBang();
    Person.clearValidatorsBang();
  });

  it("single field validation", async () => {
    const r = new Reply();
    r.title = "There's no content!";
    assertPredicate(
      await r.isInvalid(),
      (invalid) => invalid,
      "A reply without content should be invalid",
    );
    assert(r.afterValidationPerformed, "after_validation callback should be called");

    r.content = "Messa content!";
    assertPredicate(await r.isValid(), (valid) => valid, "A reply with content should be valid");
    assert(r.afterValidationPerformed, "after_validation callback should be called");
  });

  it("single attr validation and error msg", async () => {
    const r = new Reply();
    r.title = "There's no content!";
    assertPredicate(await r.isInvalid(), (invalid) => invalid);
    assertPredicate(
      r.errors.messagesFor("content"),
      (messages) => messages.length > 0,
      "A reply without content should mark that attribute as invalid",
    );
    expect(r.errors.messagesFor("content")).toEqual(["is Empty"]);
    expect(r.errors.count).toBe(1);
  });

  it("double attr validation and error msg", async () => {
    const r = new Reply();
    assertPredicate(await r.isInvalid(), (invalid) => invalid);

    assertPredicate(
      r.errors.messagesFor("title"),
      (messages) => messages.length > 0,
      "A reply without title should mark that attribute as invalid",
    );
    expect(r.errors.messagesFor("title")).toEqual(["is Empty"]);

    assertPredicate(
      r.errors.messagesFor("content"),
      (messages) => messages.length > 0,
      "A reply without content should mark that attribute as invalid",
    );
    expect(r.errors.messagesFor("content")).toEqual(["is Empty"]);

    expect(r.errors.count).toBe(2);
  });

  it("multiple errors per attr iteration with full error composition", async () => {
    const r = new Reply();
    r.title = "";
    r.content = "";
    await r.isValid();

    const errors = r.errors.toArray();

    expect(errors[0]).toBe("Content is Empty");
    expect(errors[1]).toBe("Title is Empty");
    expect(r.errors.count).toBe(2);
  });

  it("errors on nested attributes expands name", () => {
    const t = new Topic();
    t.errors.add("replies.name", "can't be blank");
    expect(t.errors.fullMessages).toEqual(["Replies name can't be blank"]);
  });

  it("errors on base", async () => {
    const r = new Reply();
    r.content = "Mismatch";
    await r.isValid();
    r.errors.add("base", "Reply is not dignifying");

    const errors = r.errors.toArray().reduce<string[]>((result, error) => [...result, error], []);

    expect(r.errors.messagesFor("base")).toEqual(["Reply is not dignifying"]);

    expect(errors).toContain("Title is Empty");
    expect(errors).toContain("Reply is not dignifying");
    expect(r.errors.count).toBe(2);
  });

  it("errors on base with symbol message", async () => {
    const r = new Reply();
    r.content = "Mismatch";
    await r.isValid();
    r.errors.add("base", ":invalid");

    const errors = r.errors.toArray().reduce<string[]>((result, error) => [...result, error], []);

    expect(r.errors.messagesFor("base")).toEqual(["is invalid"]);

    expect(errors).toContain("Title is Empty");
    expect(errors).toContain("is invalid");

    expect(r.errors.count).toBe(2);
  });

  it("errors empty after errors on check", () => {
    const t = new Topic();
    assertEmpty(t.errors.messagesFor("id"));
    assertEmpty(t.errors);
  });

  it("validates each", async () => {
    let hits = 0;
    Topic.validatesEach(["title", "content", ["title", "content"]], (record, attr) => {
      record.errors.add(attr, "gotcha");
      hits += 1;
    });
    const t = new Topic({ title: "valid", content: "whatever" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    expect(hits).toBe(4);
    expect(t.errors.messagesFor("title")).toEqual(["gotcha", "gotcha"]);
    expect(t.errors.messagesFor("content")).toEqual(["gotcha", "gotcha"]);
  });

  it("validates each custom reader", async () => {
    let hits = 0;
    try {
      CustomReader.validatesEach(["title", "content", ["title", "content"]], (record, attr) => {
        record.errors.add(attr, "gotcha");
        hits += 1;
      });
      const t = new CustomReader({ title: "valid", content: "whatever" });
      assertPredicate(await t.isInvalid(), (invalid) => invalid);
      expect(hits).toBe(4);
      expect(t.errors.messagesFor("title")).toEqual(["gotcha", "gotcha"]);
      expect(t.errors.messagesFor("content")).toEqual(["gotcha", "gotcha"]);
    } finally {
      CustomReader.clearValidatorsBang();
    }
  });

  it("validate block", async () => {
    Topic.validate(function (this: Topic) {
      this.errors.add("title", "will never be valid");
    });
    const t = new Topic({ title: "Title", content: "whatever" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (messages) => messages.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["will never be valid"]);
  });

  it("validate block with params", async () => {
    Topic.validate((topic: Topic) => {
      topic.errors.add("title", "will never be valid");
    });
    const t = new Topic({ title: "Title", content: "whatever" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (messages) => messages.length > 0);
    expect(t.errors.messagesFor("title")).toEqual(["will never be valid"]);
  });

  it("invalid should be the opposite of valid", async () => {
    Topic.validatesPresenceOf("title");

    const t = new Topic();
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    assertPredicate(t.errors.messagesFor("title"), (messages) => messages.length > 0);

    t.title = "Things are going to change";
    assertNotPredicate(await t.isInvalid(), (invalid) => invalid);
  });

  it("validation order", async () => {
    Topic.validatesPresenceOf("title");
    Topic.validatesLengthOf("title", { minimum: 2 });

    let t = new Topic({ title: "" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    expect(t.errors.messagesFor("title")[0]).toEqual("can't be blank");
    Topic.validatesPresenceOf("title", "author_name");
    Topic.validate(function (this: Topic) {
      this.errors.add("author_email_address", "will never be valid");
    });
    Topic.validatesLengthOf("title", "content", { minimum: 2 });

    t = new Topic({ title: "" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);

    let key: string;
    expect((key = t.errors.attributeNames[0])).toEqual("title");
    expect(t.errors.messagesFor(key)[0]).toEqual("can't be blank");
    expect(t.errors.messagesFor(key)[1]).toEqual("is too short (minimum is 2 characters)");
    expect((key = t.errors.attributeNames[1])).toEqual("author_name");
    expect(t.errors.messagesFor(key)[0]).toEqual("can't be blank");
    expect((key = t.errors.attributeNames[2])).toEqual("author_email_address");
    expect(t.errors.messagesFor(key)[0]).toEqual("will never be valid");
    expect((key = t.errors.attributeNames[3])).toEqual("content");
    expect(t.errors.messagesFor(key)[0]).toEqual("is too short (minimum is 2 characters)");
  });

  it("validation with if and on", async () => {
    Topic.validatesPresenceOf("title", {
      if: (x: Topic) => {
        x.author_name = "bad";
        return true;
      },
      on: "update",
    });

    const t = new Topic({ title: "" });

    assertPredicate(await t.isValid(), (valid) => valid);
    assertPredicate(t.author_name, (authorName) => authorName == null);

    assert(await t.isInvalid("update"));
    assert(t.author_name === "bad");
  });

  it("strict validation in validates", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true, strict: true });
      }
    }
    await expect(new Person({}).isValid()).rejects.toThrow();
  });

  it("strict validation not fails", async () => {
    Topic.validates("title", { strict: true, presence: true });
    assertPredicate(await new Topic({ title: "hello" }).isValid(), (valid) => valid);
  });

  it("list of validators for model", () => {
    Topic.validatesPresenceOf("title");
    Topic.validatesLengthOf("title", { minimum: 2 });

    expect(Topic.validators().length).toBe(2);
    expect(Topic.validators().map((v) => (v as Validator).kind)).toEqual(["presence", "length"]);
  });

  it("list of validators on an attribute", () => {
    Topic.validatesPresenceOf("title", "content");
    Topic.validatesLengthOf("title", { minimum: 2 });

    expect(Topic.validatorsOn("title").length).toBe(2);
    expect(Topic.validatorsOn("title").map((v) => (v as Validator).kind)).toEqual([
      "presence",
      "length",
    ]);
    expect(Topic.validatorsOn("content").length).toBe(1);
    expect(Topic.validatorsOn("content").map((v) => (v as Validator).kind)).toEqual(["presence"]);
  });

  it("list of validators will be empty when empty", () => {
    Topic.validates("title", { length: { minimum: 10 } });
    expect(Topic.validatorsOn("author_name")).toEqual([]);
  });

  it("validate with bang", async () => {
    Topic.validates("title", { presence: true });

    await assertRaises([ValidationError], {}, async () => {
      await new Topic().validateBang();
    });
  });

  it("errors to json", async () => {
    Topic.validatesPresenceOf(["title", "content"]);
    const t = new Topic();
    assertPredicate(await t.isInvalid(), (invalid) => invalid);

    const hash: Record<string, string[]> = {};
    hash.title = ["can't be blank"];
    hash.content = ["can't be blank"];
    expect(JSON.stringify(t.errors.asJson())).toEqual(JSON.stringify(hash));
  });

  it("does not modify options argument", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const opts = { presence: true };
    Person.validates("name", opts);
    expect(opts).toEqual({ presence: true });
  });

  it("validates with false hash value", async () => {
    Topic.validates("title", { presence: false });
    assertPredicate(await new Topic().isValid(), (valid) => valid);
  });

  it("validates with bang", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true });
      }
    }
    const p = new Person();
    await expect(p.validateBang()).rejects.toThrow(/Validation failed/);
  });

  it("validate with bang and context", async () => {
    Topic.validates("title", { presence: true, on: "context" });

    await assertRaises([ValidationError], {}, async () => {
      await new Topic().validateBang("context");
    });

    const t = new Topic({ title: "Valid title" });
    assert(await t.validateBang("context"));
  });

  it("strict validation error message", async () => {
    Topic.validates("title", { strict: true, presence: true });

    const exception = await assertRaises([StrictValidationFailed], {}, async () => {
      await new Topic().isValid();
    });
    expect(exception.message).toEqual("Title can't be blank");
  });

  it("validation with message as proc that takes a record as a parameter", async () => {
    Topic.validatesPresenceOf("title", {
      message: (record: Topic) => `You have failed me for the last time, ${record.author_name}.`,
    });

    const t = new Topic({ author_name: "Admiral" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    expect(t.errors.messagesFor("title")).toEqual([
      "You have failed me for the last time, Admiral.",
    ]);
  });

  it("frozen models can be validated", async () => {
    Person.validates("title", { presence: true });
    const person = new Person().freeze();
    assertPredicate(person, (p) => Object.isFrozen(p));
    assertNot(await person.isValid());
  });

  it("dup validity is independent", async () => {
    Topic.validatesPresenceOf("title");
    const topic = new Topic({ title: "Literature" });
    await topic.isValid();

    const duped = topic.dup();
    duped.title = null;
    assertPredicate(await duped.isInvalid(), (invalid) => invalid);

    topic.title = null;
    duped.title = "Mathematics";
    assertPredicate(await topic.isInvalid(), (invalid) => invalid);
    assertPredicate(await duped.isValid(), (valid) => valid);
  });

  it("validates with array condition does not mutate the array", () => {
    const opts: Array<() => boolean> = [];
    Topic.validate(() => {}, { if: opts, on: "create" });
    assertEmpty(opts);
  });

  it("invalid validator", async () => {
    Topic.validate("iDontExist");
    await assertRaises([NoMethodError], {}, async () => {
      const t = new Topic();
      await t.isValid();
    });
  });

  it("invalid options to validate", async () => {
    const error = await assertRaises([ArgumentError], {}, () => {
      Topic.validate("title", { presence: true } as unknown as ConditionalOptions);
    });
    const message =
      "Unknown key: :presence. Valid keys are: :on, :if, :unless, :prepend, :exceptOn. Perhaps you meant to call `validates` instead of `validate`?";
    expect(error.message).toEqual(message);
  });

  it("callback options to validate", async () => {
    class Klass extends Topic {
      callSequence: string[] = [];

      private validatorA(): void {
        this.callSequence.push("a");
      }

      private validatorB(): void {
        this.callSequence.push("b");
      }

      private validatorC(): void {
        this.callSequence.push("c");
      }
    }

    await assertNothingRaised(() => {
      Klass.validate("validatorA", { if: () => true });
      Klass.validate("validatorB", { prepend: true });
      Klass.validate("validatorC", { unless: () => true });
    });

    const t = new Klass();

    assertPredicate(await t.isValid(), (valid) => valid);
    expect(t.callSequence).toEqual(["b", "a"]);
  });

  it("accessing instance of validator on an attribute", () => {
    Topic.validatesLengthOf("title", { minimum: 10 });
    expect((Topic.validatorsOn("title")[0] as Validator).options.minimum).toBe(10);
  });

  it("strict validation in custom validator helper", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true, strict: true });
      }
    }
    const p = new Person({});
    await expect(p.isValid()).rejects.toThrow();
  });

  it("validation with message as proc that takes record and data as a parameters", async () => {
    Topic.validatesPresenceOf("title", {
      message: (record: Topic, data: { attribute: string }) =>
        `${data.attribute} is missing. You have failed me for the last time, ${record.author_name}.`,
    });

    const t = new Topic({ author_name: "Admiral" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    expect(t.errors.messagesFor("title")).toEqual([
      "Title is missing. You have failed me for the last time, Admiral.",
    ]);
  });

  it("validations some with except", async () => {
    Topic.validates("title", {
      presence: { exceptOn: "custom_context" },
      length: { maximum: 10 },
    });

    await assertRaises([ValidationError], {}, async () => {
      await new Topic().validateBang();
    });

    await assertRaises([ValidationError], {}, async () => {
      await new Topic({ title: "A".repeat(11) }).validateBang("custom_context");
    });

    assert(await new Topic().validateBang("custom_context"));
  });

  it("validations on the instance level", async () => {
    Topic.validates("title", "author_name", { presence: true });
    Topic.validates("content", { length: { minimum: 10 } });

    const topic = new Topic();
    assertPredicate(await topic.isInvalid(), (invalid) => invalid);
    expect(topic.errors.size).toEqual(3);

    topic.title = "Some Title";
    topic.author_name = "Some Author";
    topic.content = "Some Content Whose Length is more than 10.";
    assertPredicate(await topic.isValid(), (valid) => valid);
  });

  it("validate with except on", async () => {
    Topic.validates("title", { presence: true, exceptOn: "custom_context" });

    const topic = new Topic();
    await topic.validate();

    expect(topic.errors.messagesFor("title")).toEqual(["can't be blank"]);

    assert(await topic.validate("custom_context"));
  });

  it("validation with message as proc", async () => {
    Topic.validatesPresenceOf("title", { message: () => "no blanks here".toUpperCase() });

    const t = new Topic();
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
    expect(t.errors.messagesFor("title")).toEqual(["NO BLANKS HERE"]);
  });

  it("list of validators on multiple attributes", () => {
    Topic.validates("title", { length: { minimum: 10 } });
    Topic.validates("author_name", { presence: true, format: { with: /a/ } });

    const validators = Topic.validatorsOn("title", "author_name");

    expect(validators.map((v) => v.constructor).sort((a, b) => (a.name < b.name ? -1 : 1))).toEqual(
      [FormatValidator, LengthValidator, PresenceValidator],
    );
  });

  it("validate", async () => {
    Topic.validate(async function (this: Topic) {
      await this.validatesPresenceOf("title", "author_name");
      await this.validatesLengthOf("content", { minimum: 10 });
    });

    const topic = new Topic();
    assertEmpty(topic.errors);

    await topic.validate();
    assertNotEmpty(topic.errors);
  });

  it("strict validation particular validator", async () => {
    class Topic extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { presence: true, strict: true });
      }
    }
    await expect(new Topic({}).isValid()).rejects.toThrow();
  });

  it("strict validation custom exception", async () => {
    class Topic extends Model {
      static {
        this.attribute("title", "string");
        this.validates("title", { presence: true, strict: true });
      }
    }
    await expect(new Topic({}).isValid()).rejects.toThrow(/title/i);
  });
});
