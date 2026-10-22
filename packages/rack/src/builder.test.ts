import { it, expect, describe } from "vitest";
import { Builder } from "./builder.js";
import { File, RuntimeError, block, rbObjId } from "@blazetrails/ruby-compat";
import { Lint } from "./lint.js";
import { MockRequest } from "./mock-request.js";
import { ContentLength } from "./content-length.js";
import { ShowExceptions } from "./show-exceptions.js";
import { Basic } from "./auth/basic.js";

class NothingMiddleware {
  static _env: Record<string, any>;
  private app: any;
  constructor(app: any, _options: Record<string, unknown> = {}) {
    this.app = app;
  }
  call(env: Record<string, any>) {
    NothingMiddleware._env = env;
    const response = this.app.call(env);
    return response;
  }
  static get env() {
    return NothingMiddleware._env;
  }
}

describe("Rack::Builder", () => {
  function builder(block?: (b: Builder) => void) {
    return new Lint(new Builder(null, {}, block));
  }

  function builderToApp(block?: (b: Builder) => void) {
    return new Lint(new Builder(null, {}, block).toApp());
  }

  it("can provide options", () => {
    const builder = new Builder(null, { foo: ":bar" });
    expect(builder.options.foo).toEqual(":bar");
  });

  it("supports run with block", async () => {
    const app = builderToApp((b) => {
      b.run(null, (_env) => [200, { "content-type": "text/plain" }, ["OK"]]);
    });
    expect((await new MockRequest(app).get("/")).body.toString()).toEqual("OK");
  });

  it("supports mapping", async () => {
    const app = builderToApp((b) => {
      b.map("/", (b) => {
        b.run((_innerEnv) => [200, { "content-type": "text/plain" }, ["root"]]);
      });
      b.map("/sub", (b) => {
        b.run((_innerEnv) => [200, { "content-type": "text/plain" }, ["sub"]]);
      });
    });
    expect((await new MockRequest(app).get("/")).body.toString()).toEqual("root");
    expect((await new MockRequest(app).get("/sub")).body.toString()).toEqual("sub");
  });

  it("supports use when mapping", async () => {
    const app = builderToApp((b) => {
      b.map("/sub", (b) => {
        b.use(ContentLength);
        b.run((_innerEnv) => [200, { "content-type": "text/plain" }, ["sub"]]);
      });
      b.use(ContentLength);
      b.run((_innerEnv) => [200, { "content-type": "text/plain" }, ["root"]]);
    });
    expect((await new MockRequest(app).get("/")).headers["content-length"]).toEqual("4");
    expect((await new MockRequest(app).get("/sub")).headers["content-length"]).toEqual("3");
  });

  it("doesn't dupe env even when mapping", async () => {
    const app = builderToApp((b) => {
      b.use(NothingMiddleware, { noop: ":noop" });
      b.map("/", (b) => {
        b.run((innerEnv) => {
          innerEnv["new_key"] = "new_value";
          return [200, { "content-type": "text/plain" }, ["root"]];
        });
      });
    });
    expect((await new MockRequest(app).get("/")).body.toString()).toEqual("root");
    expect(NothingMiddleware.env["new_key"]).toEqual("new_value");
  });

  it("dupe #to_app when mapping so Rack::Reloader can reload the application on each request", async () => {
    const app = builder((b) => {
      b.map("/", (b) => {
        b.run((_env) => [200, { "content-type": "text/plain" }, [rbObjId(b).toString()]]);
      });
    });

    const builderApp1Id = (await new MockRequest(app).get("/")).body.toString();
    const builderApp2Id = (await new MockRequest(app).get("/")).body.toString();

    expect(builderApp2Id).not.toEqual(builderApp1Id);
  });

  it("chains apps by default", async () => {
    const app = builderToApp((b) => {
      b.use(ShowExceptions);
      b.run((_env) => {
        throw new RuntimeError("bzzzt");
      });
    });

    expect((await new MockRequest(app).get("/")).isServerError).toBeTruthy();
    expect((await new MockRequest(app).get("/")).isServerError).toBeTruthy();
    expect((await new MockRequest(app).get("/")).isServerError).toBeTruthy();
  });

  it("has implicit #to_app", async () => {
    const app = builder((b) => {
      b.use(ShowExceptions);
      b.run((_env) => {
        throw new RuntimeError("bzzzt");
      });
    });

    expect((await new MockRequest(app).get("/")).isServerError).toBeTruthy();
    expect((await new MockRequest(app).get("/")).isServerError).toBeTruthy();
    expect((await new MockRequest(app).get("/")).isServerError).toBeTruthy();
  });

  it("supports blocks on use", async () => {
    const app = builder((b) => {
      b.use(ShowExceptions);
      b.use(
        Basic,
        undefined,
        block((username: string, password: string) => "secret" === password),
      );

      b.run((_env) => [200, { "content-type": "text/plain" }, ["Hi Boss"]]);
    });

    let response = await new MockRequest(app).get("/");
    expect(response.isClientError).toBeTruthy();
    expect(response.status).toEqual(401);

    response = await new MockRequest(app).get("/", {
      HTTP_AUTHORIZATION: "Basic " + btoa("joe:secret") + "\n",
    });
    expect(response.status).toEqual(200);
    expect(response.body.toString()).toEqual("Hi Boss");
  });

  it("has explicit #to_app", async () => {
    const app = builder((b) => {
      b.use(ShowExceptions);
      b.run((_env) => {
        throw new RuntimeError("bzzzt");
      });
    });

    expect((await new MockRequest(app).get("/")).isServerError).toBeTruthy();
    expect((await new MockRequest(app).get("/")).isServerError).toBeTruthy();
    expect((await new MockRequest(app).get("/")).isServerError).toBeTruthy();
  });

  it("can mix map and run for endpoints", async () => {
    const app = builder((b) => {
      b.map("/sub", (b) => {
        b.run((_innerEnv) => [200, { "content-type": "text/plain" }, ["sub"]]);
      });
      b.run((_innerEnv) => [200, { "content-type": "text/plain" }, ["root"]]);
    });

    expect((await new MockRequest(app).get("/")).body.toString()).toEqual("root");
    expect((await new MockRequest(app).get("/sub")).body.toString()).toEqual("sub");
  });

  it("accepts middleware-only map blocks", async () => {
    const app = builder((b) => {
      b.map("/foo", (b) => {
        b.use(ShowExceptions);
      });
      b.run((_env) => {
        throw new RuntimeError("bzzzt");
      });
    });

    await expect(new MockRequest(app).get("/")).rejects.toThrow(RuntimeError);
    expect((await new MockRequest(app).get("/foo")).isServerError).toBeTruthy();
  });

  it("yields the generated app to a block for warmup", () => {
    let warmedUpApp: unknown = null;

    const app = new Builder(null, {}, (b) => {
      b.warmup((a) => {
        warmedUpApp = a;
      });
      b.run((_env) => [200, {}, []]);
    }).toApp();

    expect(warmedUpApp).toEqual(app);
  });

  it("initialize apps once", async () => {
    const app = builder((b) => {
      class AppClass {
        private called: number;
        constructor() {
          this.called = 0;
        }
        call(_env: Record<string, any>) {
          if (this.called > 0) throw new RuntimeError("bzzzt");
          this.called += 1;
          return [200, { "content-type": "text/plain" }, ["OK"]];
        }
      }

      b.use(ShowExceptions);
      b.run(new AppClass());
    });

    expect((await new MockRequest(app).get("/")).status).toEqual(200);
    expect((await new MockRequest(app).get("/")).isServerError).toBeTruthy();
  });

  it("allows use after run", async () => {
    const app = builder((b) => {
      b.run((_env) => {
        throw new RuntimeError("bzzzt");
      });
      b.use(ShowExceptions);
    });

    expect((await new MockRequest(app).get("/")).isServerError).toBeTruthy();
    expect((await new MockRequest(app).get("/")).isServerError).toBeTruthy();
    expect((await new MockRequest(app).get("/")).isServerError).toBeTruthy();
  });

  it("supports #freeze_app for freezing app and middleware", async () => {
    const app = builder((b) => {
      b.freezeApp();
      b.use(ShowExceptions);
      b.use(
        class {
          app: any;
          a?: number;
          constructor(app: any) {
            this.app = app;
          }
          call(env: Record<string, any>) {
            if (env["PATH_INFO"] === "/a") this.a = 1;
            return this.app.call(env);
          }
        },
      );
      const o = {
        a: undefined as number | undefined,
        call(env: Record<string, any>) {
          if (env["PATH_INFO"] === "/b") this.a = 1;
          return [200, {}, []];
        },
      };
      b.run(o);
    });

    expect((await new MockRequest(app).get("/a")).isServerError).toBeTruthy();
    expect((await new MockRequest(app).get("/b")).isServerError).toBeTruthy();
    expect((await new MockRequest(app).get("/c")).status).toEqual(200);
  });

  it("complains about a missing run", () => {
    expect(() => {
      new Lint(
        Builder.app(null, (b) => {
          b.use(ShowExceptions);
        }),
      );
    }).toThrow(RuntimeError);
  });

  describe("parse_file", () => {
    function configFile(name: string) {
      return File.join(__dirname, "../test/builder", name);
    }

    it("raises if parses commented options", () => {
      let error: unknown;
      expect(() => {
        try {
          Builder.parseFile(configFile("options.ru"));
        } catch (e) {
          error = e;
          throw e;
        }
      }).toThrow(RuntimeError);
      expect((error as Error).message).toContain(
        "Parsing options from the first comment line is no longer supported",
      );
    });

    it("removes __END__ before evaluating app", async () => {
      const app = Builder.parseFile(configFile("end.ru"));
      expect((await new MockRequest(app).get("/")).body.toString()).toEqual("OK");
    });

    it("supports multi-line comments", () => {
      const app = Builder.parseFile(configFile("comment.ru"));
      expect(app).toBeInstanceOf(Function);
    });

    it("requires an_underscore_app not ending in .ru", async () => {
      const app = Builder.parseFile(configFile("an_underscore_app.rb"));
      expect((await new MockRequest(app).get("/")).body.toString()).toEqual("OK");
    });

    it("sets __LINE__ correctly", async () => {
      const app = Builder.parseFile(configFile("line.ru"));
      expect((await new MockRequest(app).get("/")).body.toString()).toEqual("3");
    });

    it("strips leading unicode byte order mark when present", async () => {
      const app = Builder.parseFile(configFile("bom.ru"));
      expect((await new MockRequest(app).get("/")).body.toString()).toEqual("OK");
    });

    it("respects the frozen_string_literal magic comment", async () => {
      const app = Builder.parseFile(configFile("frozen.ru"));
      const response = await new MockRequest(app).get("/");
      expect(response.body).toEqual("frozen");
      const body = (response as any)._body;
      expect(body).toEqual(["frozen"]);
      expect(Object.isFrozen(body[0])).toEqual(true);
    });
  });

  describe("new_from_string", () => {
    it("builds a rack app from string", async () => {
      const app = Builder.newFromString(
        "builder.run(function (env) { return [200, { 'content-type': 'text/plane' }, ['OK']]; });",
      );
      expect((await new MockRequest(app).get("/")).body.toString()).toEqual("OK");
    });
  });
});
