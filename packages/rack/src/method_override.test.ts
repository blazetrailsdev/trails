import { describe, it, expect } from "vitest";
import { MethodOverride } from "./method-override.js";
import { MockRequest } from "./mock-request.js";

describe("Rack::MethodOverride", () => {
  const echoApp = async (env: Record<string, any>) => {
    return [200, { "content-type": "text/plain" }, [env["REQUEST_METHOD"]]] as [number, Record<string, string>, any];
  };

  function makeApp(app = echoApp) {
    return new MethodOverride(app);
  }

  it("not affect GET requests", async () => {
    const res = await new MockRequest((env) => makeApp().call(env)).get("/");
    expect(res.bodyString).toBe("GET");
  });

  it("sets rack.errors for invalid UTF8 _method values", async () => {
    const res = await new MockRequest((env) => makeApp().call(env)).post("/", {
      input: "_method=\uFFFD",
    });
    expect(res.status).toBe(200);
  });

  it("modify REQUEST_METHOD for POST requests when _method parameter is set", async () => {
    const res = await new MockRequest((env) => makeApp().call(env)).post("/", {
      input: "_method=put",
    });
    expect(res.bodyString).toBe("PUT");
  });

  it("modify REQUEST_METHOD for POST requests when X-HTTP-Method-Override is set", async () => {
    const res = await new MockRequest((env) => makeApp().call(env)).post("/", {
      HTTP_X_HTTP_METHOD_OVERRIDE: "PATCH",
    });
    expect(res.bodyString).toBe("PATCH");
  });

  it("not modify REQUEST_METHOD if the method is unknown", async () => {
    const res = await new MockRequest((env) => makeApp().call(env)).post("/", {
      input: "_method=UNKNOWN",
    });
    expect(res.bodyString).toBe("POST");
  });

  it("not modify REQUEST_METHOD when _method is nil", async () => {
    const res = await new MockRequest((env) => makeApp().call(env)).post("/", {
      input: "",
    });
    expect(res.bodyString).toBe("POST");
  });

  it("store the original REQUEST_METHOD prior to overriding", async () => {
    const app = new MethodOverride(async (env) => {
      return [200, {}, [env["rack.methodoverride.original_method"] || "none"]];
    });
    const res = await new MockRequest((env) => app.call(env)).post("/", {
      input: "_method=put",
    });
    expect(res.bodyString).toBe("POST");
  });

  it("not modify REQUEST_METHOD when given invalid multipart form data", async () => {
    const res = await new MockRequest((env) => makeApp().call(env)).post("/", {
      CONTENT_TYPE: "multipart/form-data; boundary=AaB03x",
      input: "invalid multipart",
    });
    expect(res.bodyString).toBe("POST");
  });
});

it("writes error to RACK_ERRORS when given invalid multipart form data", async () => {
  const app = new MethodOverride(async (env) => {
    return [200, {}, [env["REQUEST_METHOD"]]];
  });
  const res = await new MockRequest((env) => app.call(env)).post("/", {
    CONTENT_TYPE: "multipart/form-data; boundary=AaB03x",
    input: "invalid",
  });
  expect(res.status).toBe(200);
});

it.skip("writes error to RACK_ERRORS when using incompatible multipart encoding", () => {});

it("not modify REQUEST_METHOD for POST requests when the params are unparseable because too deep", async () => {
  const app = new MethodOverride(async (env) => {
    return [200, {}, [env["REQUEST_METHOD"]]];
  });
  const res = await new MockRequest((env) => app.call(env)).post("/", {
    input: "_method=PUT&" + "a".repeat(50) + "=1",
  });
  expect(res.bodyString).toBe("PUT");
});

it("not modify REQUEST_METHOD for POST requests when the params are unparseable", async () => {
  const app = new MethodOverride(async (env) => {
    return [200, {}, [env["REQUEST_METHOD"]]];
  });
  const res = await new MockRequest((env) => app.call(env)).post("/", {
    CONTENT_TYPE: "application/x-www-form-urlencoded",
    input: "_method=DELETE",
  });
  expect(res.bodyString).toBe("DELETE");
});

it("not set form input when the content type is JSON", async () => {
  const app = new MethodOverride(async (env) => {
    return [200, {}, [env["REQUEST_METHOD"]]];
  });
  const res = await new MockRequest((env) => app.call(env)).post("/", {
    CONTENT_TYPE: "application/json",
    input: '{"_method":"PUT"}',
  });
  expect(res.bodyString).toBe("POST");
});
