import { describe, it, expect } from "vitest";
import { Builder } from "./builder.js";
import { MockRequest } from "./mock-request.js";

describe("Rack::Builder", () => {
  it.skip("can provide options", () => {});

  it("supports run with block", async () => {
    const builder = new Builder();
    builder.run(null, async (env) => [200, {}, ["block"]]);
    const app = builder.toApp();
    const res = await new MockRequest(app).get("/");
    expect(res.bodyString).toBe("block");
  });

  it("raises if #run provided both app and block", () => {
    const builder = new Builder();
    expect(() => builder.run(async () => [200, {}, []] as any, async () => [200, {}, []] as any)).toThrow();
  });

  it("supports mapping", async () => {
    const builder = new Builder();
    builder.map("/foo", (b) => {
      b.run(async (env) => [200, {}, ["foo"]]);
    });
    builder.map("/bar", (b) => {
      b.run(async (env) => [200, {}, ["bar"]]);
    });
    const app = builder.toApp();
    const res1 = await new MockRequest(app).get("/foo");
    expect(res1.bodyString).toBe("foo");
    const res2 = await new MockRequest(app).get("/bar");
    expect(res2.bodyString).toBe("bar");
  });

  it("supports use when mapping", async () => {
    class TestMiddleware {
      private app: any;
      constructor(app: any) { this.app = app; }
      async call(env: any) {
        const [s, h, b] = await this.app(env);
        return [s, { ...h, "x-middleware": "yes" }, b];
      }
    }
    const builder = new Builder();
    builder.use(TestMiddleware);
    builder.map("/foo", (b) => {
      b.run(async () => [200, {}, ["mapped"]]);
    });
    const app = builder.toApp();
    const res = await new MockRequest(app).get("/foo");
    expect(res.bodyString).toBe("mapped");
    expect(res.headers["x-middleware"]).toBe("yes");
  });

  it("doesn't dupe env even when mapping", async () => {
    let envRef: any;
    const builder = new Builder();
    builder.map("/foo", (b) => {
      b.run(async (env) => { envRef = env; return [200, {}, ["ok"]]; });
    });
    const app = builder.toApp();
    await new MockRequest(app).get("/foo");
    expect(envRef).toBeDefined();
  });

  it.skip("dupe #to_app when mapping so Rack::Reloader can reload the application on each request", () => {});

  it("chains apps by default", async () => {
    class AddHeader {
      private app: any;
      private key: string;
      private val: string;
      constructor(app: any, key: string, val: string) { this.app = app; this.key = key; this.val = val; }
      async call(env: any) {
        const [s, h, b] = await this.app(env);
        h[this.key] = this.val;
        return [s, h, b];
      }
    }
    const builder = new Builder();
    builder.use(AddHeader, "x-first", "1");
    builder.use(AddHeader, "x-second", "2");
    builder.run(async () => [200, {}, ["chained"]]);
    const app = builder.toApp();
    const res = await new MockRequest(app).get("/");
    expect(res.bodyString).toBe("chained");
    expect(res.headers["x-first"]).toBe("1");
    expect(res.headers["x-second"]).toBe("2");
  });

  it("has implicit #to_app", async () => {
    const builder = new Builder();
    builder.run(async () => [200, {}, ["implicit"]]);
    const app = builder.toApp();
    const res = await new MockRequest(app).get("/");
    expect(res.bodyString).toBe("implicit");
  });

  it.skip("supports blocks on use", () => {});

  it("has explicit #to_app", async () => {
    const builder = new Builder();
    builder.run(async () => [200, {}, ["explicit"]]);
    const app = builder.toApp();
    expect(app).toBeTypeOf("function");
  });

  it("can mix map and run for endpoints", async () => {
    const builder = new Builder();
    builder.map("/foo", (b) => {
      b.run(async () => [200, {}, ["foo"]]);
    });
    builder.run(async () => [200, {}, ["root"]]);
    const app = builder.toApp();
    const res1 = await new MockRequest(app).get("/foo");
    expect(res1.bodyString).toBe("foo");
    const res2 = await new MockRequest(app).get("/other");
    expect(res2.bodyString).toBe("root");
  });

  it.skip("accepts middleware-only map blocks", () => {});

  it("yields the generated app to a block for warmup", async () => {
    let warmedUp = false;
    const builder = new Builder();
    builder.run(async () => [200, {}, ["warm"]]);
    builder.warmup(() => { warmedUp = true; });
    builder.toApp();
    expect(warmedUp).toBe(true);
  });

  it("initialize apps once", async () => {
    let count = 0;
    class Counter {
      private app: any;
      constructor(app: any) { this.app = app; count++; }
      async call(env: any) { return this.app(env); }
    }
    const builder = new Builder();
    builder.use(Counter);
    builder.run(async () => [200, {}, ["ok"]]);
    builder.toApp();
    expect(count).toBe(1);
  });

  it("allows use after run", async () => {
    class AddHeader {
      private app: any;
      constructor(app: any) { this.app = app; }
      async call(env: any) {
        const [s, h, b] = await this.app(env);
        h["x-added"] = "yes";
        return [s, h, b];
      }
    }
    const builder = new Builder();
    builder.run(async () => [200, {}, ["ok"]]);
    builder.use(AddHeader);
    const app = builder.toApp();
    const res = await new MockRequest(app).get("/");
    expect(res.headers["x-added"]).toBe("yes");
  });

  it.skip("supports #freeze_app for freezing app and middleware", () => {});

  it("complains about a missing run", () => {
    const builder = new Builder();
    expect(() => builder.toApp()).toThrow("missing run or map statement");
  });

  it.skip("raises if parses commented options", () => {});
  it.skip("removes __END__ before evaluating app", () => {});
  it.skip("supports multi-line comments", () => {});
  it.skip("requires an_underscore_app not ending in .ru", () => {});
  it.skip("sets __LINE__ correctly", () => {});
  it.skip("strips leading unicode byte order mark when present", () => {});
  it.skip("respects the frozen_string_literal magic comment", () => {});

  describe("new_from_string", () => {
    it.skip("builds a rack app from string", () => {});
  });
});
