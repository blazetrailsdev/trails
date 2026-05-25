import "@blazetrails/actionview/tse-modules";
import { describe, it, expectTypeOf } from "vitest";
import render from "./fixtures/show.html.tse";

describe("ambient declare module '*.tse' (Story 5.10)", () => {
  it("default export is a callable function", () => {
    expectTypeOf(render).toBeFunction();
    expectTypeOf(render).toBeCallableWith({}, { name: "world" });
  });

  it("return type is unknown before trails-tsc narrows it", () => {
    expectTypeOf(render({}, {})).toBeUnknown();
  });

  it("locals accepts any string-keyed record", () => {
    expectTypeOf(render).toBeCallableWith({}, {});
    expectTypeOf(render).toBeCallableWith({}, { a: 1, b: "two", c: true });
  });
});
