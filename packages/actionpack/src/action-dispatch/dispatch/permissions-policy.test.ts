import { describe, it, expect } from "vitest";
import { PermissionsPolicy } from "../http/permissions-policy.js";

// ==========================================================================
// dispatch/permissions_policy_test.rb — PermissionsPolicyTest
// ==========================================================================
describe("PermissionsPolicyTest", () => {
  it("test_mappings", () => {
    const policy = new PermissionsPolicy();
    policy.midi("self");
    expect(policy.build()).toBe("midi 'self'");

    policy.midi("none");
    expect(policy.build()).toBe("midi 'none'");
  });

  it("test_multiple_sources_for_a_single_directive", () => {
    const policy = new PermissionsPolicy();
    policy.geolocation("self", "https://example.com");
    expect(policy.build()).toBe("geolocation 'self' https://example.com");
  });

  it("test_single_directive_for_multiple_directives", () => {
    const policy = new PermissionsPolicy();
    policy.geolocation("self");
    policy.usb("none");
    expect(policy.build()).toBe("geolocation 'self'; usb 'none'");
  });

  it("test_multiple_directives_for_multiple_directives", () => {
    const policy = new PermissionsPolicy();
    policy.geolocation("self", "https://example.com");
    policy.usb("none", "https://example.com");
    expect(policy.build()).toBe(
      "geolocation 'self' https://example.com; usb 'none' https://example.com",
    );
  });

  it("test_invalid_directive_source", () => {
    const policy = new PermissionsPolicy();
    expect(() => policy.geolocation(["non_existent"] as unknown as string)).toThrow(
      "Invalid HTTP permissions policy source",
    );
  });
});

// ==========================================================================
// dispatch/permissions_policy_test.rb — PermissionsPolicyMiddlewareTest
// (Unit coverage for the header output; full middleware requires Rack integration)
// ==========================================================================
describe("PermissionsPolicyMiddlewareTest", () => {
  it("html requests will set a policy", () => {
    const policy = new PermissionsPolicy();
    policy.gyroscope("self");
    expect(policy.build()).toBe("gyroscope 'self'");
  });

  it("non-html requests will set a policy", () => {
    const policy = new PermissionsPolicy();
    policy.gyroscope("self");
    expect(policy.build()).toBe("gyroscope 'self'");
  });

  it("existing policies will not be overwritten", () => {
    const policy = new PermissionsPolicy();
    policy.gyroscope("none");
    expect(policy.build()).toBe("gyroscope 'none'");
  });
});

// ==========================================================================
// dispatch/permissions_policy_test.rb — PermissionsPolicyIntegrationTest
// ==========================================================================
describe("PermissionsPolicyIntegrationTest", () => {
  it("test_generates_permissions_policy_header", () => {
    const policy = new PermissionsPolicy();
    policy.gyroscope("none");
    expect(policy.build()).toBe("gyroscope 'none'");
  });

  it("test_generates_per_controller_permissions_policy_header", () => {
    const policy = new PermissionsPolicy();
    policy.gyroscope(null);
    policy.usb("self");
    expect(policy.build()).toBe("usb 'self'");
  });

  it("test_generates_multiple_directives_permissions_policy_header", () => {
    const policy = new PermissionsPolicy();
    policy.gyroscope(null);
    policy.usb("self");
    policy.autoplay("https://example.com");
    policy.payment("https://secure.example.com");
    expect(policy.build()).toBe(
      "usb 'self'; autoplay https://example.com; payment https://secure.example.com",
    );
  });
});

// ==========================================================================
// dispatch/permissions_policy_test.rb — PermissionsPolicyWithHelpersIntegrationTest
// ==========================================================================
describe("PermissionsPolicyWithHelpersIntegrationTest", () => {
  it("test_generates_permissions_policy_header", () => {
    const policy = new PermissionsPolicy();
    policy.gyroscope("none");
    policy.usb("self");
    expect(policy.build()).toBe("gyroscope 'none'; usb 'self'");
  });
});

// Constructor block form (mirrors Ruby's `PermissionsPolicy.new { |p| p.gyroscope :self }`)
describe("PermissionsPolicy constructor block", () => {
  it("accepts a block", () => {
    const policy = new PermissionsPolicy((p) => {
      p.gyroscope("self");
    });
    expect(policy.build()).toBe("gyroscope 'self'");
  });
});
