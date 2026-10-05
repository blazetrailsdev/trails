import { describe, it } from "vitest";
import { assertMatch, assertNot } from "@blazetrails/activesupport";
import { Headers } from "@blazetrails/rack";
import { Metal } from "../metal.js";
import { Response } from "../../action-dispatch/http/response.js";

describe("MetalControllerInstanceTests", () => {
  class SimpleController extends Metal {
    hello(): void {
      this.responseBody = "hello";
    }
  }
  Object.defineProperty(SimpleController, "name", {
    value: "MetalControllerInstanceTests::SimpleController",
  });

  it("response does not have default headers", async () => {
    const originalDefaultHeaders = Response.defaultHeaders;
    try {
      Response.defaultHeaders = {
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
        "X-XSS-Protection": "0",
      };

      const responseHeaders = Headers.from(
        (
          await SimpleController.action("hello")({
            REQUEST_METHOD: "GET",
            "rack.input": () => {},
          })
        )[1],
      );

      assertNot(responseHeaders.hasKey("X-Frame-Options"));
      assertNot(responseHeaders.hasKey("X-Content-Type-Options"));
      assertNot(responseHeaders.hasKey("X-XSS-Protection"));
    } finally {
      Response.defaultHeaders = originalDefaultHeaders;
    }
  });

  it("inspect", () => {
    const controller = new SimpleController();
    assertMatch(
      /^#<MetalControllerInstanceTests::SimpleController:0x[0-9a-f]+>$/,
      controller.inspect(),
    );
  });
});
