import { it, expect } from "vitest";
import { StringIO, toEnum } from "@blazetrails/ruby-compat";
import { Head } from "./head.js";
import { Lint } from "./lint.js";
import { MockRequest } from "./mock-request.js";

async function testResponse(headers: Record<string, any> = {}): Promise<[any, StringIO]> {
  const body = new StringIO("foo");
  const app = async () =>
    [200, { "content-type": "test/plain", "content-length": "3" }, body] as any;
  const request = MockRequest.envFor("/", headers);
  const response = await new Lint(new Head(app)).call(request);

  return [response, body];
}

it("response", async () => {
  await testResponse();
});

it("pass GET, POST, PUT, DELETE, OPTIONS, TRACE requests", async () => {
  for (const type of ["GET", "POST", "PUT", "DELETE", "OPTIONS", "TRACE"]) {
    const [resp] = await testResponse({ REQUEST_METHOD: type });

    expect(resp[0]).toBe(200);
    expect(resp[1]).toEqual({ "content-type": "test/plain", "content-length": "3" });
    expect(await toEnum(resp[2]).toA()).toEqual(["foo"]);
  }
});

it("remove body from HEAD requests", async () => {
  const [resp] = await testResponse({ REQUEST_METHOD: "HEAD" });

  expect(resp[0]).toBe(200);
  expect(resp[1]).toEqual({ "content-type": "test/plain", "content-length": "3" });
  expect(await toEnum(resp[2]).toA()).toEqual([]);
});

it("close the body when it is removed", async () => {
  const [resp, body] = await testResponse({ REQUEST_METHOD: "HEAD" });
  expect(resp[0]).toBe(200);
  expect(resp[1]).toEqual({ "content-type": "test/plain", "content-length": "3" });
  expect(await toEnum(resp[2]).toA()).toEqual([]);
  expect(body.isClosed()).toBeFalsy();
  await resp[2].close();
  expect(body.isClosed()).toBeTruthy();
});
