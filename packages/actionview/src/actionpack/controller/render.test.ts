import { beforeEach, describe, expect, test } from "vitest";
import { ActionController } from "@blazetrails/actionpack";
import { FixtureResolver } from "../../testing/resolvers.js";

class TestController extends ActionController.Base {
  static {
    this.layout(":determineLayout");
  }

  async accessingParamsInTemplate(): Promise<void> {
    this.render({ inline: "Hello: <%= params.get('name') %>" });
  }

  async accessingLocalAssignsInInlineTemplate(): Promise<void> {
    const name = this.params.get("local_name");
    this.render({
      inline: "<%= 'Goodbye, ' + local_name %>",
      locals: { local_name: name },
    });
  }

  async inlineRenderedFormatWithoutFormat(): Promise<void> {
    this.render({ inline: "test" });
  }

  determineLayout(): string {
    switch (this.actionName) {
      case "accessingParamsInTemplate":
        return "layouts/standard";
      default:
        return "layouts/application";
    }
  }
}

TestController.viewPaths(
  new FixtureResolver({
    "layouts/standard.html.tse": "<html><%= yield %></html>",
    "layouts/application.html.tse": "<html><%= yield %></html>",
  }),
);

describe("RenderTest", () => {
  let testCase: InstanceType<typeof ActionController.TestCase>;

  beforeEach(() => {
    testCase = new ActionController.TestCase(TestController);
  });

  test("rendered format without format", async () => {
    await testCase.get("inlineRenderedFormatWithoutFormat");
    expect(testCase.responseBody).toBe("test");
    expect(testCase.response.mediaType).toBe("text/html");
  });

  test("accessing params in template", async () => {
    await testCase.get("accessingParamsInTemplate", { params: { name: "David" } });
    expect(testCase.responseBody).toBe("Hello: David");
  });

  test("accessing local assigns in inline template", async () => {
    await testCase.get("accessingLocalAssignsInInlineTemplate", {
      params: { local_name: "Local David" },
    });
    expect(testCase.responseBody).toBe("Goodbye, Local David");
    expect(testCase.response.mediaType).toBe("text/html");
  });
});
