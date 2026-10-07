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

describe("AbstractController::Base, an action is named by its method", () => {
  class StoriesController extends AbstractController {
    ran: string[] = [];
    nextBundle(): void {
      this.ran.push("nextBundle");
    }
    sekrit_data(): void {
      this.ran.push("sekrit_data");
    }
  }

  it("lists its actions under the names their methods are declared with", () => {
    expect([...StoriesController.actionMethods()].sort()).toEqual(["nextBundle", "sekrit_data"]);
  });

  it("dispatches an action by its method's name and records that name", async () => {
    const controller = new StoriesController();

    await controller.process("nextBundle");

    expect(controller.ran).toEqual(["nextBundle"]);
    expect(controller.actionName).toBe("nextBundle");
  });

  it("does not find a camelCase method under its underscored name", async () => {
    const controller = new StoriesController();

    await expect(controller.process("next_bundle")).rejects.toThrow(ActionNotFound);
    expect(controller.ran).toEqual([]);
  });

  it("does not find an underscored method under its camelCase name", async () => {
    const controller = new StoriesController();

    await controller.process("sekrit_data");
    await expect(controller.process("sekritData")).rejects.toThrow(ActionNotFound);

    expect(controller.ran).toEqual(["sekrit_data"]);
  });
});
