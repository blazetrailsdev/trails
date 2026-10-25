import { RuntimeError } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { checkForNameCollision } from "./xchar.js";

describe("TestNameCollisions", () => {
  class Collide {
    xchr(): void {}
  }

  it("no collision", () => {
    expect(() => checkForNameCollision(Collide, ":not_defined")).not.toThrow();
  });

  it("collision", () => {
    expect(() => checkForNameCollision(Collide, "xchr")).toThrow(RuntimeError);
  });

  it("collision with symbol", () => {
    expect(() => checkForNameCollision(Collide, ":xchr")).toThrow(RuntimeError);
  });
});
