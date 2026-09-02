import { expect, it } from "vitest";

import { MockRequest } from "./mock-request.js";

it("copies a String key that spells an option name into the env", () => {
  const env = MockRequest.envFor("/", { input: "cgi", method: "cgi", ":method": "post" });

  expect(env["input"]).toBe("cgi");
  expect(env["method"]).toBe("cgi");
  expect(env["REQUEST_METHOD"]).toBe("POST");
  expect(env["rack.input"]).toBeUndefined();
});
