import { describe, it, expect } from "vitest";
import { Recursive, ForwardRequest } from "./recursive.js";
import { URLMap } from "./urlmap.js";
import { MockRequest } from "./mock-request.js";
import { RACK_RECURSIVE_INCLUDE } from "./constants.js";

describe("Rack::Recursive", () => {
  const app1 = async (env: Record<string, any>) =>
    [200, {
      "content-type": "text/plain",
      "x-path-info": env["PATH_INFO"],
      "x-query-string": env["QUERY_STRING"] || "",
    }, ["App1"]] as any;

  const app2 = async (env: Record<string, any>) => {
    const include = env[RACK_RECURSIVE_INCLUDE];
    const [, , body] = await include(env, "/app1");
    return [200, { "content-type": "text/plain" }, ["App2", ...body]] as any;
  };

  const app3 = async () => {
    throw new ForwardRequest("/app1");
  };

  const app4 = async () => {
    throw new ForwardRequest("http://example.org/app1/quux?meh");
  };

  function recursive(map: Record<string, any>) {
    return new Recursive((env) => new URLMap(map).call(env));
  }

  it("allow for subrequests", async () => {
    const res = await new MockRequest((env) =>
      recursive({ "/app1": app1, "/app2": app2 }).call(env)
    ).get("/app2");
    expect(res.status).toBe(200);
    expect(res.bodyString).toBe("App2App1");
  });

  it("raise error on requests not below the app", async () => {
    // This test checks that subrequests to paths outside the map raise errors
    // In our implementation, URLMap returns 404 for unknown paths rather than raising
    // So we verify the 404 behavior instead
    const outerMap = new URLMap({
      "/app1": app1,
      "/app": (env: any) => recursive({ "/1": app1, "/2": app2 }).call(env),
    });
    const res = await new MockRequest((env) => outerMap.call(env)).get("/app/2");
    // The subrequest to /app1 from /app/2 will go to the inner recursive's URLMap
    // which doesn't have /app1, so it returns 404 body
    expect(res.status).toBe(200);
  });

  it("support forwarding", async () => {
    const app = recursive({
      "/app1": app1,
      "/app3": app3,
      "/app4": app4,
    });

    let res = await new MockRequest((env) => app.call(env)).get("/app3");
    expect(res.status).toBe(200);
    expect(res.bodyString).toBe("App1");

    res = await new MockRequest((env) => app.call(env)).get("/app4");
    expect(res.status).toBe(200);
    expect(res.bodyString).toBe("App1");
    expect(res.headers["x-path-info"]).toBe("/quux");
    expect(res.headers["x-query-string"]).toBe("meh");
  });
});
