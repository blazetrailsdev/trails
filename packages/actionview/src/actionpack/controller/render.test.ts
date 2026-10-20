import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ActionController, RouteSet } from "@blazetrails/actionpack";
import { File } from "@blazetrails/ruby-compat";
import { FIXTURE_LOAD_PATH } from "../../test-helpers/abstract-unit.js";

class TestController extends ActionController.Base {
  static {
    this.layout(":determineLayout");
  }

  async helloWorld(): Promise<void> {}

  async accessingParamsInTemplate(): Promise<void> {
    await this.render({ inline: "Hello: <%= params().get('name') %>" });
  }

  async accessingLocalAssignsInInlineTemplate(): Promise<void> {
    const name = this.params.get("local_name");
    await this.render({
      inline: "<%= 'Goodbye, ' + local_name %>",
      locals: { local_name: name },
    });
  }

  async inlineRenderedFormatWithoutFormat(): Promise<void> {
    await this.render({ inline: "test" });
  }

  determineLayout(): string | undefined {
    switch (this.actionName) {
      case "helloWorld":
      case "accessingParamsInTemplate":
        return "layouts/standard";
    }
  }
}

const SharedTestRoutes = new RouteSet();
SharedTestRoutes.draw(function () {
  this.get(":controller(/:action)");
});

describe("RenderTest", () => {
  let testCase: InstanceType<typeof ActionController.TestCase>;
  let oldViewPaths: ReturnType<typeof ActionController.Base.viewPaths>;

  beforeEach(async ({ task }) => {
    testCase = new ActionController.TestCase(task.name);
    testCase.controller = new TestController();
    await testCase.beforeSetup();
    testCase.routes = SharedTestRoutes;

    oldViewPaths = ActionController.Base.viewPaths();
    ActionController.Base.viewPaths(File.join(FIXTURE_LOAD_PATH, "actionpack"));
  });

  afterEach(() => {
    ActionController.Base.viewPaths(oldViewPaths);
  });

  test("simple show", async () => {
    await testCase.get("helloWorld");
    testCase.assertResponse(200);
    testCase.assertResponse("success");
    expect(testCase.response.body).toBe("<html>Hello world!</html>");
  });

  test("rendered format without format", async () => {
    await testCase.get("inlineRenderedFormatWithoutFormat");
    expect(testCase.response.body).toBe("test");
    expect(testCase.response.mediaType).toBe("text/html");
  });

  test("accessing params in template", async () => {
    await testCase.get("accessingParamsInTemplate", { params: { name: "David" } });
    expect(testCase.response.body).toBe("Hello: David");
  });

  test("accessing local assigns in inline template", async () => {
    await testCase.get("accessingLocalAssignsInInlineTemplate", {
      params: { local_name: "Local David" },
    });
    expect(testCase.response.body).toBe("Goodbye, Local David");
    expect(testCase.response.mediaType).toBe("text/html");
  });
});
