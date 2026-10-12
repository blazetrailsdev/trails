import { describe, it } from "vitest";
import { assertEqual } from "@blazetrails/activesupport";
import { StringIO } from "@blazetrails/ruby-compat";
import { ApplicationController } from "../../test-helpers/abstract-unit.js";
import { IntegrationTest } from "../../action-dispatch/testing/integration.js";

describe("ChunkedTest", () => {
  class ChunkedController extends ApplicationController {
    async chunk() {
      await this.render({
        json: {
          rawPost: this.request.rawPost,
          contentLength: this.request.contentLength,
        },
      });
    }
  }

  class TestInput extends StringIO {}
  Object.defineProperty(TestInput.prototype, "size", { value: undefined });

  it("parses request raw_post correctly when request has Transfer-Encoding header without a Content-Length value", async ({
    task,
  }) => {
    const t = new IntegrationTest(task.name);
    const app = IntegrationTest.buildApp();
    t.app = app;
    app.routes.draw(function () {
      this.post("chunked", { to: ChunkedController.action("chunk") });
    });

    await t.post("/chunked", {
      params: new TestInput("foo=bar"),
      headers: { "Transfer-Encoding": "gzip, chunked;foo=bar" },
    });

    const parsedBody = t.response.parsedBody as Record<string, unknown>;
    assertEqual(7, parsedBody["contentLength"]);
    assertEqual("foo=bar", parsedBody["rawPost"]);
  });
});
