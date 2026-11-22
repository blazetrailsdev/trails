import { describe, it, expect, beforeEach } from "vitest";
import { block, include, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Options } from "../lib/options.js";

Options.optionAccessor(":foo");

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface MockOptions extends Options {
  foo: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class MockOptions {
  constructor() {
    this._env = null;
    this.initializeOptions();
  }
}
include(MockOptions, Options);

describe("Rack::Cache::Options", () => {
  let options: MockOptions;

  beforeEach(() => {
    options = new MockOptions();
  });

  describe("#set", () => {
    it("sets a Symbol option as rack-cache.symbol", () => {
      options.set(":bar", "baz");
      expect(options.options["rack-cache.bar"]).toEqual("baz");
    });

    it("sets a String option as string", () => {
      options.set("foo.bar", "bling");
      expect(options.options["foo.bar"]).toEqual("bling");
    });

    it("sets all key/value pairs when given a Hash", () => {
      options.set({ ":foo": "bar", ":bar": "baz", "foo.bar": "bling" });
      expect(options.foo).toEqual("bar");
      expect(options.options["rack-cache.bar"]).toEqual("baz");
      expect(options.options["foo.bar"]).toEqual("bling");
    });
  });

  it("makes options declared with option_accessor available as attributes", () => {
    options.set(":foo", "bar");
    expect(options.foo).toEqual("bar");
  });

  it("allows setting multiple options via assignment", () => {
    options.options = { ":foo": "bar", ":bar": "baz", "foo.bar": "bling" };
    expect(options.foo).toEqual("bar");
    expect(options.options["foo.bar"]).toEqual("bling");
    expect(options.options["rack-cache.bar"]).toEqual("baz");
  });

  it("allows storing the value as a block", () => {
    const blk = block(() => "bar block");
    options.set(":foo", blk);
    expect(options.options["rack-cache.foo"]).toEqual(blk);
  });

  it("allows the cache key generator to be configured", () => {
    expect(rbObjRespondTo(options, "cacheKey")).toBeTruthy();
    expect("cacheKey" in options).toBeTruthy();
  });

  it("allows the meta store to be configured", () => {
    expect(rbObjRespondTo(options, "metastore")).toBeTruthy();
    expect("metastore" in options).toBeTruthy();
    expect(options.metastore == null).toBeFalsy();
  });

  it("allows the entity store to be configured", () => {
    expect(rbObjRespondTo(options, "entitystore")).toBeTruthy();
    expect("entitystore" in options).toBeTruthy();
    expect(options.entitystore == null).toBeFalsy();
  });

  it("allows log verbosity to be configured", () => {
    expect(rbObjRespondTo(options, "verbose")).toBeTruthy();
    expect("verbose" in options).toBeTruthy();
    expect(rbObjRespondTo(options, "isVerbose")).toBeTruthy();
    expect(options.verbose == null).toBeFalsy();
  });
});
