import { beforeEach, describe, it } from "vitest";
import { assertEqual, HashWithIndifferentAccess } from "@blazetrails/activesupport";
import { StringIO } from "@blazetrails/ruby-compat";
import { ApplicationController, type RoutedRackApp } from "../../test-helpers/abstract-unit.js";
import { IntegrationTest } from "../../action-dispatch/testing/integration.js";

describe("ChunkedTest", () => {
  class ChunkedController extends ApplicationController {
    async chunk() {
      await this.render({
        json: {
          raw_post: this.request.rawPost,
          content_length: this.request.contentLength,
        },
      });
    }
  }

  class TestInput extends StringIO {}
  Object.defineProperty(TestInput.prototype, "size", { value: undefined });

  class ChunkedTest extends IntegrationTest {}

  let t: ChunkedTest;

  beforeEach(async ({ task }) => {
    t = new ChunkedTest(task.name);
    await t.beforeSetup();
  });

  it("parses request raw_post correctly when request has Transfer-Encoding header without a Content-Length value", async () => {
    t.app = ChunkedTest.buildApp();
    (t.app as RoutedRackApp).routes.draw(function () {
      this.post("chunked", { to: ChunkedController.action("chunk") });
    });

    await t.post("/chunked", {
      params: new TestInput("foo=bar"),
      headers: { "Transfer-Encoding": "gzip, chunked;foo=bar" },
    });

    assertEqual(7, (t.response.parsedBody as HashWithIndifferentAccess).get("content_length"));
    assertEqual("foo=bar", (t.response.parsedBody as HashWithIndifferentAccess).get("raw_post"));
  });
});
