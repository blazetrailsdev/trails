// Trails-only cover: `TestRequest#assignParameters`' custom-parser fallback for
// a content type `Mime::Type` does not register. Rails raises
// `Unknown Content-Type` here instead (`action_controller/test_case.rb:119-121`)
// and has no counterpart test; the behaviour is tracked for convergence by
// actionpack-assign-parameters-raises-on-unknown-content-type.
import { getRubyClassPath } from "@blazetrails/rack-session";
import { describe, it, expect } from "vitest";
import { TestRequest, TestSession } from "./test-case.js";

describe("TestRequest#assignParameters custom parser key", () => {
  it("keys the custom parser by the stripped, lowercased media type", () => {
    const req = TestRequest.create();
    req.setHeader("REQUEST_METHOD", "POST");
    req.setHeader("CONTENT_TYPE", "Application/Vnd.Custom+Json; charset=utf-8");
    req.assignParameters(null, "api", "create", { x: "1" }, "/api", ["x"]);
    expect(req.requestParameters).toMatchObject({ x: "1" });
  });
});

describe("ActionController::TestSession", () => {
  it("registers its Ruby constant path for Session#inspect's not-yet-loaded arm", () => {
    expect(getRubyClassPath(TestSession)).toBe("ActionController::TestSession");
  });
});

// Trails-only cover: `SessionHash#inspect`'s not-yet-loaded arm
// (`vendor/rack-session/lib/rack/session/abstract/id.rb:152-156`) renders the
// Ruby constant path a `TestSession` registers. Ruby reaches an unloaded
// TestSession through `allocate`; `Object.create` is its JS analogue.
describe("TestSession#inspect", () => {
  it("renders the not-yet-loaded arm with the Ruby constant path", () => {
    const session = Object.create(TestSession.prototype) as TestSession;
    expect(session.inspect()).toMatch(
      /^#<ActionController::TestSession:0x[0-9a-f]+ not yet loaded>$/,
    );
  });
});
