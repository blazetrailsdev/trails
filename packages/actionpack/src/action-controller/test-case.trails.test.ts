import { getRubyClassPath } from "@blazetrails/rack-session";
import { describe, it, expect } from "vitest";
import { TestRequest, TestSession } from "./test-case.js";

describe("TestRequest#assignParameters Content-Type case", () => {
  it("raises on a Content-Type no Mime::Type is registered for", () => {
    const req = TestRequest.create();
    req.setHeader("REQUEST_METHOD", "POST");
    req.setHeader("CONTENT_TYPE", "Application/Vnd.Custom+Json; charset=utf-8");
    expect(() => req.assignParameters(null, "api", "create", { x: "1" }, "/api", ["x"])).toThrow(
      "Unknown Content-Type: Application/Vnd.Custom+Json; charset=utf-8",
    );
  });

  it("encodes an :xml body with to_xml", () => {
    const req = TestRequest.create();
    req.setHeader("REQUEST_METHOD", "POST");
    req.setHeader("CONTENT_TYPE", "application/xml");
    req.assignParameters(null, "api", "create", { x: "1" }, "/api", ["x"]);
    expect(req.getHeader("rack.input").string()).toContain("<x>1</x>");
  });
});

describe("ActionController::TestSession", () => {
  it("registers its Ruby constant path for Session#inspect's not-yet-loaded arm", () => {
    expect(getRubyClassPath(TestSession)).toBe("ActionController::TestSession");
  });
});

describe("TestSession#inspect", () => {
  it("renders the not-yet-loaded arm with the Ruby constant path", () => {
    const session = Object.create(TestSession.prototype) as TestSession;
    expect(session.inspect()).toMatch(
      /^#<ActionController::TestSession:0x[0-9a-f]+ not yet loaded>$/,
    );
  });
});
