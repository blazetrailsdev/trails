import { describe, it, expect } from "vitest";
import { FlashHash } from "../../action-dispatch/flash.js";
import { assertNil } from "@blazetrails/activesupport";
import { rbObjDup, rbObjIvarSet } from "@blazetrails/ruby-compat";

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
    const flash = new FlashHash();
    flash.set("foo", "bar");

    expect(flash.isKey("foo")).toBe(true);
    expect(flash.isKey("bar")).toBe(false);
  });

  it("delete", () => {
    const flash = new FlashHash();
    flash.set("foo", "bar");
    flash.delete("foo");

    expect(flash.isKey("foo")).toBe(false);
    assertNil(flash.get("foo"));
  });

  it("to hash", () => {
    const flash = new FlashHash({ a: "1", b: "2" });
    expect(flash.toHash()).toEqual({ a: "1", b: "2" });
  });

  it("to session value", () => {
    const flash = new FlashHash({ foo: "bar" });
    expect(flash.toSessionValue()).toEqual({ discard: [], flashes: { foo: "bar" } });

    flash.now.set("qux", 1);
    expect(flash.toSessionValue()).toEqual({ flashes: { foo: "bar" }, discard: [] });

    flash.discard("foo");
    assertNil(flash.toSessionValue());

    flash.sweep();
    assertNil(flash.toSessionValue());
  });

  it("from session value", () => {
    const legacy = new FlashHash({ greeting: "Hello", farewell: "Goodbye" });
    rbObjIvarSet(legacy, "@used", new Set(["farewell"]));
    const hash = FlashHash.fromSessionValue(legacy);
    expect(hash.toHash()).toEqual({ greeting: "Hello" });
    assertNil(hash.toSessionValue());
  });

  it("from session value on json serializer", () => {
    const decryptedData =
      '{ "session_id":"d98bdf6d129618fc2548c354c161cfb5", "flash":{"discard":["farewell"], "flashes":{"greeting":"Hello","farewell":"Goodbye"}} }';
    const session = JSON.parse(decryptedData);
    const hash = FlashHash.fromSessionValue(session["flash"]);

    expect(hash.toHash()).toEqual({ greeting: "Hello" });
    assertNil(hash.toSessionValue());
    expect(hash.get("greeting")).toBe("Hello");
    expect(hash.get("greeting")).toBe("Hello");
  });

  it("empty?", () => {
    expect(new FlashHash().isEmpty()).toBe(true);
    expect(new FlashHash({ a: "1" }).isEmpty()).toBe(false);
  });

  it("each", () => {
    const flash = new FlashHash({ a: "1", b: "2" });
    const entries: [string, unknown][] = [];
    flash.each(([k, v]) => entries.push([k, v]));
    expect(entries).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
  });

  it("replace", () => {
    const flash = new FlashHash({ old: "value" });
    flash.replace({ new: "value" });
    expect(flash.isKey("old")).toBe(false);
    expect(flash.get("new")).toBe("value");
  });

  it("discard no args", () => {
    const flash = new FlashHash({ a: "1", b: "2" });
    flash.discard();
    flash.sweep();
    expect(flash.isEmpty()).toBe(true);
  });

  it("discard one arg", () => {
    const flash = new FlashHash({ a: "1", b: "2" });
    flash.discard("a");
    flash.sweep();
    expect(flash.isKey("a")).toBe(false);
    expect(flash.isKey("b")).toBe(true);
  });

  it("keep sweep", () => {
    const flash = new FlashHash({ a: "1" });
    flash.keep("a");
    flash.sweep();
    expect(flash.get("a")).toBe("1");
    flash.sweep();
    expect(flash.isKey("a")).toBe(false);
  });

  it("update sweep", () => {
    const flash = new FlashHash();
    flash.update({ a: "1" });
    flash.sweep();
    expect(flash.isKey("a")).toBe(true);
    flash.sweep();
    expect(flash.isKey("a")).toBe(false);
  });

  it("update delete sweep", () => {
    const flash = new FlashHash();
    flash.update({ a: "1" });
    flash.delete("a");
    flash.sweep();
    expect(flash.isKey("a")).toBe(false);
  });

  it("delete sweep", () => {
    const flash = new FlashHash({ a: "1" });
    flash.delete("a");
    flash.sweep();
    expect(flash.isKey("a")).toBe(false);
  });

  it("clear sweep", () => {
    const flash = new FlashHash({ a: "1", b: "2" });
    flash.clear();
    expect(flash.isEmpty()).toBe(true);
  });

  it("replace sweep", () => {
    const flash = new FlashHash({ old: "1" });
    flash.replace({ new: "2" });
    flash.sweep();
    expect(flash.isKey("new")).toBe(true);
    flash.sweep();
    expect(flash.isKey("new")).toBe(false);
  });

  it("discard then add", () => {
    const flash = new FlashHash({ a: "1" });
    flash.discard("a");
    flash.set("a", "2");
    flash.sweep();
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
    expect(flash.isKey("a")).toBe(false);
  });

  it("fromSessionValue loads Rails-shaped { flashes, discard } payload", () => {
    const loaded = FlashHash.fromSessionValue({
      flashes: { kept: "yes", dropped: "no" },
      discard: ["dropped"],
    });
    expect(loaded.get("kept")).toBe("yes");
    expect(loaded.isKey("dropped")).toBe(false);
  });

  it("fromSessionValue marks all surviving keys for next-sweep discard", () => {
    const loaded = FlashHash.fromSessionValue({
      flashes: { kept: "yes" },
      discard: [],
    });
    expect(loaded.get("kept")).toBe("yes");
    loaded.sweep();
    expect(loaded.isKey("kept")).toBe(false);
  });

  it("dup carries over the discard set so sweep behaves identically", () => {
    const original = FlashHash.fromSessionValue({ flashes: { a: "1" }, discard: [] });
    const copy = rbObjDup(original);
    copy.sweep();
    expect(copy.isKey("a")).toBe(false);
  });
});
