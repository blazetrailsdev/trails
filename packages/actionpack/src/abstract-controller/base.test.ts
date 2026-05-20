import { describe, it, expect } from "vitest";
import { AbstractController, ActionNotFound } from "./base.js";

describe("ActionNotFound#corrections", () => {
  it("test_exceptions_have_suggestions_for_fix", () => {
    class SimpleController extends AbstractController {
      hello(): void {}
      goodbye(): void {}
    }
    const controller = new SimpleController();
    const error = new ActionNotFound(
      "The action 'ello' could not be found for SimpleController",
      controller,
      "ello",
    );
    expect(error.corrections).toEqual(["hello"]);
  });

  it("returns [] when no controller or action context is attached", () => {
    expect(new ActionNotFound("bare").corrections).toEqual([]);
  });

  it("returns [] when no action method comes close", () => {
    class C extends AbstractController {
      destroy(): void {}
    }
    const error = new ActionNotFound("missing", new C(), "wildlyDifferent");
    expect(error.corrections).toEqual([]);
  });
});
