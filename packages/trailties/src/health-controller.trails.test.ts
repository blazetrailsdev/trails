import { describe, it, expect } from "vitest";
import { HealthController } from "./health-controller.js";

describe("HealthController", () => {
  it("controllerPath mirrors Rails::HealthController (`rails/health`)", () => {
    expect(HealthController.controllerPath()).toBe("rails/health");
  });
});
