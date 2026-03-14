import { describe, it, expect } from "vitest";
import { PermissionsPolicy } from "../permissions-policy.js";

// ==========================================================================
// dispatch/permissions_policy_test.rb
// ==========================================================================
describe("PermissionsPolicyTest", () => {
  it("empty policy", () => {
    const policy = new PermissionsPolicy();
    expect(policy.empty).toBe(true);
    expect(policy.build()).toBe("");
  });

  it("single directive self", () => {
    const policy = new PermissionsPolicy();
    policy.camera("self");
    expect(policy.build()).toBe("camera=(self)");
  });

  it("single directive none", () => {
    const policy = new PermissionsPolicy();
    policy.camera("none");
    expect(policy.build()).toBe("camera=()");
  });

  it("single directive wildcard", () => {
    const policy = new PermissionsPolicy();
    policy.camera("*");
    expect(policy.build()).toBe("camera=*");
  });

  it("single directive with origin", () => {
    const policy = new PermissionsPolicy();
    policy.camera("https://example.com");
    expect(policy.build()).toBe('camera=("https://example.com")');
  });

  it("multiple sources", () => {
    const policy = new PermissionsPolicy();
    policy.camera("self", "https://example.com");
    expect(policy.build()).toBe('camera=(self "https://example.com")');
  });

  it("multiple directives", () => {
    const policy = new PermissionsPolicy();
    policy.camera("self");
    policy.microphone("none");
    const header = policy.build();
    expect(header).toContain("camera=(self)");
    expect(header).toContain("microphone=()");
  });

  it("geolocation", () => {
    const policy = new PermissionsPolicy();
    policy.geolocation("self");
    expect(policy.build()).toBe("geolocation=(self)");
  });

  it("gyroscope", () => {
    const policy = new PermissionsPolicy();
    policy.gyroscope("none");
    expect(policy.build()).toBe("gyroscope=()");
  });

  it("fullscreen", () => {
    const policy = new PermissionsPolicy();
    policy.fullscreen("self");
    expect(policy.build()).toBe("fullscreen=(self)");
  });

  it("payment", () => {
    const policy = new PermissionsPolicy();
    policy.payment("self");
    expect(policy.build()).toBe("payment=(self)");
  });

  it("usb", () => {
    const policy = new PermissionsPolicy();
    policy.usb("none");
    expect(policy.build()).toBe("usb=()");
  });

  it("autoplay", () => {
    const policy = new PermissionsPolicy();
    policy.autoplay("self");
    expect(policy.build()).toBe("autoplay=(self)");
  });

  it("to header", () => {
    const policy = new PermissionsPolicy();
    policy.camera("self");
    const [name, value] = policy.toHeader();
    expect(name).toBe("permissions-policy");
    expect(value).toBe("camera=(self)");
  });

  it("dup", () => {
    const policy = new PermissionsPolicy();
    policy.camera("self");
    const copy = policy.dup();
    copy.microphone("none");
    // Original should not be affected
    expect(policy.build()).toBe("camera=(self)");
    expect(copy.build()).toContain("camera=(self)");
    expect(copy.build()).toContain("microphone=()");
  });

  it("generic allow", () => {
    const policy = new PermissionsPolicy();
    policy.allow("custom-feature", "self");
    expect(policy.build()).toBe("custom-feature=(self)");
  });

  it("chaining", () => {
    const policy = new PermissionsPolicy();
    policy.camera("self").microphone("none").geolocation("*");
    const header = policy.build();
    expect(header).toContain("camera=(self)");
    expect(header).toContain("microphone=()");
    expect(header).toContain("geolocation=*");
  });

  it("accelerometer", () => {
    const policy = new PermissionsPolicy();
    policy.accelerometer("none");
    expect(policy.build()).toBe("accelerometer=()");
  });

  it("encrypted media", () => {
    const policy = new PermissionsPolicy();
    policy.encryptedMedia("self");
    expect(policy.build()).toBe("encrypted-media=(self)");
  });

  it("picture in picture", () => {
    const policy = new PermissionsPolicy();
    policy.pictureInPicture("*");
    expect(policy.build()).toBe("picture-in-picture=*");
  });

  it("display capture", () => {
    const policy = new PermissionsPolicy();
    policy.displayCapture("self");
    expect(policy.build()).toBe("display-capture=(self)");
  });

  it("idle detection", () => {
    const policy = new PermissionsPolicy();
    policy.idleDetection("self");
    expect(policy.build()).toBe("idle-detection=(self)");
  });

  it("screen wake lock", () => {
    const policy = new PermissionsPolicy();
    policy.screenWakeLock("self");
    expect(policy.build()).toBe("screen-wake-lock=(self)");
  });

  it("serial directive", () => {
    const policy = new PermissionsPolicy();
    policy.serial("none");
    expect(policy.build()).toBe("serial=()");
  });

  it("sync xhr", () => {
    const policy = new PermissionsPolicy();
    policy.syncXhr("none");
    expect(policy.build()).toBe("sync-xhr=()");
  });

  it("web share", () => {
    const policy = new PermissionsPolicy();
    policy.webShare("self");
    expect(policy.build()).toBe("web-share=(self)");
  });

  it("xr spatial tracking", () => {
    const policy = new PermissionsPolicy();
    policy.xrSpatialTracking("none");
    expect(policy.build()).toBe("xr-spatial-tracking=()");
  });

  it("midi directive", () => {
    const policy = new PermissionsPolicy();
    policy.midi("self");
    expect(policy.build()).toBe("midi=(self)");
  });

  it("magnetometer directive", () => {
    const policy = new PermissionsPolicy();
    policy.magnetometer("none");
    expect(policy.build()).toBe("magnetometer=()");
  });

  it("bluetooth directive", () => {
    const policy = new PermissionsPolicy();
    policy.bluetooth("self");
    expect(policy.build()).toBe("bluetooth=(self)");
  });

  it("hid directive", () => {
    const policy = new PermissionsPolicy();
    policy.hid("self");
    expect(policy.build()).toBe("hid=(self)");
  });
});
