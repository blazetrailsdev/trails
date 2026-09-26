import { describe, expect, it } from "vitest";
import { MockRequest } from "@blazetrails/rack";
import { Engine } from "./engine.js";
import { Application } from "./application.js";
import { Trailtie } from "./trailtie.js";

describe("Engine#buildRequest", () => {
  it("merges env_config and sets routes and engine_script_name on the request", () => {
    class RequestEngine extends Engine {}
    Trailtie.register(RequestEngine);
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
    const env = MockRequest.envFor("/posts?page=2", { SCRIPT_NAME: "/app" });

    RequestApp.instance().buildRequest(env);

    expect(env["ORIGINAL_FULLPATH"]).toBe("/app/posts?page=2");
    expect(env["ORIGINAL_SCRIPT_NAME"]).toBe("/app");
  });
});
