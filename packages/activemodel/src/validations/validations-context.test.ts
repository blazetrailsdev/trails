import { describe, it, expect, afterEach } from "vitest";
import { assertPredicate } from "@blazetrails/activesupport";
import { Model, Validator } from "../index.js";
import type { ValidatableRecord } from "../validator.js";

// Mirrors: activemodel/test/models/topic.rb — the subset this file exercises.
class Topic extends Model {
  static {
    this.attribute("title", "string");
  }
}

describe("ValidationsContextTest", () => {
  afterEach(() => {
    Topic.clearValidatorsBang();
  });

  const ERROR_MESSAGE = "Validation error from validator";
  const ANOTHER_ERROR_MESSAGE = "Another validation error from validator";

  class ValidatorThatAddsErrors extends Validator {
    validate(record: ValidatableRecord): void {
      record.errors.add("base", ERROR_MESSAGE);
    }
  }

  class AnotherValidatorThatAddsErrors extends Validator {
    validate(record: ValidatableRecord): void {
      record.errors.add("base", ANOTHER_ERROR_MESSAGE);
    }
  }

  it("with a class that adds errors on create and validating a new model with no arguments", async () => {
    Topic.validatesWith(ValidatorThatAddsErrors, { on: "create" });
    const topic = new Topic();
    assertPredicate(
      await topic.isValid(),
      (valid) => valid,
      "Validation doesn't run on valid? if 'on' is set to create",
    );
  });

  it("with a class that adds errors on update and validating a new model", async () => {
    Topic.validatesWith(ValidatorThatAddsErrors, { on: "update" });
    const topic = new Topic();
    expect(
      await topic.isValid("create"),
      "Validation doesn't run on create if 'on' is set to update",
    ).toBeTruthy();
  });

  it("with a class that adds errors on create and validating a new model", async () => {
    Topic.validatesWith(ValidatorThatAddsErrors, { on: "create" });
    const topic = new Topic();
    expect(
      await topic.isInvalid("create"),
      "Validation does run on create if 'on' is set to create",
    ).toBeTruthy();
    expect(topic.errors.get("base")).toContain(ERROR_MESSAGE);
  });

  it("with a class that adds errors on multiple contexts and validating a new model", async () => {
    Topic.validatesWith(ValidatorThatAddsErrors, { on: ["context1", "context2"] });

    const topic = new Topic();
    assertPredicate(
      await topic.isValid(),
      (valid) => valid,
      "Validation ran with no context given when 'on' is set to context1 and context2",
    );

    expect(
      await topic.isInvalid("context1"),
      "Validation did not run on context1 when 'on' is set to context1 and context2",
    ).toBeTruthy();
    expect(topic.errors.get("base")).toContain(ERROR_MESSAGE);

    expect(
      await topic.isInvalid("context2"),
      "Validation did not run on context2 when 'on' is set to context1 and context2",
    ).toBeTruthy();
    expect(topic.errors.get("base")).toContain(ERROR_MESSAGE);
  });

  it("with a class that validating a model for a multiple contexts", async () => {
    Topic.validatesWith(ValidatorThatAddsErrors, { on: "context1" });
    Topic.validatesWith(AnotherValidatorThatAddsErrors, { on: "context2" });

    const topic = new Topic();
    assertPredicate(
      await topic.isValid(),
      (valid) => valid,
      "Validation ran with no context given when 'on' is set to context1 and context2",
    );

    expect(
      await topic.isInvalid(["context1", "context2"]),
      "Validation did not run on context1 when 'on' is set to context1 and context2",
    ).toBeTruthy();
    expect(topic.errors.get("base")).toContain(ERROR_MESSAGE);
    expect(topic.errors.get("base")).toContain(ANOTHER_ERROR_MESSAGE);
  });
});
