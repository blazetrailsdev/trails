import { beforeEach, describe, it } from "vitest";
import { assertEqual } from "@blazetrails/activesupport";
import "../../test-helpers/abstract-unit.js";
import { Base } from "../base.js";
import { TestCase } from "../test-case.js";

describe("RenderJSTest", () => {
  class TestController extends Base {
    static {
      this.protectFromForgery();
    }

    static override controllerPath(): string {
      return "test";
    }

    async renderVanillaJsHello() {
      await this.render({ js: "alert('hello')" });
    }

    async showPartial() {
      await this.render({ partial: "partial" });
    }
  }

  class RenderJSTest extends TestCase {
    static {
      this.tests(TestController);
    }
  }

  let tc: RenderJSTest;

  beforeEach(async ({ task }) => {
    tc = new RenderJSTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("render vanilla js", async () => {
    await tc.get("renderVanillaJsHello", { xhr: true });
    assertEqual("alert('hello')", tc.response.body);
    assertEqual("text/javascript", tc.response.mediaType);
  });

  it("should render js partial", async () => {
    await tc.get("showPartial", { format: "js", xhr: true });
    assertEqual("partial js", tc.response.body);
  });
});
