import { describe, it, expect } from "vitest";
import { FlashHash } from "./flash.js";

// ==========================================================================
// controller/flash_hash_test.rb
// ==========================================================================
describe("ActionDispatch::Flash::FlashHash", () => {
  it("set get", () => {
    const flash = new FlashHash();
    flash.set("notice", "hello");
    expect(flash.get("notice")).toBe("hello");
  });

  it("keys", () => {
    const flash = new FlashHash({ a: "1", b: "2" });
    expect(flash.keys).toEqual(["a", "b"]);
  });

  it("update", () => {
    const flash = new FlashHash();
    flash.update({ notice: "hi", alert: "danger" });
    expect(flash.get("notice")).toBe("hi");
    expect(flash.get("alert")).toBe("danger");
  });

  it("key", () => {
    const flash = new FlashHash({ notice: "hello" });
    expect(flash.has("notice")).toBe(true);
    expect(flash.has("missing")).toBe(false);
  });

  it("delete", () => {
    const flash = new FlashHash({ notice: "hello" });
    expect(flash.delete("notice")).toBe("hello");
    expect(flash.has("notice")).toBe(false);
  });

  it("to hash", () => {
    const flash = new FlashHash({ a: "1", b: "2" });
    expect(flash.toHash()).toEqual({ a: "1", b: "2" });
  });

  it("to session value", () => {
    const flash = new FlashHash({ notice: "saved" });
    expect(flash.toSessionValue()).toEqual({ notice: "saved" });
  });

  it("from session value", () => {
    const flash = FlashHash.fromSessionValue({ notice: "hello" });
    expect(flash.get("notice")).toBe("hello");
  });

  it("from session value on json serializer", () => {
    const flash = FlashHash.fromSessionValue({ notice: "test" });
    expect(flash.get("notice")).toBe("test");
  });

  it("empty?", () => {
    expect(new FlashHash().empty).toBe(true);
    expect(new FlashHash({ a: "1" }).empty).toBe(false);
  });

  it("each", () => {
    const flash = new FlashHash({ a: "1", b: "2" });
    const entries: [string, unknown][] = [];
    flash.each((k, v) => entries.push([k, v]));
    expect(entries).toEqual([["a", "1"], ["b", "2"]]);
  });

  it("replace", () => {
    const flash = new FlashHash({ old: "value" });
    flash.replace({ new: "value" });
    expect(flash.has("old")).toBe(false);
    expect(flash.get("new")).toBe("value");
  });

  it("discard no args", () => {
    const flash = new FlashHash({ a: "1", b: "2" });
    flash.discard();
    flash.sweep();
    expect(flash.empty).toBe(true);
  });

  it("discard one arg", () => {
    const flash = new FlashHash({ a: "1", b: "2" });
    flash.discard("a");
    flash.sweep();
    expect(flash.has("a")).toBe(false);
    expect(flash.has("b")).toBe(true);
  });

  it("keep sweep", () => {
    const flash = new FlashHash({ a: "1" });
    flash.keep("a");
    flash.sweep();
    expect(flash.get("a")).toBe("1");
    // Second sweep should discard
    flash.sweep();
    expect(flash.has("a")).toBe(false);
  });

  it("update sweep", () => {
    const flash = new FlashHash();
    flash.update({ a: "1" });
    flash.sweep();
    expect(flash.has("a")).toBe(true);
    flash.sweep();
    expect(flash.has("a")).toBe(false);
  });

  it("update delete sweep", () => {
    const flash = new FlashHash();
    flash.update({ a: "1" });
    flash.delete("a");
    flash.sweep();
    expect(flash.has("a")).toBe(false);
  });

  it("delete sweep", () => {
    const flash = new FlashHash({ a: "1" });
    flash.delete("a");
    flash.sweep();
    expect(flash.has("a")).toBe(false);
  });

  it("clear sweep", () => {
    const flash = new FlashHash({ a: "1", b: "2" });
    flash.clear();
    expect(flash.empty).toBe(true);
  });

  it("replace sweep", () => {
    const flash = new FlashHash({ old: "1" });
    flash.replace({ new: "2" });
    flash.sweep();
    // new should survive first sweep
    expect(flash.has("new")).toBe(true);
    flash.sweep();
    expect(flash.has("new")).toBe(false);
  });

  it("discard then add", () => {
    const flash = new FlashHash({ a: "1" });
    flash.discard("a");
    flash.set("a", "2");
    flash.sweep();
    // Re-setting after discard keeps the value
    expect(flash.get("a")).toBe("2");
  });

  it("keep all sweep", () => {
    const flash = new FlashHash({ a: "1", b: "2" });
    flash.keep();
    flash.sweep();
    expect(flash.get("a")).toBe("1");
    expect(flash.get("b")).toBe("2");
  });

  it("double sweep", () => {
    const flash = new FlashHash({ a: "1" });
    flash.sweep();
    flash.sweep();
    expect(flash.has("a")).toBe(false);
  });
});

// ==========================================================================
// controller/flash_test.rb
// ==========================================================================
describe("ActionDispatch::Flash", () => {
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

  it("setting flash does not raise in following requests", () => {
    const flash = new FlashHash();
    flash.set("notice", "hello");
    flash.sweep();
    // Should not throw
    expect(flash.get("notice")).toBe("hello");
  });

  it("setting flash now does not raise in following requests", () => {
    const flash = new FlashHash();
    flash.now("notice", "now");
    expect(flash.get("notice")).toBe("now");
  });

  it("from session value nil returns empty", () => {
    const flash = FlashHash.fromSessionValue(null);
    expect(flash.empty).toBe(true);
  });
});
