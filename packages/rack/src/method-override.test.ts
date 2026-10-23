import { it, expect } from "vitest";
import { MethodOverride } from "./method-override.js";
import { MockRequest } from "./mock-request.js";
import { b, StringIO } from "@blazetrails/ruby-compat";
import { Lint } from "./lint.js";

const echoApp = async (env: Record<string, any>) => {
  return [200, { "content-type": "text/plain" }, [env["REQUEST_METHOD"]]] as [
    number,
    Record<string, string>,
    any,
  ];
};

function makeApp(app = echoApp) {
  return new MethodOverride(app);
}

function app() {
  return new Lint(new MethodOverride(async () => [200, { "content-type": "text/plain" }, []]));
}

it("not affect GET requests", async () => {
  const res = await new MockRequest((env) => makeApp().call(env)).get("/");
  expect(res.body).toBe("GET");
});

it("sets rack.errors for invalid UTF8 _method values", async () => {
  const errors = new StringIO();
  const env = MockRequest.envFor("/", {
    ":method": "POST",
    ":input": new Uint8Array([...b("_method="), 0xbf]),
    "rack.errors": errors,
  });

  await app().call(env);

  errors.rewind();
  expect(errors.read()).toBe("Invalid string for method\n");
  expect(env["REQUEST_METHOD"]).toBe("POST");
});

it("modify REQUEST_METHOD for POST requests when _method parameter is set", async () => {
  const res = await new MockRequest((env) => makeApp().call(env)).post("/", {
    ":input": "_method=put",
  });
  expect(res.body).toBe("PUT");
});

it("modify REQUEST_METHOD for POST requests when X-HTTP-Method-Override is set", async () => {
  const res = await new MockRequest((env) => makeApp().call(env)).post("/", {
    HTTP_X_HTTP_METHOD_OVERRIDE: "PATCH",
  });
  expect(res.body).toBe("PATCH");
});

it("not modify REQUEST_METHOD if the method is unknown", async () => {
  const res = await new MockRequest((env) => makeApp().call(env)).post("/", {
    ":input": "_method=UNKNOWN",
  });
  expect(res.body).toBe("POST");
});

it("not modify REQUEST_METHOD when _method is nil", async () => {
  const res = await new MockRequest((env) => makeApp().call(env)).post("/", {
    ":input": "",
  });
  expect(res.body).toBe("POST");
});

it("store the original REQUEST_METHOD prior to overriding", async () => {
  const app = new MethodOverride(async (env) => {
    return [200, {}, [env["rack.methodoverride.original_method"] || "none"]];
  });
  const res = await new MockRequest(app).post("/", {
    ":input": "_method=put",
  });
  expect(res.body).toBe("POST");
});

const TRUNCATED_MULTIPART =
  "--AaB03x\r\n" + 'content-disposition: form-data; name="huge"; filename="huge"\r\n';

it("not modify REQUEST_METHOD when given invalid multipart form data", async () => {
  const env = MockRequest.envFor("/", {
    CONTENT_TYPE: "multipart/form-data, boundary=AaB03x",
    CONTENT_LENGTH: String(TRUNCATED_MULTIPART.length),
    ":method": "POST",
    ":input": TRUNCATED_MULTIPART,
  });
  await makeApp().call(env);
  expect(env["REQUEST_METHOD"]).toBe("POST");
});

it("writes error to RACK_ERRORS when given invalid multipart form data", async () => {
  const errors = new StringIO();
  const env = MockRequest.envFor("/", {
    CONTENT_TYPE: "multipart/form-data, boundary=AaB03x",
    CONTENT_LENGTH: String(TRUNCATED_MULTIPART.length),
    "rack.errors": errors,
    ":method": "POST",
    ":input": TRUNCATED_MULTIPART,
  });
  await new MethodOverride(async () => [200, { "content-type": "text/plain" }, []]).call(env);
  expect(errors.string()).toContain("Bad request content body");
});

it("not modify REQUEST_METHOD for POST requests when the params are unparseable because too deep", async () => {
  const env = MockRequest.envFor("/", { ":method": "POST", ":input": "[a]".repeat(36) + "=1" });
  await app().call(env);

  expect(env["REQUEST_METHOD"]).toBe("POST");
});

it("not modify REQUEST_METHOD for POST requests when the params are unparseable", async () => {
  const env = MockRequest.envFor("/", { ":method": "POST", ":input": "(%bad-params%)" });
  await app().call(env);

  expect(env["REQUEST_METHOD"]).toBe("POST");
});

it("not set form input when the content type is JSON", async () => {
  const env = MockRequest.envFor("/", {
    CONTENT_TYPE: "application/json",
    ":method": "POST",
    ":input": '{"_method":"options"}',
  });
  await app().call(env);

  expect(env["REQUEST_METHOD"]).toBe("POST");
  expect(env["rack.request.form_input"]).toBeUndefined();
});
