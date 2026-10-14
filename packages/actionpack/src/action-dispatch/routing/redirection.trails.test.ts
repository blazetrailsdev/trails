import { describe, expect, it } from "vitest";
import { redirect } from "./redirection.js";
import { Request } from "../http/request.js";

describe("ActionDispatch::Routing::Redirection#redirect", () => {
  it("treats a class inheriting a static call as the callable", () => {
    class Base {
      static call(params: Record<string, string>, _request: Request): string {
        return `/to/${params.id}`;
      }
    }
    class Sub extends Base {}

    const endpoint = redirect(Sub);
    expect(endpoint.path({ id: "7" }, new Request({}))).toBe("/to/7");
  });
});

describe("ActionDispatch::Routing::Redirection#redirect with a class", () => {
  it("raises ArgumentError for a class that does not answer call", () => {
    class NotCallable {}
    expect(() => redirect(NotCallable as never)).toThrow("redirection argument not supported");
  });
});
