import { describe, expect, it } from "vitest";
import { ActionNotFound, Base } from "../../lib/abstract-controller/base.js";

describe("AbstractController::Base, a controller's non-action helper", () => {
  class FleetController extends Base {
    ran: string[] = [];
    show(): void {
      this.ran.push(this._ringoFailure());
      this.ran.push(this.#crew());
    }
    _ringoFailure(): string {
      return "_ringoFailure";
    }
    #crew(): string {
      return "#crew";
    }
  }

  it("leaves a `_`-prefixed or `#private` helper out of action_methods", () => {
    expect([...FleetController.actionMethods()]).toEqual(["show"]);
    expect(new FleetController().isAvailableAction("_ringoFailure")).toBe(false);
  });

  it("refuses to dispatch a helper as an action", async () => {
    const controller = new FleetController();

    await expect(controller.process("_ringoFailure")).rejects.toThrow(ActionNotFound);
    await controller.process("show");

    expect(controller.ran).toEqual(["_ringoFailure", "#crew"]);
  });
});
