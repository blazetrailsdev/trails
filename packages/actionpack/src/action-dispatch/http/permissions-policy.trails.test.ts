import { describe, it, expect } from "vitest";
import { PermissionsPolicy } from "./permissions-policy.js";

describe("PermissionsPolicy#apply_mapping", () => {
  it("raises on an unknown source mapping", () => {
    const policy = new PermissionsPolicy();
    expect(() => policy.geolocation(":non_existent")).toThrow(
      "Unknown HTTP permissions policy source mapping: :non_existent",
    );
  });
});

describe("PermissionsPolicy constructor block", () => {
  it("accepts a block", () => {
    const policy = new PermissionsPolicy((p) => {
      p.gyroscope(":self");
    });
    expect(policy.build()).toBe("gyroscope 'self'");
  });
});
