import { describe, it, expect } from "vitest";
import { ArgumentError, StringIO } from "@blazetrails/ruby-compat";
import { Recursive, ForwardRequest } from "./recursive.js";
import { RACK_INPUT, RACK_RECURSIVE_INCLUDE, RACK_URL_SCHEME } from "./constants.js";

describe("Recursive#include", () => {
  it("merges Rails' six env keys and keeps PATH_INFO verbatim", async () => {
    let seen: Record<string, any> = {};
    const app = new Recursive(async (env: Record<string, any>) => {
      if (env["PATH_INFO"] === "/outer") {
        return env[RACK_RECURSIVE_INCLUDE](env, "/app/inner?q=1");
      }
      seen = env;
      return [200, {}, []] as any;
    });

    await app.call({
      PATH_INFO: "/outer",
      SCRIPT_NAME: "/app",
      REQUEST_METHOD: "POST",
      QUERY_STRING: "outer=1",
      CONTENT_LENGTH: "5",
      CONTENT_TYPE: "text/plain",
      [RACK_INPUT]: new StringIO("hello"),
    });

    expect(seen["PATH_INFO"]).toBe("/app/inner?q=1");
    expect(seen["QUERY_STRING"]).toBe("outer=1");
    expect(seen["SCRIPT_NAME"]).toBe("/app");
    expect(seen["REQUEST_METHOD"]).toBe("GET");
    expect(seen["CONTENT_LENGTH"]).toBe("0");
    expect(seen["CONTENT_TYPE"]).toBe("");
    expect(seen[RACK_INPUT].read()).toBe("");
  });

  it("raises ArgumentError for a path not below SCRIPT_NAME", async () => {
    const app = new Recursive(async (env: Record<string, any>) =>
      env[RACK_RECURSIVE_INCLUDE](env, "/application"),
    );

    const call = app.call({ PATH_INFO: "/", SCRIPT_NAME: "/app" });
    await expect(call).rejects.toBeInstanceOf(ArgumentError);
    await expect(call).rejects.toThrow("can only include below /app, not /application");
  });
});

describe("ForwardRequest", () => {
  it("builds the forwarded env from the URL", () => {
    const req = new ForwardRequest("https://example.org:8443/app1/quux?meh");

    expect(req.message).toBe("forwarding to https://example.org:8443/app1/quux?meh");
    expect(req.env).toEqual({
      PATH_INFO: "/app1/quux",
      QUERY_STRING: "meh",
      HTTP_HOST: "example.org",
      HTTP_PORT: 8443,
      [RACK_URL_SCHEME]: "https",
    });
  });

  it("takes the scheme's default port and leaves a relative URL's other keys unset", () => {
    expect(new ForwardRequest("http://example.org/x").env["HTTP_PORT"]).toBe(80);
    expect(new ForwardRequest("/not-found").env).toEqual({ PATH_INFO: "/not-found" });
  });
});
