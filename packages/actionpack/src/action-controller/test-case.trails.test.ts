import { describe, it, expect } from "vitest";
import { BigDecimal } from "@blazetrails/activesupport";
import { b, StringIO } from "@blazetrails/ruby-compat";
import { UploadedFile } from "@blazetrails/rack-test";
import { TestRequest, TestSession } from "./test-case.js";
import type { UploadedFile as HttpUploadedFile } from "../action-dispatch/http/upload.js";

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

  it("encodes a :json body with ActiveSupport::JSON.encode", () => {
    const req = TestRequest.create();
    req.setHeader("REQUEST_METHOD", "POST");
    req.setHeader("CONTENT_TYPE", "application/json");
    const price = new BigDecimal("1.50");
    req.assignParameters(null, "api", "create", { price, name: "<b>" }, "/api", ["price", "name"]);
    expect(req.getHeader("rack.input").string()).toBe(`{"price":"1.5","name":"\\u003cb\\u003e"}`);
  });
});

describe("ActionController::TestSession", () => {
  it("registers its Ruby constant path for Session#inspect's not-yet-loaded arm", () => {
    expect(TestSession.name).toBe("ActionController::TestSession");
  });
});

describe("TestRequest#assignParameters multipart body", () => {
  it("parses non-ASCII file bytes and text parts back out of the encoded body", () => {
    const req = TestRequest.create();
    req.setHeader("REQUEST_METHOD", "POST");
    const file = new UploadedFile(new StringIO(b("héllo")), "text/plain", false, {
      originalFilename: "h.txt",
    });
    req.assignParameters(null, "u", "create", { upload: file, t: "café" }, "/u", ["upload", "t"]);
    const body = req.getHeader("rack.input").string();
    expect(req.getHeader("CONTENT_LENGTH")).toBe(String(body.length));
    expect((req.requestParameters["upload"] as HttpUploadedFile).read()).toBe(b("héllo"));
    expect(req.requestParameters["t"]).toBe("café");
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
