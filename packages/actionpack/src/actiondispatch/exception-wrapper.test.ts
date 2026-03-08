import { describe, it, expect } from "vitest";
import { ExceptionWrapper } from "./exception-wrapper.js";

// ==========================================================================
// dispatch/exception_wrapper_test.rb
// ==========================================================================
describe("ActionDispatch::ExceptionWrapper", () => {
  it("status code for standard error", () => {
    const wrapper = new ExceptionWrapper(new Error("boom"));
    expect(wrapper.statusCode).toBe(500);
  });

  it("status text for standard error", () => {
    const wrapper = new ExceptionWrapper(new Error("boom"));
    expect(wrapper.statusText).toBe("Internal Server Error");
  });

  it("exception name", () => {
    const wrapper = new ExceptionWrapper(new TypeError("bad type"));
    expect(wrapper.exceptionName).toBe("TypeError");
  });

  it("message", () => {
    const wrapper = new ExceptionWrapper(new Error("something broke"));
    expect(wrapper.message).toBe("something broke");
  });

  it("traces returns stack trace lines", () => {
    const wrapper = new ExceptionWrapper(new Error("test"));
    expect(wrapper.traces.length).toBeGreaterThan(0);
    expect(wrapper.traces[0]).toContain("at ");
  });

  it("application trace filters node_modules", () => {
    const wrapper = new ExceptionWrapper(new Error("test"));
    for (const line of wrapper.applicationTrace) {
      expect(line).not.toContain("node_modules");
    }
  });

  it("framework trace includes only node_modules", () => {
    const wrapper = new ExceptionWrapper(new Error("test"));
    for (const line of wrapper.frameworkTrace) {
      expect(line).toContain("node_modules");
    }
  });

  it("source location", () => {
    const wrapper = new ExceptionWrapper(new Error("test"));
    const loc = wrapper.sourceLocation;
    // In test environment, should point to this file
    if (loc) {
      expect(loc.file).toBeTruthy();
      expect(loc.line).toBeGreaterThan(0);
    }
  });

  it("custom exception status registration", () => {
    class CustomNotFound extends Error { name = "CustomNotFound"; }
    ExceptionWrapper.registerStatus("CustomNotFound", 404);
    const wrapper = new ExceptionWrapper(new CustomNotFound("not here"));
    expect(wrapper.statusCode).toBe(404);
    expect(wrapper.statusText).toBe("Not Found");
  });

  it("status code for registered exception name", () => {
    expect(ExceptionWrapper.statusCodeFor("ParameterMissing")).toBe(400);
    expect(ExceptionWrapper.statusCodeFor("UnknownType")).toBe(500);
  });

  it("to response", () => {
    const wrapper = new ExceptionWrapper(new Error("server error"));
    const [status, headers, body] = wrapper.toResponse();
    expect(status).toBe(500);
    expect(headers["content-type"]).toContain("text/plain");
    expect(body).toContain("500");
    expect(body).toContain("server error");
  });

  it("TypeError status code", () => {
    const wrapper = new ExceptionWrapper(new TypeError("bad"));
    expect(wrapper.statusCode).toBe(500);
  });

  it("RangeError status code", () => {
    const wrapper = new ExceptionWrapper(new RangeError("out of range"));
    expect(wrapper.statusCode).toBe(500);
  });

  it("empty stack trace", () => {
    const err = new Error("no stack");
    err.stack = undefined;
    const wrapper = new ExceptionWrapper(err);
    expect(wrapper.traces).toEqual([]);
    expect(wrapper.sourceLocation).toBeNull();
  });

  it("registered NotFoundError maps to 404", () => {
    class NotFoundError extends Error { get name() { return "NotFoundError"; } }
    ExceptionWrapper.registerStatus("NotFoundError", 404);
    const wrapper = new ExceptionWrapper(new NotFoundError("missing"));
    expect(wrapper.statusCode).toBe(404);
  });

  it("registered RoutingError maps to 404", () => {
    expect(ExceptionWrapper.statusCodeFor("RoutingError")).toBe(404);
  });

  it("registered UnknownFormat maps to 406", () => {
    expect(ExceptionWrapper.statusCodeFor("UnknownFormat")).toBe(406);
  });

  it("registered InvalidAuthenticityToken maps to 422", () => {
    expect(ExceptionWrapper.statusCodeFor("InvalidAuthenticityToken")).toBe(422);
  });

  it("application trace and framework trace are disjoint", () => {
    const wrapper = new ExceptionWrapper(new Error("test"));
    const total = wrapper.applicationTrace.length + wrapper.frameworkTrace.length;
    expect(total).toBe(wrapper.traces.length);
  });
});
