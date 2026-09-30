import { describe, expect, it } from "vitest";
import { MockRequest } from "@blazetrails/rack";
import { Engine } from "./engine.js";
import { Application } from "./application.js";

describe("Engine#buildRequest", () => {
  it("merges env_config and sets routes and engine_script_name on the request", () => {
    class RequestEngine extends Engine {}
    Engine.register(
      RequestEngine,
      new URL("./__fixtures__/initializer-engine", import.meta.url).pathname,
    );
    const engine = RequestEngine.instance();
    engine.envConfig()["engine.flag"] = "on";
    const env = MockRequest.envFor("/bukkits/posts", { SCRIPT_NAME: "/bukkits" });

    const req = engine.buildRequest(env);

    expect(env["engine.flag"]).toBe("on");
    expect(req.routes).toBe(engine.routes());
    expect(req.engineScriptName(engine.routes())).toBe("/bukkits");
  });

  it("Application#buildRequest records ORIGINAL_FULLPATH and ORIGINAL_SCRIPT_NAME", () => {
    class RequestApp extends Application {}
    Application.register(RequestApp);
    RequestApp.instance().config.secretKeyBase = "b3c631c314c0bbca50c1b2843150fe33";
    const env = MockRequest.envFor("/posts?page=2", { SCRIPT_NAME: "/app" });

    RequestApp.instance().buildRequest(env);

    expect(env["ORIGINAL_FULLPATH"]).toBe("/app/posts?page=2");
    expect(env["ORIGINAL_SCRIPT_NAME"]).toBe("/app");
  });
});

describe("Railtie class-level method_missing", () => {
  it("forwards routes and call to the instance, so RoutesInspector prints a mounted Engine's routes", async () => {
    await import("./rails.js");
    const { RouteSet, RoutesInspector, ConsoleFormatter } = await import("@blazetrails/actionpack");
    class BlogEngine extends Engine {
      static inspect(): string {
        return "Blog::Engine";
      }
    }
    Engine.register(
      BlogEngine,
      new URL("./__fixtures__/initializer-engine", import.meta.url).pathname,
    );
    const blog = BlogEngine as unknown as typeof BlogEngine & Pick<Engine, "routes">;
    expect(blog.routes()).toBe(BlogEngine.instance().routes());
    blog.routes().draw((r) => {
      r.get("/cart", { to: "cart#show" });
    });

    const set = new RouteSet();
    set.draw((r) => {
      r.mount(BlogEngine as never, { at: "/blog", as: "blog" });
    });
    const output = new RoutesInspector(set.routes.routes).format(new ConsoleFormatter.Sheet());

    expect(output).toContain("Routes for Blog::Engine:");
    expect(output).toContain("cart GET  /cart(.:format) cart#show");
  });
});
