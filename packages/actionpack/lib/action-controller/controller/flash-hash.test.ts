import { describe, it, expect, beforeEach } from "vitest";
import { FlashHash } from "../../action-dispatch/middleware/flash.js";
import {
  assert,
  assertEmpty,
  assertEqual,
  assertNil,
  assertNot,
  assertNotEmpty,
} from "@blazetrails/activesupport";
import { rbObjDup, rbObjIvarSet } from "@blazetrails/ruby-compat";

describe("FlashHashTest", () => {
  let hash: FlashHash;

  beforeEach(() => {
    hash = new FlashHash();
  });

  it("set get", () => {
    hash.set("foo", "zomg");
    assertEqual("zomg", hash.get("foo"));
  });

  it("keys", () => {
    assertEqual([], hash.keys);

    hash.set("foo", "zomg");
    assertEqual(["foo"], hash.keys);

    hash.set("bar", "zomg");
    assertEqual(["foo", "bar"].sort(), hash.keys.sort());
  });

  it("update", () => {
    hash.set("foo", "bar");
    hash.update({ foo: "baz", hello: "world" });

    assertEqual("baz", hash.get("foo"));
    assertEqual("world", hash.get("hello"));
  });

  it("key", () => {
    hash.set("foo", "bar");

    assert(hash.isKey("foo"));
    assert(hash.isKey("foo"));
    assertNot(hash.isKey("bar"));
    assertNot(hash.isKey("bar"));
  });

  it("delete", () => {
    hash.set("foo", "bar");
    hash.delete("foo");

    assertNot(hash.isKey("foo"));
    assertNil(hash.get("foo"));
  });

  it("to hash", () => {
    hash.set("foo", "bar");
    assertEqual({ foo: "bar" }, hash.toHash());

    hash.toHash()["zomg"] = "aaron";
    assertNot(hash.isKey("zomg"));
    assertEqual({ foo: "bar" }, hash.toHash());
  });

  it("to session value", () => {
    hash.set("foo", "bar");
    assertEqual({ discard: [], flashes: { foo: "bar" } }, hash.toSessionValue());

    hash.now.set("qux", 1);
    assertEqual({ flashes: { foo: "bar" }, discard: [] }, hash.toSessionValue());

    hash.discard("foo");
    assertNil(hash.toSessionValue());

    hash.sweep();
    assertNil(hash.toSessionValue());
  });

  it("from session value", () => {
    const legacy = new FlashHash({ greeting: "Hello", farewell: "Goodbye" });
    rbObjIvarSet(legacy, "@used", new Set(["farewell"]));
    const hash = FlashHash.fromSessionValue(legacy);
    assertEqual({ greeting: "Hello" }, hash.toHash());
    assertNil(hash.toSessionValue());
  });

  it("from session value on json serializer", () => {
    const decryptedData =
      '{ "session_id":"d98bdf6d129618fc2548c354c161cfb5", "flash":{"discard":["farewell"], "flashes":{"greeting":"Hello","farewell":"Goodbye"}} }';
    const session = JSON.parse(decryptedData);
    const hash = FlashHash.fromSessionValue(session["flash"]);

    assertEqual({ greeting: "Hello" }, hash.toHash());
    assertNil(hash.toSessionValue());
    assertEqual("Hello", hash.get("greeting"));
    assertEqual("Hello", hash.get("greeting"));
  });

  it("empty?", () => {
    assertEmpty(hash);
    hash.set("zomg", "bears");
    assertNotEmpty(hash);
    hash.clear();
    assertEmpty(hash);
  });

  it("each", () => {
    hash.set("hello", "world");
    hash.set("foo", "bar");

    const things: [string, unknown][] = [];
    hash.each(([k, v]) => {
      things.push([k, v]);
    });

    assertEqual(
      [
        ["hello", "world"],
        ["foo", "bar"],
      ].sort(),
      things.sort(),
    );
  });

  it("replace", () => {
    hash.set("hello", "world");
    hash.replace({ omg: "aaron" });
    assertEqual({ omg: "aaron" }, hash.toHash());
  });

  it("discard no args", () => {
    hash.set("hello", "world");
    hash.discard();

    hash.sweep();
    assertEqual({}, hash.toHash());
  });

  it("discard one arg", () => {
    hash.set("hello", "world");
    hash.set("omg", "world");
    hash.discard("hello");

    hash.sweep();
    assertEqual({ omg: "world" }, hash.toHash());
  });

  it("keep sweep", () => {
    hash.set("hello", "world");

    hash.sweep();
    assertEqual({ hello: "world" }, hash.toHash());
  });

  it("update sweep", () => {
    hash.set("hello", "world");
    hash.update({ hi: "mom" });

    hash.sweep();
    assertEqual({ hello: "world", hi: "mom" }, hash.toHash());
  });

  it("update delete sweep", () => {
    hash.set("hello", "world");
    hash.delete("hello");
    hash.update({ hello: "mom" });

    hash.sweep();
    assertEqual({ hello: "mom" }, hash.toHash());
  });

  it("delete sweep", () => {
    hash.set("hello", "world");
    hash.set("hi", "mom");
    hash.delete("hi");

    hash.sweep();
    assertEqual({ hello: "world" }, hash.toHash());
  });

  it("clear sweep", () => {
    hash.set("hello", "world");
    hash.clear();

    hash.sweep();
    assertEqual({}, hash.toHash());
  });

  it("replace sweep", () => {
    hash.set("hello", "world");
    hash.replace({ hi: "mom" });

    hash.sweep();
    assertEqual({ hi: "mom" }, hash.toHash());
  });

  it("discard then add", () => {
    hash.set("hello", "world");
    hash.set("omg", "world");
    hash.discard("hello");
    hash.set("hello", "world");

    hash.sweep();
    assertEqual({ omg: "world", hello: "world" }, hash.toHash());
  });

  it("keep all sweep", () => {
    hash.set("hello", "world");
    hash.set("omg", "world");
    hash.discard("hello");
    hash.keep();

    hash.sweep();
    assertEqual({ omg: "world", hello: "world" }, hash.toHash());
  });

  it("double sweep", () => {
    hash.set("hello", "world");
    hash.sweep();

    assertEqual({ hello: "world" }, hash.toHash());

    hash.sweep();
    assertEqual({}, hash.toHash());
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
