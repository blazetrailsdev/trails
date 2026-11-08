import { it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { Recursive, ForwardRequest } from "./recursive.js";
import { Lint } from "./lint.js";
import { URLMap } from "./urlmap.js";
import { MockRequest } from "./mock-request.js";
import { RACK_RECURSIVE_INCLUDE } from "./constants.js";

const app1 = async (env: Record<string, any>) =>
  [
    200,
    {
      "content-type": "text/plain",
      "x-path-info": env["PATH_INFO"],
      "x-query-string": env["QUERY_STRING"] || "",
    },
    ["App1"],
  ] as any;

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
  return new Lint(new Recursive(new URLMap(map)));
}

it("allow for subrequests", async () => {
  const res = await new MockRequest(recursive({ "/app1": app1, "/app2": app2 })).get("/app2");
  expect(res.isOk).toBeTruthy();
  expect(res.body).toBe("App2App1");
});

it("raise error on requests not below the app", async () => {
  const outerMap = new URLMap({
    "/app1": app1,
    "/app": recursive({ "/1": app1, "/2": app2 }),
  });
  const p = new MockRequest(outerMap).get("/app/2");
  await expect(p).rejects.toThrow(ArgumentError);
  expect(((await p.catch((e: unknown) => e)) as ArgumentError).message).toMatch(
    /can only include below/,
  );
});

it("support forwarding", async () => {
  const app = recursive({
    "/app1": app1,
    "/app3": app3,
    "/app4": app4,
  });

  let res = await new MockRequest(app).get("/app3");
  expect(res.isOk).toBeTruthy();
  expect(res.body).toBe("App1");

  res = await new MockRequest(app).get("/app4");
  expect(res.isOk).toBeTruthy();
  expect(res.body).toBe("App1");
  expect(res.headers["x-path-info"]).toBe("/quux");
  expect(res.headers["x-query-string"]).toBe("meh");
});
