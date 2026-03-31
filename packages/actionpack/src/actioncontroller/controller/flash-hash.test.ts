import { describe, it, expect } from "vitest";
import { FlashHash } from "../../actiondispatch/flash.js";

// ==========================================================================
// controller/flash_hash_test.rb
// ==========================================================================
describe("FlashHashTest", () => {
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
    expect(entries).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
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
