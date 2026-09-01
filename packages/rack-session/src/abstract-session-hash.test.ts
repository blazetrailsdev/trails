import { ArgumentError } from "@blazetrails/activesupport";
import { Request } from "@blazetrails/rack";
import { beforeEach, describe, expect, it } from "vitest";

import type { PersistedRequest } from "./index.js";
import { Persisted, SessionHash } from "./index.js";

describe("Rack::Session::Abstract::SessionHash", () => {
  let hash: SessionHash;
  let klass: typeof SessionHash;

  beforeEach(() => {
    const store = {
      loadSession: () => ["id", { foo: ":bar", baz: ":qux", x: { y: 1 } }],
      sessionExists: () => true,
    } as unknown as Persisted;
    klass = SessionHash;
    hash = new klass(store, null as unknown as PersistedRequest);
  });

  it(".find finds entry in request", () => {
    const req = new Request({ "rack.session": {} }) as unknown as PersistedRequest;
    expect(klass.find(req)).toEqual({});
  });

  it(".set sets session in request", () => {
    const req = new Request({});
    klass.set(req as unknown as PersistedRequest, {});
    expect(req.env["rack.session"]).toEqual({});
  });

  it(".set_options sets session options in request", () => {
    const req = new Request({});
    const h = {};
    klass.setOptions(req as unknown as PersistedRequest, h);
    const opts = req.env["rack.session.options"];
    expect(opts).toEqual(h);
    expect(opts).not.toBe(h);
  });

  it("#keys returns keys", () => {
    expect(hash.keys()).toEqual(["foo", "baz", "x"]);
  });

  it("#values returns values", () => {
    expect(hash.values()).toEqual([":bar", ":qux", { y: 1 }]);
  });

  it("#dig operates like Hash#dig", () => {
    expect(hash.dig("x")).toEqual({ y: 1 });
    expect(hash.dig("x", "y")).toBe(1);
    expect(hash.dig("z")).toBeUndefined();
    expect(hash.dig("x", "z")).toBeUndefined();
    expect(() => hash.dig("x", "y", "z")).toThrow(TypeError);
    expect(() => (hash.dig as () => unknown)()).toThrow(ArgumentError);
  });

  it("#each iterates over entries", () => {
    const a: [string, unknown][] = [];
    hash.each((k, v) => {
      a.push([k, v]);
    });
    expect(a).toEqual([
      ["foo", ":bar"],
      ["baz", ":qux"],
      ["x", { y: 1 }],
    ]);
  });

  it("#has_key returns whether the key is in the hash", () => {
    expect(hash.hasKey("foo")).toBe(true);
    expect(hash.hasKey("food")).toBe(false);
    expect(hash.isKey("foo")).toBe(true);
    expect(hash.isInclude("food")).toBe(false);
  });

  it("#replace replaces hash", () => {
    hash.replace({ bar: "foo" });
    expect(hash.get("bar")).toBe("foo");
  });

  describe("#fetch", () => {
    it("returns value for a matching key", () => {
      expect(hash.fetch("foo")).toBe(":bar");
    });

    it("works with a default value", () => {
      expect(hash.fetch("unknown", ":default")).toBe(":default");
    });

    it("works with a block", () => {
      expect(hash.fetch("unknown", undefined, () => ":default")).toBe(":default");
    });

    it("it raises when fetching unknown keys without defaults", () => {
      expect(() => hash.fetch("unknown")).toThrow('key not found: "unknown"');
    });
  });

  it("#stringify_keys returns hash or session hash with keys stringified", () => {
    expect(hash.stringifyKeys(hash)).toEqual({ foo: ":bar", baz: ":qux", x: { y: 1 } });
  });
});
