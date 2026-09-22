import { describe, it, expect, vi, afterEach } from "vitest";
import {
  assert,
  assertEmpty,
  assertIncludes,
  assertNotPredicate,
  assertPredicate,
  assertRaise,
} from "@blazetrails/activesupport";
import { Errors } from "../index.js";
import { WithValidator } from "./with.js";
import { EachValidator, Validator } from "../validator.js";
import { ArgumentError } from "../attribute-assignment.js";
import { Topic } from "../test-helpers/models/topic.js";

describe("ValidatesWithTest", () => {
  afterEach(() => {
    Topic.clearValidatorsBang();
  });

  const ERROR_MESSAGE = "Validation error from validator";
  const OTHER_ERROR_MESSAGE = "Validation error from other validator";

  class ValidatorThatAddsErrors extends Validator {
    validate(record: Topic): void {
      record.errors.add("base", ":invalid", { message: ERROR_MESSAGE });
    }
  }

  class OtherValidatorThatAddsErrors extends Validator {
    validate(record: Topic): void {
      record.errors.add("base", ":invalid", { message: OTHER_ERROR_MESSAGE });
    }
  }

  class ValidatorThatDoesNotAddErrors extends Validator {
    validate(_record: Topic): void {}
  }

  class ValidatorThatClearsOptions extends ValidatorThatDoesNotAddErrors {
    constructor(options: Record<string, unknown>) {
      super(options);
      for (const key of Object.keys(options)) delete options[key];
    }
  }

  class ValidatorThatValidatesOptions extends Validator {
    validate(record: Topic): void {
      if (this.options.field === ":firstName") {
        record.errors.add("base", ":invalid", { message: ERROR_MESSAGE });
      }
    }
  }

  class ValidatorPerEachAttribute extends EachValidator {
    validateEach(record: Topic, attribute: string, value: unknown): void {
      record.errors.add(attribute, ":invalid", { message: `Value is ${value ?? ""}` });
    }
  }

  class ValidatorCheckValidity extends EachValidator {
    checkValidityBang(): void {
      throw new Error("boom!");
    }
  }

  it("validation with class that adds errors", async () => {
    Topic.validatesWith(ValidatorThatAddsErrors);
    const topic = new Topic();
    assertPredicate(
      await topic.isInvalid(),
      (v) => v,
      "A class that adds errors causes the record to be invalid",
    );
    assertIncludes(topic.errors.get("base"), ERROR_MESSAGE);
  });

  it("with a class that returns valid", async () => {
    Topic.validatesWith(ValidatorThatDoesNotAddErrors);
    const topic = new Topic();
    assertPredicate(
      await topic.isValid(),
      (v) => v,
      "A class that does not add errors does not cause the record to be invalid",
    );
  });

  it("with multiple classes", async () => {
    Topic.validatesWith(ValidatorThatAddsErrors, OtherValidatorThatAddsErrors);
    const topic = new Topic();
    assertPredicate(await topic.isInvalid(), (v) => v);
    assertIncludes(topic.errors.get("base"), ERROR_MESSAGE);
    assertIncludes(topic.errors.get("base"), OTHER_ERROR_MESSAGE);
  });

  it("passes all configuration options to the validator class", async () => {
    const topic = new Topic();
    const validate = vi.fn();
    const construct = vi.fn();
    class MockValidator {
      constructor(options: Record<string, unknown>) {
        construct(options);
      }
      validate(record: Topic): void {
        validate(record);
      }
    }

    Topic.validatesWith(MockValidator, { if: ":conditionIsTrue", foo: ":bar" });
    assertPredicate(await topic.isValid(), (v) => v);
    expect(construct).toHaveBeenCalledWith({ foo: ":bar", if: ":conditionIsTrue", class: Topic });
    expect(validate).toHaveBeenCalledWith(topic);
    expect(construct).toHaveBeenCalledTimes(1);
  });

  it("validates_with with options", async () => {
    Topic.validatesWith(ValidatorThatValidatesOptions, { field: ":firstName" });
    const topic = new Topic();
    assertPredicate(await topic.isInvalid(), (v) => v);
    assertIncludes(topic.errors.get("base"), ERROR_MESSAGE);
  });

  it("validates_with preserves standard options", async () => {
    Topic.validatesWith(ValidatorThatClearsOptions, ValidatorThatAddsErrors, {
      on: ":specificContext",
    });
    const topic = new Topic();
    assert(await topic.isInvalid(":specificContext"), "validation should work");
    assertPredicate(await topic.isValid(), (v) => v, "Standard options should be preserved");
  });

  it("validates_with preserves validator options", async () => {
    Topic.validatesWith(ValidatorThatClearsOptions, ValidatorThatValidatesOptions, {
      field: ":firstName",
    });
    const topic = new Topic();
    assertPredicate(await topic.isInvalid(), (v) => v, "Validator options should be preserved");
  });

  it("instance validates_with method preserves validator options", async () => {
    const topic = new Topic();
    await topic.validatesWith(ValidatorThatClearsOptions, ValidatorThatValidatesOptions, {
      field: ":firstName",
    });
    assertIncludes(
      topic.errors.get("base"),
      ERROR_MESSAGE,
      "Validator options should be preserved",
    );
  });

  it("validates_with each validator", async () => {
    Topic.validatesWith(ValidatorPerEachAttribute, { attributes: ["title", "content"] });
    const topic = new Topic({ title: "Title", content: "Content" });
    assertPredicate(await topic.isInvalid(), (v) => v);
    expect(topic.errors.get("title")).toEqual(["Value is Title"]);
    expect(topic.errors.get("content")).toEqual(["Value is Content"]);
  });

  it("each validator checks validity", async () => {
    await assertRaise([Error], {}, () =>
      Topic.validatesWith(ValidatorCheckValidity, { attributes: ["title"] }),
    );
  });

  it("each validator expects attributes to be given", async () => {
    await assertRaise([ArgumentError], {}, () => Topic.validatesWith(ValidatorPerEachAttribute));
  });

  it("each validator skip nil values if :allow_nil is set to true", async () => {
    Topic.validatesWith(ValidatorPerEachAttribute, {
      attributes: ["title", "content"],
      allowNil: true,
    });
    const topic = new Topic({ content: "" });
    assertPredicate(await topic.isInvalid(), (v) => v);
    assertEmpty(topic.errors.get("title"));
    expect(topic.errors.get("content")).toEqual(["Value is "]);
  });

  it("each validator skip blank values if :allow_blank is set to true", async () => {
    Topic.validatesWith(ValidatorPerEachAttribute, {
      attributes: ["title", "content"],
      allowBlank: true,
    });
    const topic = new Topic({ content: "" });
    assertPredicate(await topic.isValid(), (v) => v);
    assertEmpty(topic.errors.get("title"));
    assertEmpty(topic.errors.get("content"));
  });

  it("validates_with can validate with an instance method", async () => {
    Topic.validates("title", { with: ":myValidation" });

    let topic = new Topic({ title: "foo" });
    assertPredicate(await topic.isValid(), (v) => v);
    assertEmpty(topic.errors.get("title"));

    topic = new Topic();
    assertNotPredicate(await topic.isValid(), (v) => v);
    expect(topic.errors.get("title")).toEqual(["is missing"]);
  });

  it("optionally pass in the attribute being validated when validating with an instance method", async () => {
    Topic.validates("title", "content", { with: ":myValidationWithArg" });

    const topic = new Topic({ title: "foo" });
    assertNotPredicate(await topic.isValid(), (v) => v);
    assertEmpty(topic.errors.get("title"));
    expect(topic.errors.get("content")).toEqual(["is missing"]);
  });
});

describe("WithValidator arity dispatch", () => {
  it("calls zero-arity method without arguments", () => {
    const spy = vi.fn();
    const record = { myCheck: spy, errors: new Errors(null) };
    const validator = new WithValidator({ attributes: ["name"], with: "myCheck" });
    validator.validateEach(record, "name", "value");
    expect(spy).toHaveBeenCalledWith();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("calls one-arity method with attribute name", () => {
    let capturedArg: unknown;
    const record = {
      myCheck(attr: string) {
        capturedArg = attr;
      },
      errors: new Errors(null),
    };
    const validator = new WithValidator({ attributes: ["name"], with: "myCheck" });
    validator.validateEach(record, "name", "value");
    expect(capturedArg).toBe("name");
  });

  it("known divergence: rest-param method called without args (JS length 0 vs Ruby arity -1)", () => {
    const received: unknown[] = [];
    const record = {
      myCheck(...args: unknown[]) {
        received.push(...args);
      },
      errors: new Errors(null),
    };
    const validator = new WithValidator({ attributes: ["name"], with: "myCheck" });
    validator.validateEach(record, "name", "value");
    expect(received).toHaveLength(0);
  });

  it("known divergence: default-param method called without args (JS length 0 vs Ruby arity -1)", () => {
    let capturedArg: unknown = "not-called";
    const record = {
      myCheck(attr: string = "") {
        capturedArg = attr;
      },
      errors: new Errors(null),
    };
    const validator = new WithValidator({ attributes: ["name"], with: "myCheck" });
    validator.validateEach(record, "name", "value");
    expect(capturedArg).toBe("");
  });
});
