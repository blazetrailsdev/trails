import { Notifications } from "@blazetrails/activesupport";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SharedTestRoutes } from "../../../test-helpers/abstract-unit.js";
import { API } from "../../api.js";
import { TestCase } from "../../test-case.js";

class ModulesApiController extends API {
  one() {
    this.redirectTo({ action: "two" });
  }

  async two() {
    await this.sendData("data", {});
  }
}

describe("ActionController::API MODULES", () => {
  class ModulesApiTest extends TestCase {
    static {
      this.tests(ModulesApiController);
    }

    override setup(): void {
      super.setup();
      this.routes = SharedTestRoutes;
    }
  }

  let tc: ModulesApiTest;
  let events: string[];
  let subscribers: unknown[];

  beforeEach(async ({ task }) => {
    tc = new ModulesApiTest(task.name);
    await tc.beforeSetup();
    tc.setup();
    events = [];
    subscribers = ["redirect_to.action_controller", "send_data.action_controller"].map((name) =>
      Notifications.subscribe(name, (event) => {
        events.push(`${event.name} ${String(event.payload.status ?? "")}`.trim());
      }),
    );
  });

  afterEach(() => {
    for (const subscriber of subscribers) Notifications.unsubscribe(subscriber as never);
  });

  it("Instrumentation#redirect_to wraps Redirecting#redirect_to", async () => {
    await tc.get("one");
    expect(events).toEqual(["redirect_to.action_controller 302"]);
  });

  it("Instrumentation#send_data wraps DataStreaming#send_data", async () => {
    await tc.get("two");
    expect(events).toEqual(["send_data.action_controller"]);
  });

  it("Redirecting's included block declares raise_on_open_redirects", () => {
    expect(API.raiseOnOpenRedirects).toBe(false);
    const controller = new ModulesApiController() as unknown as Record<string, unknown>;
    expect(controller.raiseOnOpenRedirects).toBe(false);
  });

  it("UrlFor#initialize and Instrumentation#initialize run through super", () => {
    const controller = new ModulesApiController() as unknown as Record<string, unknown>;
    expect(controller._urlOptions).toBeNull();
    expect(controller.viewRuntime).toBeNull();
  });
});
