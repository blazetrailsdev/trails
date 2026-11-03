import { describe, it, expect } from "vitest";
import { HealthController } from "./health-controller.js";

describe("HealthController", () => {
  it("controllerPath mirrors Trails::HealthController (`trails/health`)", () => {
    expect(HealthController.controllerPath()).toBe("trails/health");
  });
});
