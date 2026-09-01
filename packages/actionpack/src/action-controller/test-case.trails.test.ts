// Trails-only cover: `TestRequest#assignParameters`' custom-parser fallback for
// a content type `Mime::Type` does not register. Rails raises
// `Unknown Content-Type` here instead (`action_controller/test_case.rb:119-121`)
// and has no counterpart test; the behaviour is tracked for convergence by
// actionpack-assign-parameters-raises-on-unknown-content-type.
import { describe, it, expect } from "vitest";
import { TestRequest } from "./test-case.js";

describe("TestRequest#assignParameters custom parser key", () => {
  it("keys the custom parser by the stripped, lowercased media type", () => {
    const req = TestRequest.create();
    req.setHeader("REQUEST_METHOD", "POST");
    req.setHeader("CONTENT_TYPE", "Application/Vnd.Custom+Json; charset=utf-8");
    req.assignParameters(null, "api", "create", { x: "1" }, "/api", ["x"]);
    expect(req.requestParameters).toMatchObject({ x: "1" });
  });
});
