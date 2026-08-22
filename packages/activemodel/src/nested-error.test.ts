import { describe, it, expect } from "vitest";
import { Model, NestedError } from "./index.js";
import { Error as ActiveModelError } from "./error.js";

class Topic extends Model {
  static {
    this.attribute("title", "string");
    this.attribute("author_name", "string");
  }
}

class Reply extends Topic {}

describe("NestedErrorTest", () => {
  it("initialize", () => {
    const topic = new Topic({});
    const innerError = new ActiveModelError(topic, "title", ":not_enough", { count: 2 });
    const reply = new Reply({});
    const error = new NestedError(reply, innerError);

    expect(error.base).toEqual(reply);
    expect(error.attribute).toEqual(innerError.attribute);
    expect(error.type).toEqual(innerError.type);
    expect(error.options).toEqual(innerError.options);
  });

  it("initialize with overriding attribute and type", () => {
    const topic = new Topic({});
    const innerError = new ActiveModelError(topic, "title", ":not_enough", { count: 2 });
    const reply = new Reply({});
    const error = new NestedError(reply, innerError, { attribute: "parent", type: ":foo" });

    expect(error.base).toEqual(reply);
    expect(error.attribute).toEqual("parent");
    expect(error.type).toEqual(":foo");
    expect(error.options).toEqual(innerError.options);
  });

  it("message", () => {
    const topic = new Topic({ author_name: "Bruce" });
    const innerError = new ActiveModelError(topic, "title", ":not_enough", {
      message: (model: Topic) => `not good enough for ${model._readAttribute("author_name")}`,
    });
    const reply = new Reply({ author_name: "Mark" });
    const error = new NestedError(reply, innerError);

    expect(error.message).toEqual("not good enough for Bruce");
  });

  it("full message", () => {
    const topic = new Topic({ author_name: "Bruce" });
    const innerError = new ActiveModelError(topic, "title", ":not_enough", {
      message: (model: Topic) => `not good enough for ${model._readAttribute("author_name")}`,
    });
    const reply = new Reply({ author_name: "Mark" });
    const error = new NestedError(reply, innerError);

    expect(error.fullMessage).toEqual("Title not good enough for Bruce");
  });
});
