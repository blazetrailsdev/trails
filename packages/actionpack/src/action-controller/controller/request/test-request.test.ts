import { beforeEach, describe, expect, it } from "vitest";
import { underscore } from "@blazetrails/activesupport";
import { b, StringIO } from "@blazetrails/ruby-compat";
import { AbstractStore } from "../../../action-dispatch/middleware/session/abstract-store.js";
import { TestRequest, TestSession } from "../../test-case.js";

describe("ActionController::TestRequestTest", () => {
  let request: TestRequest;

  beforeEach(() => {
    request = TestRequest.create(null);
  });

  it("test request has session options initialized", () => {
    expect(request.sessionOptions).toBeTruthy();
  });

  it("mutating session options does not affect default options", () => {
    request.sessionOptions["myparam"] = 123;
    expect(TestSession.DEFAULT_OPTIONS["myparam"]).toBeUndefined();
  });

  it("content length has bytes count value", () => {
    const nonAsciiParameters = { data: { content: "Latin + Кириллица" } };
    request.setHeader("REQUEST_METHOD", "POST");
    request.setHeader("CONTENT_TYPE", "application/json");
    request.assignParameters(null, "test", "create", nonAsciiParameters, "/test", [
      "data",
      "controller",
      "action",
    ]);
    expect(request.getHeader("CONTENT_LENGTH")).toBe(
      String(new StringIO(b(JSON.stringify(nonAsciiParameters))).size()),
    );
  });

  for (const [key, value] of Object.entries(AbstractStore.DEFAULT_OPTIONS)) {
    it(`rack default session options ${underscore(key)} exists in session options and is default`, () => {
      // eslint-disable-next-line vitest/no-conditional-in-test -- mirrors Rails' `if value.nil?` (test_request_test.rb:28)
      if (value == null) {
        // eslint-disable-next-line vitest/no-conditional-expect
        expect(
          request.sessionOptions[key],
          `Missing rack session default option ${key} in request.session_options`,
        ).toBeNull();
      } else {
        // eslint-disable-next-line vitest/no-conditional-expect
        expect(
          request.sessionOptions[key],
          `Missing rack session default option ${key} in request.session_options`,
        ).toBe(value);
      }
    });

    it(`rack default session options ${underscore(key)} exists in session options`, () => {
      expect(
        Object.hasOwn(request.sessionOptions, key),
        `Missing rack session option ${key} in request.session_options`,
      ).toBeTruthy();
    });
  }
});
