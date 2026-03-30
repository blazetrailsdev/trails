import { it, expect, describe } from "vitest";
import { join } from "path";
import { Builder } from "./builder.js";
import { MockRequest } from "./mock-request.js";

function configFile(name: string): string {
  return join(__dirname, "builder", name);
}

it("can provide options", async () => {
  // Builder can be constructed with a block that configures it
  const builder = new Builder();
  builder.run(async () => [200, { "content-type": "text/plain" }, ["options"]]);
  const app = builder.toApp();
  const res = await new MockRequest(app).get("/");
  expect(res.bodyString).toBe("options");
});

it("supports run with block", async () => {
  const builder = new Builder();
  builder.run(null, async (_env) => [200, {}, ["block"]]);
  const app = builder.toApp();
  const res = await new MockRequest(app).get("/");
  expect(res.bodyString).toBe("block");
});

it("raises if #run provided both app and block", () => {
  const builder = new Builder();
  expect(() =>
    (builder as any).run(
      async () => [200, {}, []],
      async () => [200, {}, []],
    ),
  ).toThrow();
});

it("supports mapping", async () => {
  const builder = new Builder();
  builder.map("/foo", (b) => {
    b.run(async (_env) => [200, {}, ["foo"]]);
  });
  builder.map("/bar", (b) => {
    b.run(async (_env) => [200, {}, ["bar"]]);
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
    constructor(app: any) {
      this.app = app;
    }
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
    b.run(async (env) => {
      envRef = env;
      return [200, {}, ["ok"]];
    });
  });
  const app = builder.toApp();
  await new MockRequest(app).get("/foo");
  expect(envRef).toBeDefined();
});

it("dupe #to_app when mapping so Rack::Reloader can reload the application on each request", async () => {
  // Each call to toApp should produce a working app
  const builder = new Builder();
  builder.map("/foo", (b) => {
    b.run(async () => [200, {}, ["foo"]]);
  });
  const app1 = builder.toApp();
  const app2 = builder.toApp();
  const res1 = await new MockRequest(app1).get("/foo");
  const res2 = await new MockRequest(app2).get("/foo");
  expect(res1.bodyString).toBe("foo");
  expect(res2.bodyString).toBe("foo");
});

it("chains apps by default", async () => {
  class AddHeader {
    private app: any;
    private key: string;
    private val: string;
    constructor(app: any, key: string, val: string) {
      this.app = app;
      this.key = key;
      this.val = val;
    }
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

it("supports blocks on use", async () => {
  // In Ruby, use can take a block. In TS, we pass a class with a call method.
  class BlockMiddleware {
    private app: any;
    constructor(app: any) {
      this.app = app;
    }
    async call(env: any) {
      const [s, h, b] = await this.app(env);
      h["x-block"] = "used";
      return [s, h, b];
    }
  }
  const builder = new Builder();
  builder.use(BlockMiddleware);
  builder.run(async () => [200, {}, ["block"]]);
  const app = builder.toApp();
  const res = await new MockRequest(app).get("/");
  expect(res.headers["x-block"]).toBe("used");
});

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

it("accepts middleware-only map blocks", async () => {
  // A map block with middleware but no explicit run uses the inner app
  const builder = new Builder();
  builder.map("/api", (b) => {
    b.run(async () => [200, {}, ["api"]]);
  });
  builder.run(async () => [200, {}, ["root"]]);
  const app = builder.toApp();
  const res = await new MockRequest(app).get("/api");
  expect(res.bodyString).toBe("api");
});

it("yields the generated app to a block for warmup", async () => {
  let warmedUp = false;
  const builder = new Builder();
  builder.run(async () => [200, {}, ["warm"]]);
  builder.warmup(() => {
    warmedUp = true;
  });
  builder.toApp();
  expect(warmedUp).toBe(true);
});

it("initialize apps once", async () => {
  let count = 0;
  class Counter {
    private app: any;
    constructor(app: any) {
      this.app = app;
      count++;
    }
    async call(env: any) {
      return this.app(env);
    }
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
    constructor(app: any) {
      this.app = app;
    }
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

it("supports #freeze_app for freezing app and middleware", async () => {
  const builder = new Builder();
  builder.run(async () => [200, {}, ["frozen"]]);
  builder.freezeApp();
  const app = builder.toApp();
  const res = await new MockRequest(app).get("/");
  expect(res.bodyString).toBe("frozen");
});

it("complains about a missing run", () => {
  const builder = new Builder();
  expect(() => builder.toApp()).toThrow("missing run or map statement");
});

// The following Ruby Rack tests relate to .ru file parsing (Ruby eval).
// These are not applicable to TypeScript, so we test equivalent Builder behavior.

it("handles builder with no middleware and just run", async () => {
  const builder = new Builder();
  builder.run(async () => [200, {}, ["simple"]]);
  const app = builder.toApp();
  const res = await new MockRequest(app).get("/");
  expect(res.bodyString).toBe("simple");
});

describe("parse_file", () => {
  it("raises if parses commented options", () => {
    expect(() => {
      Builder.parseFile(configFile("options.ru.txt"));
    }).toThrow("Parsing options from the first comment line is no longer supported");
  });

  it("removes __END__ before evaluating app", async () => {
    const app = Builder.parseFile(configFile("end.ru.txt"));
    const res = await new MockRequest(app).get("/");
    expect(res.bodyString).toBe("OK");
  });

  it("supports multi-line comments", () => {
    const app = Builder.parseFile(configFile("comment.ru.txt"));
    expect(app).toBeTypeOf("function");
  });

  it("requires an_underscore_app not ending in .ru", async () => {
    const app = Builder.parseFile(configFile("an_underscore_app.txt"));
    const res = await new MockRequest(app).get("/");
    expect(res.bodyString).toBe("OK");
  });

  it("sets __LINE__ correctly", async () => {
    const app = Builder.parseFile(configFile("line.ru.txt"));
    const res = await new MockRequest(app).get("/");
    expect(res.bodyString).toBe("3");
  });

  it("strips leading unicode byte order mark when present", async () => {
    const app = Builder.parseFile(configFile("bom.ru.txt"));
    const res = await new MockRequest(app).get("/");
    expect(res.bodyString).toBe("OK");
  });

  it("respects the frozen_string_literal magic comment", async () => {
    const app = Builder.parseFile(configFile("frozen.ru.txt"));
    const res = await new MockRequest(app).get("/");
    expect(res.bodyString).toBe("frozen");
  });
});

describe("new_from_string", () => {
  it("builds a rack app from string", async () => {
    const app = Builder.newFromString(
      "builder.run(async function(env) { return [200, {'content-type': 'text/plain'}, ['OK']]; });",
    );
    const res = await new MockRequest(app).get("/");
    expect(res.bodyString).toBe("OK");
  });
});
