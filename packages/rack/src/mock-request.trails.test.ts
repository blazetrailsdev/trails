import { expect, it } from "vitest";

import { MockRequest } from "./mock-request.js";

// `env_for`'s option keys are Ruby Symbols, so a String key that happens to
// spell one of them is an ordinary CGI variable and is copied through by the
// `String === field` loop (`rack/lib/rack/mock_request.rb:154-156`).
it("copies a String key that spells an option name into the env", () => {
  const env = MockRequest.envFor("/", { input: "cgi", method: "cgi", ":method": "post" });

  expect(env["input"]).toBe("cgi");
  expect(env["method"]).toBe("cgi");
  expect(env["REQUEST_METHOD"]).toBe("POST");
  expect(env["rack.input"]).toBeUndefined();
});
