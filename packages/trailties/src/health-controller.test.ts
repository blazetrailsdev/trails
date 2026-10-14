import { describe, it, expect } from "vitest";
import { ActionController, RouteSet } from "@blazetrails/actionpack";
import { HealthController } from "./health-controller.js";

describe("HealthController", () => {
  it("controllerPath mirrors Rails::HealthController (`rails/health`)", () => {
    expect(HealthController.controllerPath()).toBe("rails/health");
  });

  it("health controller renders green success page", async ({ task }) => {
    class HealthControllerTest extends ActionController.TestCase {}
    HealthControllerTest.tests(HealthController);
    const t = new HealthControllerTest(task.name);
    await t.beforeSetup();
    t.routes = new RouteSet();
    t.routes.draw(function () {
      this.get("/up", { to: "rails/health#show", as: "rails_health_check" });
    });
    await t.get("show");
    expect(t.controller.status).toBe(200);
    expect(t.response.body).toMatch(/background-color: green/);
  });

  it("health controller renders red internal server error page", async ({ task }) => {
    class FailingController extends HealthController {
      override async renderUp(): Promise<void> {
        throw new Error("some exception");
      }
    }
    class HealthControllerTest extends ActionController.TestCase {}
    HealthControllerTest.tests(FailingController);
    const t = new HealthControllerTest(task.name);
    await t.beforeSetup();
    t.routes = new RouteSet();
    t.routes.draw(function () {
      this.get("/up", { to: "rails/health#show", as: "rails_health_check" });
    });
    await t.get("show");
    expect(t.controller.status).toBe(500);
    expect(t.response.body).toMatch(/background-color: red/);
  });
});
