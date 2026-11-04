import { describe, it, expect } from "vitest";
import { ActionController, RouteSet } from "@blazetrails/actionpack";
import { HealthController } from "./health-controller.js";

describe("HealthControllerTest", () => {
  it("health controller renders green success page", async ({ task }) => {
    class HealthControllerTest extends ActionController.TestCase {}
    HealthControllerTest.tests(HealthController);
    const t = new HealthControllerTest(task.name);
    await t.beforeSetup();
    t.routes = new RouteSet();
    t.routes.draw(function () {
      this.get("/up", { to: "trails/health#show", as: "trails_health_check" });
    });
    await t.get("show");
    t.assertResponse("success");
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
      this.get("/up", { to: "trails/health#show", as: "trails_health_check" });
    });
    await t.get("show");
    t.assertResponse("internal_server_error");
    expect(t.response.body).toMatch(/background-color: red/);
  });
});
