import { describe, expect, it } from "vitest";
import { TestSession } from "../../../action-controller/test-case.js";

// ==========================================================================
// dispatch/session/test_session_test.rb  (ActionController::TestSessionTest)
//
// Rails design: ActionController::TestSession is an in-memory session store
// backed by a plain hash. Keys are always coerced to strings. `id` returns a
// session-ID value object whose `publicId` is the hex string; the special
// key "session_id" returns that same value via `[]`. `fetch` follows Ruby's
// Hash#fetch contract: block wins over default when both are given.
// ==========================================================================

describe("ActionController::TestSessionTest", () => {
  it("initialize with values", () => {
    const session = new TestSession({ one: "one", two: "two" });
    expect(session.get("one")).toBe("one");
    expect(session.get("two")).toBe("two");
  });

  it("setting session item sets item", () => {
    const session = new TestSession();
    session.set("key", "value");
    expect(session.get("key")).toBe("value");
  });

  it("calling delete removes item and returns its value", () => {
    const session = new TestSession();
    session.set("key", "value");
    expect(session.get("key")).toBe("value");
    expect(session.delete("key")).toBe("value");
    expect(session.get("key")).toBeUndefined();
  });

  it("calling update with params passes to attributes", () => {
    const session = new TestSession();
    session.update({ key: "value" });
    expect(session.get("key")).toBe("value");
  });

  it("clear empties session", () => {
    const session = new TestSession({ one: "one", two: "two" });
    session.clear();
    expect(session.get("one")).toBeUndefined();
    expect(session.get("two")).toBeUndefined();
  });

  it("keys and values", () => {
    const session = new TestSession({ one: "1", two: "2" });
    expect(session.keys()).toEqual(["one", "two"]);
    expect(session.values()).toEqual(["1", "2"]);
  });

  it("dig", () => {
    const session = new TestSession({ one: { two: { three: "3" } } });
    expect(session.dig("one", "two", "three")).toBe("3");
    expect(session.dig("ruby", "on", "rails")).toBeUndefined();
  });

  it("fetch returns default", () => {
    const session = new TestSession({ one: "1" });
    expect(session.fetch("two", "2")).toBe("2");
  });

  it("fetch on symbol returns value", () => {
    const session = new TestSession({ one: "1" });
    expect(session.fetch("one")).toBe("1");
  });

  it("fetch on string returns value", () => {
    const session = new TestSession({ one: "1" });
    expect(session.fetch("one")).toBe("1");
  });

  it("fetch returns block value", () => {
    const session = new TestSession({ one: "1" });
    expect(session.fetch("2", (key: string) => parseInt(key, 10))).toBe(2);
  });

  it("session id", () => {
    const session = new TestSession();
    expect(typeof session.id.publicId).toBe("string");
    expect(session.id.publicId).toBe(session.get("session_id"));
  });

  it("merge!", () => {
    const session = new TestSession();
    session.mergeBang({ key: "value" });
    expect(session.get("key")).toBe("value");
  });
});
