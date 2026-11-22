import { describe, it, expect, beforeEach } from "vitest";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import * as Cache from "../lib/cache.js";
import type { Context } from "../lib/context.js";
import type { Options } from "../lib/options.js";

describe("Rack::Cache", () => {
  function dumbApp(_env: Record<string, unknown>, block?: () => unknown) {
    const body = block !== undefined ? [block()] : ["Hi"];
    return [200, { "content-type": "text/plain" }, body];
  }

  let app: typeof dumbApp;
  beforeEach(() => {
    app = dumbApp;
  });

  it("takes a backend and returns a middleware component", () => {
    expect(rbObjRespondTo(Cache.new(app), "call")).toBeTruthy();
  });

  it("takes an options Hash", () => {
    Cache.new(app, {});
  });

  it("sets options provided in the options Hash", () => {
    const object = Cache.new(app, { ":foo": "bar", "foo.bar": "bling" });
    expect((object as unknown as Options).options["foo.bar"]).toEqual("bling");
    expect((object as unknown as Options).options["rack-cache.foo"]).toEqual("bar");
  });

  it("takes a block; executes it during initialization", () => {
    let state = "not invoked";
    let object: Context | null = null;
    const instance = Cache.new(app, {}, (cache) => {
      object = cache;
      state = "invoked";
      expect(rbObjRespondTo(cache, "set")).toBeTruthy();
    });
    expect(state).toEqual("invoked");
    expect(object).toEqual(instance);
  });
});
