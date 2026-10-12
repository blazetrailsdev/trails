import { beforeEach, describe, it } from "vitest";
import { assertEqual } from "@blazetrails/activesupport";
import "../../test-helpers/abstract-unit.js";
import { Base } from "../base.js";
import { TestCase } from "../test-case.js";

describe("RenderToStringTest", () => {
  class TestController extends Base {
    static {
      this.protectFromForgery();
    }

    static override controllerPath(): string {
      return "test";
    }

    async renderPlainTextResponseWithInlineTemplate() {
      await this.render({ plain: (await this.renderToString({ inline: "hello" })) as string });
    }

    async renderJsonResponseWithPartial() {
      await this.render({ json: { hello: await this.renderToString({ partial: "partial" }) } });
    }

    async renderJsonRenderToString() {
      await this.render({ plain: (await this.renderToString({ json: "[]" })) as string });
    }

    async renderPlainTextResponseWithInlineTemplateAndXmlFormat() {
      await this.renderToString({ inline: "<language>Ruby</language>", formats: [":xml"] });
      await this.render({ plain: "Hello" });
    }

    async renderHeadOkWithInlineTemplateAndXmlFormat() {
      await this.renderToString({ inline: "<language>Ruby</language>", formats: [":xml"] });
      this.head("ok");
    }
  }

  class RenderToStringTest extends TestCase {
    static {
      this.tests(TestController);
    }
  }

  let tc: RenderToStringTest;
  const assertResponse = (type: number | string): void => tc.assertResponse(type);

  beforeEach(async ({ task }) => {
    tc = new RenderToStringTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("render plain text response", async () => {
    await tc.get("renderPlainTextResponseWithInlineTemplate");
    assertEqual("hello", tc.response.body);
    assertEqual("text/plain", tc.response.mediaType);
  });

  it("render json response", async () => {
    await tc.get("renderJsonResponseWithPartial");
    assertEqual('{"hello":"partial html"}', tc.response.body);
    assertEqual("application/json", tc.response.mediaType);
  });

  it("response type does not change by render to string with xml format", async () => {
    await tc.get("renderPlainTextResponseWithInlineTemplateAndXmlFormat");
    assertEqual("Hello", tc.response.body);
    assertEqual("text/plain", tc.response.mediaType);
  });

  it("response ok for render to string with xml format", async () => {
    await tc.get("renderHeadOkWithInlineTemplateAndXmlFormat");
    assertEqual("text/html", tc.response.mediaType);
    assertResponse("ok");
  });
});
