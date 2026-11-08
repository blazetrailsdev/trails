import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assertNot, assertNotPredicate, assertPredicate } from "@blazetrails/activesupport";
import { Person } from "../test-helpers/models/person.js";
import { Topic } from "../test-helpers/models/topic.js";
import { PersonWithValidator } from "../test-helpers/models/person-with-validator.js";
import "../test-helpers/validators/namespace/email-validator.js";
import { ArgumentError } from "../attribute-assignment.js";
import { Range } from "@blazetrails/ruby-compat";

describe("ValidatesTest", () => {
  const resetCallbacks = () => {
    Person.clearValidatorsBang();
    Topic.clearValidatorsBang();
    PersonWithValidator.clearValidatorsBang();
  };
  beforeEach(resetCallbacks);
  afterEach(resetCallbacks);

  it("validates with messages empty", async () => {
    Person.validates("title", { presence: { message: "" } });
    const person = new Person();
    assertNot(await person.isValid(), "person should not be valid.");
  });

  it("validates with built in validation", async () => {
    Person.validates("title", { numericality: true });
    const person = new Person();
    await person.isValid();
    expect(person.errors.messagesFor("title")).toEqual(["is not a number"]);
  });

  it("validates with attribute specified as string", async () => {
    Person.validates("title", { numericality: true });
    let person = new Person();
    await person.isValid();
    expect(person.errors.messagesFor("title")).toEqual(["is not a number"]);

    person = new Person();
    (person as { title: unknown }).title = 123;
    assertPredicate(await person.isValid(), (valid) => valid);
  });

  it("validates with built in validation and options", async () => {
    Person.validates("salary", { numericality: { message: "my custom message" } });
    const person = new Person();
    await person.isValid();
    expect(person.errors.messagesFor("salary")).toEqual(["my custom message"]);
  });

  it("validates with validator class", async () => {
    Person.validates("karma", { email: true });
    const person = new Person();
    await person.isValid();
    expect(person.errors.messagesFor("karma")).toEqual(["is not an email"]);
  });

  it("validates with namespaced validator class", async () => {
    Person.validates("karma", { "namespace/email": true });
    const person = new Person();
    await person.isValid();
    expect(person.errors.messagesFor("karma")).toEqual(["is not an email"]);
  });

  it("validates with if as local conditions", async () => {
    Person.validates("karma", { presence: true, email: { if: ":conditionIsFalse" } });
    const person = new Person();
    await person.isValid();
    expect(person.errors.messagesFor("karma")).toEqual(["can't be blank"]);
  });

  it("validates with if as shared conditions", async () => {
    Person.validates("karma", { presence: true, email: true, if: ":conditionIsFalse" });
    const person = new Person();
    assertPredicate(await person.isValid(), (valid) => valid);
  });

  it("validates with unless as local conditions", async () => {
    Person.validates("karma", { presence: true, email: { unless: ":conditionIsTrue" } });
    const person = new Person();
    await person.isValid();
    expect(person.errors.messagesFor("karma")).toEqual(["can't be blank"]);
  });

  it("validates with unless shared conditions", async () => {
    Person.validates("karma", { presence: true, email: true, unless: ":conditionIsTrue" });
    const person = new Person();
    assertPredicate(await person.isValid(), (valid) => valid);
  });

  it("validates with allow nil shared conditions", async () => {
    Person.validates("karma", { length: { minimum: 20 }, email: true, allowNil: true });
    const person = new Person();
    assertPredicate(await person.isValid(), (valid) => valid);
  });

  it("validates with regexp", async () => {
    Person.validates("karma", { format: /positive|negative/ });
    const person = new Person();
    assertPredicate(await person.isInvalid(), (invalid) => invalid);
    expect(person.errors.messagesFor("karma")).toEqual(["is invalid"]);
    person.karma = "positive";
    assertPredicate(await person.isValid(), (valid) => valid);
  });

  it("validates with array", async () => {
    Person.validates("gender", { inclusion: ["m", "f"] });
    const person = new Person();
    assertPredicate(await person.isInvalid(), (invalid) => invalid);
    expect(person.errors.messagesFor("gender")).toEqual(["is not included in the list"]);
    person.gender = "m";
    assertPredicate(await person.isValid(), (valid) => valid);
  });

  it("validates with range", async () => {
    Person.validates("karma", { length: new Range(6, 20) });
    const person = new Person();
    assertPredicate(await person.isInvalid(), (invalid) => invalid);
    expect(person.errors.messagesFor("karma")).toEqual(["is too short (minimum is 6 characters)"]);
    person.karma = "something";
    assertPredicate(await person.isValid(), (valid) => valid);
  });

  it("validates with validator class and options", async () => {
    Person.validates("karma", { email: { message: "my custom message" } });
    const person = new Person();
    await person.isValid();
    expect(person.errors.messagesFor("karma")).toEqual(["my custom message"]);
  });

  it("validates with unknown validator", () => {
    expect(() => Person.validates("karma", { unknown: true })).toThrow(ArgumentError);
  });

  it("validates with disabled unknown validator", () => {
    expect(() => Person.validates("karma", { unknown: false })).toThrow(ArgumentError);
  });

  it("validates with included validator", async () => {
    PersonWithValidator.validates("title", { presence: true });
    const person = new PersonWithValidator();
    await person.isValid();
    expect(person.errors.messagesFor("title")).toEqual(["Local validator"]);
  });

  it("validates with included validator and options", async () => {
    PersonWithValidator.validates("title", { presence: { custom: " please" } });
    const person = new PersonWithValidator();
    await person.isValid();
    expect(person.errors.messagesFor("title")).toEqual(["Local validator please"]);
  });

  it("validates with included validator and wildcard shortcut", async () => {
    PersonWithValidator.validates("title", { like: "Mr." });
    const person = new PersonWithValidator();
    person.title = "Ms. Pacman";
    await person.isValid();
    expect(person.errors.messagesFor("title")).toEqual(["does not appear to be like Mr."]);
  });

  it("defining extra default keys for validates", async () => {
    Topic.validates("title", { confirmation: true, message: "Y U NO CONFIRM" });
    const topic = new Topic();
    topic.title = "What's happening";
    (topic as unknown as { titleConfirmation: string }).titleConfirmation = "Not this";
    assertNotPredicate(await topic.isValid(), (valid) => valid);
    expect(topic.errors.messagesFor("titleConfirmation")).toEqual(["Y U NO CONFIRM"]);
  });
});
