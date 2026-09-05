import { describe, it, expect } from "vitest";
import { NestedError } from "./index.js";
import { Error as ActiveModelError } from "./error.js";
import { Reply } from "./test-helpers/models/reply.js";
import { Topic } from "./test-helpers/models/topic.js";

describe("NestedErrorTest", () => {
  it("initialize", () => {
    const topic = new Topic();
    const innerError = new ActiveModelError(topic, "title", ":not_enough", { count: 2 });
    const reply = new Reply();
    const error = new NestedError(reply, innerError);

    expect(error.base).toEqual(reply);
    expect(error.attribute).toEqual(innerError.attribute);
    expect(error.type).toEqual(innerError.type);
    expect(error.options).toEqual(innerError.options);
  });

  it("initialize with overriding attribute and type", () => {
    const topic = new Topic();
    const innerError = new ActiveModelError(topic, "title", ":not_enough", { count: 2 });
    const reply = new Reply();
    const error = new NestedError(reply, innerError, { attribute: "parent", type: ":foo" });

    expect(error.base).toEqual(reply);
    expect(error.attribute).toEqual("parent");
    expect(error.type).toEqual(":foo");
    expect(error.options).toEqual(innerError.options);
  });

  it("message", () => {
    const topic = new Topic({ authorName: "Bruce" });
    const innerError = new ActiveModelError(topic, "title", ":not_enough", {
      message: (model: Topic) => `not good enough for ${model.authorName}`,
    });
    const reply = new Reply({ authorName: "Mark" });
    const error = new NestedError(reply, innerError);

    expect(error.message).toEqual("not good enough for Bruce");
  });

  it("full message", () => {
    const topic = new Topic({ authorName: "Bruce" });
    const innerError = new ActiveModelError(topic, "title", ":not_enough", {
      message: (model: Topic) => `not good enough for ${model.authorName}`,
    });
    const reply = new Reply({ authorName: "Mark" });
    const error = new NestedError(reply, innerError);

    expect(error.fullMessage).toEqual("Title not good enough for Bruce");
  });
});
