import { describe, it, expect } from "vitest";
import { RequestId } from "../middleware/request-id.js";
import { Request } from "../http/request.js";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { Lint, MockRequest } from "@blazetrails/rack";

async function stubRequest(env: RackEnv = {}, { header = "x-request-id" } = {}): Promise<Request> {
  const app = async (_env: RackEnv): Promise<RackResponse> => [200, {}, []];
  env = MockRequest.envFor("", env);

  await new Lint((e) => new RequestId(new Lint(app), { header: header }).call(e)).call(env);

  return new Request(env);
}

describe("RequestIdTest", () => {
  it("passing on the request id from the outside", async () => {
    expect((await stubRequest({ HTTP_X_REQUEST_ID: "external-uu-rid" })).requestId).toBe(
      "external-uu-rid",
    );
  });

  it("passing on the request id via a configured header", async () => {
    expect(
      (await stubRequest({ HTTP_TRACER_ID: "external-uu-rid" }, { header: "tracer-id" })).requestId,
    ).toBe("external-uu-rid");
  });

  it("ensure that only alphanumeric uurids are accepted", async () => {
    expect((await stubRequest({ HTTP_X_REQUEST_ID: "; X-Hacked-Header: Stuff" })).requestId).toBe(
      "X-Hacked-HeaderStuff",
    );
  });

  it("accept Apache mod_unique_id format", async () => {
    const modUniqueId = "abcxyz@ABCXYZ-0123456789";
    expect((await stubRequest({ HTTP_X_REQUEST_ID: modUniqueId })).requestId).toBe(modUniqueId);
  });

  it("ensure that 255 char limit on the request id is being enforced", async () => {
    expect((await stubRequest({ HTTP_X_REQUEST_ID: "X".repeat(500) })).requestId).toBe(
      "X".repeat(255),
    );
  });

  it("generating a request id when none is supplied", async () => {
    expect((await stubRequest()).requestId).toMatch(/\w+-\w+-\w+-\w+-\w+/);
  });

  it("uuid alias", async () => {
    expect((await stubRequest({ HTTP_X_REQUEST_ID: "external-uu-rid" })).uuid).toBe(
      "external-uu-rid",
    );
  });
});

describe("RequestIdResponseTest", () => {
  const index = async (_env: RackEnv): Promise<RackResponse> => [200, {}, []];

  function app(header: string) {
    return new Lint((e) => new RequestId(new Lint(index), { header }).call(e));
  }

  it("request id is passed all the way to the response", async () => {
    const [, headers] = await app("X-Request-Id").call(MockRequest.envFor("/"));
    expect(headers["x-request-id"]).toMatch(/\w+/);
  });

  it("request id given on request is passed all the way to the response", async () => {
    const [, headers] = await app("X-Request-Id").call(
      MockRequest.envFor("/", { HTTP_X_REQUEST_ID: "X".repeat(500) }),
    );
    expect(headers["x-request-id"]).toBe("X".repeat(255));
  });

  it("using a custom request_id header key", async () => {
    const [, headers] = await app("X-Tracer-Id").call(MockRequest.envFor("/"));
    expect(headers["x-tracer-id"]).toMatch(/\w+/);
  });
});
