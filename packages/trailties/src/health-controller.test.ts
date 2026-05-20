import { describe, it, expect } from "vitest";
import { ActionController } from "@blazetrails/actionpack";
import { HealthController } from "./health-controller.js";

describe("HealthController", () => {
  it("controllerPath mirrors Rails::HealthController (`rails/health`)", () => {
    expect(HealthController.controllerPath()).toBe("rails/health");
  });

  it("health controller renders green success page", async () => {
    class HealthControllerTest extends ActionController.TestCase {}
    HealthControllerTest.tests(HealthController);
    const t = new HealthControllerTest(HealthController);
    await t.get("show");
    expect(t.controller.status).toBe(200);
    expect(t.responseBody).toMatch(/background-color: green/);
  });

  it("health controller renders red internal server error page", async () => {
    class FailingController extends HealthController {
      override renderUp(): void {
        throw new Error("some exception");
      }
    }
    class HealthControllerTest extends ActionController.TestCase {}
    HealthControllerTest.tests(FailingController);
    const t = new HealthControllerTest(FailingController);
    await t.get("show");
    expect(t.controller.status).toBe(500);
    expect(t.responseBody).toMatch(/background-color: red/);
  });
});
