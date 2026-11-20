import { describe, it, expect } from "vitest";
import { Rescuable } from "../lib/rescuable.js";

class ErrorA extends Error {}
class ErrorB extends Error {}

function host() {
  return class {
    static rescueHandlers: unknown[][] = [];
    static rescueFrom = Rescuable.ClassMethods.rescueFrom;
  };
}

describe("rescueFrom with a plain function as its block", () => {
  it("registers a function expression as the handler", () => {
    const Host = host();
    const handler = function () {
      return "down";
    };
    Host.rescueFrom(ErrorA, handler);
    expect(Host.rescueHandlers).toEqual([[ErrorA, handler]]);
  });

  it("registers an arrow function as the handler", () => {
    const Host = host();
    const handler = () => "down";
    Host.rescueFrom(ErrorA, handler);
    expect(Host.rescueHandlers).toEqual([[ErrorA, handler]]);
  });

  it("does not take a trailing class for a block", () => {
    const Host = host();
    Host.rescueFrom(ErrorA, ErrorB, { with: "handler" });
    expect(Host.rescueHandlers).toEqual([
      [ErrorA, "handler"],
      [ErrorB, "handler"],
    ]);
    expect(() => Host.rescueFrom(ErrorA, ErrorB)).toThrow(/Need a handler/);
  });
});
