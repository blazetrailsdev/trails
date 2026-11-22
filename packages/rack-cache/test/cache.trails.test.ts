import { describe, it, expect } from "vitest";
import { Builder, MockRequest, Rack } from "@blazetrails/rack";
import * as Cache from "../lib/cache.js";
import { Context } from "../lib/context.js";

describe("Rack::Cache", () => {
  it("is built by Builder#use as Rack::Builder's middleware.new reaches Rack::Cache.new", async () => {
    let context: unknown = null;
    const app = new Builder(null, {}, (builder: Builder) => {
      builder.use(Rack.Cache, { ":verbose": false }, (cache: Context) => {
        context = cache;
      });
      builder.run(async () => [
        200,
        { "content-type": "text/plain", "cache-control": "max-age=5" },
        ["Hi"],
      ]);
    }).toApp();
    const response = await new MockRequest(app).get("/");
    expect(context).toBeInstanceOf(Context);
    expect(response.body).toEqual("Hi");
    expect(response.get("x-rack-cache")).toEqual("miss, store");
  });

  it("sets an option through Context's included Options#set", () => {
    const context = Cache.new(async () => [200, {}, []]);
    expect(context.set(":default_ttl", 10)).toEqual(10);
    expect(context.defaultTtl).toEqual(10);
    context.set({ "rack-cache.verbose": false });
    expect(context.options["rack-cache.verbose"]).toBe(false);
  });
});
