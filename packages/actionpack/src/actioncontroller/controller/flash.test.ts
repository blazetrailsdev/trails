import { describe, it, expect } from "vitest";
import { FlashHash } from "../../actiondispatch/flash.js";

// ==========================================================================
// controller/flash_test.rb
// ==========================================================================
describe("FlashTest", () => {
  it("flash", () => {
    const flash = new FlashHash();
    flash.set("notice", "hello");
    expect(flash.get("notice")).toBe("hello");
  });

  it("keep flash", () => {
    const flash = new FlashHash({ notice: "hello" });
    flash.keep();
    flash.sweep();
    expect(flash.get("notice")).toBe("hello");
  });

  it("flash now", () => {
    const flash = new FlashHash();
    flash.now("notice", "immediate");
    expect(flash.get("notice")).toBe("immediate");
    flash.sweep();
    expect(flash.get("notice")).toBeUndefined();
  });

  it("update flash", () => {
    const flash = new FlashHash();
    flash.update({ notice: "updated" });
    expect(flash.get("notice")).toBe("updated");
  });

  it("flash after reset session", () => {
    const flash = new FlashHash({ notice: "old" });
    flash.clear();
    expect(flash.empty).toBe(true);
  });

  it("does not set the session if the flash is empty", () => {
    const flash = new FlashHash();
    expect(flash.toSessionValue()).toEqual({});
  });

  it("keep and discard return values", () => {
    const flash = new FlashHash({ a: "1", b: "2" });
    const kept = flash.keep();
    expect(kept).toEqual({ a: "1", b: "2" });
    const discarded = flash.discard("a");
    expect(discarded).toEqual({ a: "1", b: "2" });
  });

  it("redirect to with alert", () => {
    const flash = new FlashHash();
    flash.alert = "danger";
    expect(flash.alert).toBe("danger");
    expect(flash.get("alert")).toBe("danger");
  });

  it("redirect to with notice", () => {
    const flash = new FlashHash();
    flash.notice = "saved";
    expect(flash.notice).toBe("saved");
  });

  it("render with flash now alert", () => {
    const flash = new FlashHash();
    flash.now("alert", "immediate alert");
    expect(flash.alert).toBe("immediate alert");
  });

  it("render with flash now notice", () => {
    const flash = new FlashHash();
    flash.now("notice", "immediate notice");
    expect(flash.notice).toBe("immediate notice");
  });

  it("redirect to with other flashes", () => {
    const flash = new FlashHash();
    flash.set("custom", "value");
    expect(flash.get("custom")).toBe("value");
  });

  it("from session value nil returns empty", () => {
    const flash = FlashHash.fromSessionValue(null);
    expect(flash.empty).toBe(true);
  });
});

describe("FlashIntegrationTest", () => {
  it("setting flash does not raise in following requests", () => {
    const flash = new FlashHash();
    flash.set("notice", "hello");
    flash.sweep();
    expect(flash.get("notice")).toBe("hello");
  });

  it("setting flash now does not raise in following requests", () => {
    const flash = new FlashHash();
    flash.now("notice", "now");
    expect(flash.get("notice")).toBe("now");
  });
});
