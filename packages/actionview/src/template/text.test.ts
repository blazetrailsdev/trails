import { describe, it, expect } from "vitest";

import { Text } from "./text.js";

describe("TextTest", () => {
  it("format always return :text", () => {
    expect(new Text("").format()).toBe("text");
  });

  it("identifier should return 'text template'", () => {
    expect(new Text("").identifier()).toBe("text template");
  });

  it("inspect should return 'text template'", () => {
    expect(new Text("").inspect()).toBe("text template");
  });

  it("to_str should return a given string", () => {
    expect(new Text("a cat").toString()).toBe("a cat");
  });

  it("render should return a given string", () => {
    expect(new Text("a dog").render()).toBe("a dog");
  });
});
