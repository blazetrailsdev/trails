import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { AbstractController, ActionController, RouteSet } from "@blazetrails/actionpack";
import { Logger } from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import type { PathSet } from "../../path-set.js";
import { FIXTURE_LOAD_PATH } from "../../test-helpers/abstract-unit.js";

class TestController extends ActionController.Base {
  declare person: string;
  declare secret: string;
  declare stuff: unknown;
  declare hello: string;

  static {
    this.layout(":determineLayout");
  }

  async helloWorld(): Promise<void> {}

  async renderHelloWorld(): Promise<void> {
    await this.render("test/hello-world");
  }

  async renderHelloWorldWithForwardSlash(): Promise<void> {
    await this.render("/test/hello-world");
  }

  async renderTemplateInTopDirectory(): Promise<void> {
    await this.render({ template: "shared" });
  }

  async renderTemplateInTopDirectoryWithSlash(): Promise<void> {
    await this.render("/shared");
  }

  async renderHelloWorldFromVariable(): Promise<void> {
    this.person = "david";
    await this.render({ plain: `hello ${this.person}` });
  }

  async renderActionHelloWorld(): Promise<void> {
    await this.render({ action: "helloWorld" });
  }

  async renderActionHelloWorldAsString(): Promise<void> {
    await this.render("helloWorld");
  }

  async renderTextHelloWorld(): Promise<void> {
    await this.render({ plain: "hello world" });
  }

  async helloWorldWithLayoutFalse(): Promise<void> {
    await this.render({ layout: false });
  }

  async renderTemplateWithInstanceVariables(): Promise<void> {
    this.secret = "in the sauce";
    await this.render({ template: "test/render_template_with_ivar" });
  }

  async renderTemplateWithDotInPath(): Promise<void> {
    this.secret = "in the sauce";
    await this.render({ template: "test/dot.directory/render_template_with_ivar" });
  }

  async renderTemplateWithLocals(): Promise<void> {
    await this.render({
      template: "test/render-template-with-locals",
      locals: { secret: "in the sauce" },
    });
  }

  async accessingRequestInTemplate(): Promise<void> {
    await this.render({ inline: "Hello: <%= request.host %>" });
  }

  async accessingActionNameInTemplate(): Promise<void> {
    await this.render({ inline: "<%= actionName() %>" });
  }

  async renderCustomCode(): Promise<void> {
    await this.render({ plain: "hello world", status: 404 });
  }

  async renderTextWithNil(): Promise<void> {
    await this.render({ plain: null });
  }

  async renderTextWithFalse(): Promise<void> {
    await this.render({ plain: false });
  }

  async renderNothingWithAppendix(): Promise<void> {
    await this.render({ plain: "appended" });
  }

  async layoutTest(): Promise<void> {
    await this.render({ action: "helloWorld" });
  }

  async formattedHtmlErb(): Promise<void> {}

  async formattedXmlErb(): Promise<void> {}

  async layoutTestWithDifferentLayout(): Promise<void> {
    await this.render({ action: "helloWorld", layout: "standard" });
  }

  async layoutTestWithDifferentLayoutAndStringAction(): Promise<void> {
    await this.render("helloWorld", { layout: "standard" });
  }

  async renderingWithoutLayout(): Promise<void> {
    await this.render({ action: "helloWorld", layout: false });
  }

  async renderingNothingOnLayout(): Promise<void> {
    await this.head("ok");
  }

  async accessingParamsInTemplateWithLayout(): Promise<void> {
    await this.render({ layout: true, inline: "Hello: <%= params().get('name') %>" });
  }

  async renderWithExplicitTemplate(): Promise<void> {
    await this.render({ template: "test/hello-world" });
  }

  async renderWithExplicitStringTemplate(): Promise<void> {
    await this.render("test/hello-world");
  }

  async renderWithExplicitTemplateWithLocals(): Promise<void> {
    await this.render({
      template: "test/render-template-with-locals",
      locals: { secret: "area51" },
    });
  }

  async doubleRender(): Promise<void> {
    await this.render({ plain: "hello" });
    await this.render({ plain: "world" });
  }

  async renderAndRedirect(): Promise<void> {
    await this.render({ plain: "hello" });
    this.redirectTo({ action: "doubleRender" });
  }

  async renderToStringAndRender(): Promise<void> {
    this.stuff = await this.renderToString({ plain: "here is some cached stuff" });
    await this.render({ plain: `Hi web users! ${this.stuff}` });
  }

  async renderTextWithAssigns(): Promise<void> {
    this.hello = "world";
    await this.render({ plain: "foo" });
  }

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
      case "layoutTest":
      case "renderingWithoutLayout":
      case "renderingNothingOnLayout":
      case "renderTextHelloWorld":
      case "renderTextHelloWorldWithLayout":
      case "helloWorldWithLayoutFalse":
      case "partialOnly":
      case "accessingParamsInTemplate":
      case "accessingParamsInTemplateWithLayout":
      case "renderWithExplicitTemplate":
      case "renderWithExplicitStringTemplate":
      case "updatePage":
      case "updatePageWithInstanceVariables":
        return "layouts/standard";
      case "actionTalkToLayout":
      case "layoutOverridingLayout":
        return "layouts/talk_from_action";
      case "renderImplicitHtmlTemplateFromXhrRequest":
        return this.request.xhr ? "layouts/xhr" : "layouts/standard";
    }
  }
}

const SharedTestRoutes = new RouteSet();
SharedTestRoutes.draw(function () {
  this.get(":controller(/:action)");
});

describe("RenderTest", () => {
  let testCase: InstanceType<typeof ActionController.TestCase>;
  let oldViewPaths: PathSet;

  beforeEach(async ({ task }) => {
    testCase = new ActionController.TestCase(task.name);
    testCase.controller = new TestController();
    await testCase.beforeSetup();
    testCase.routes = SharedTestRoutes;
    (testCase.controller as unknown as { logger: Logger }).logger = new Logger(null);
    Base.logger = new Logger(null);

    testCase.request.host = "www.nextangle.com";

    oldViewPaths = ActionController.Base.viewPaths();
    ActionController.Base.viewPaths(File.join(FIXTURE_LOAD_PATH, "actionpack"));
  });

  afterEach(() => {
    Base.logger = null;

    ActionController.Base.viewPaths(oldViewPaths);
  });

  test("simple show", async () => {
    await testCase.get("helloWorld");
    testCase.assertResponse(200);
    testCase.assertResponse("success");
    expect(testCase.response.body).toBe("<html>Hello world!</html>");
  });

  test("render", async () => {
    await testCase.get("renderHelloWorld");
    expect(testCase.response.body).toBe("Hello world!");
  });

  test("render with forward slash", async () => {
    await testCase.get("renderHelloWorldWithForwardSlash");
    expect(testCase.response.body).toBe("Hello world!");
  });

  test("render in top directory", async () => {
    await testCase.get("renderTemplateInTopDirectory");
    expect(testCase.response.body).toBe("Elastica");
  });

  test("render in top directory with slash", async () => {
    await testCase.get("renderTemplateInTopDirectoryWithSlash");
    expect(testCase.response.body).toBe("Elastica");
  });

  test("render from variable", async () => {
    await testCase.get("renderHelloWorldFromVariable");
    expect(testCase.response.body).toBe("hello david");
  });

  test("render action", async () => {
    await testCase.get("renderActionHelloWorld");
    expect(testCase.response.body).toBe("Hello world!");
  });

  test("render action hello world as string", async () => {
    await testCase.get("renderActionHelloWorldAsString");
    expect(testCase.response.body).toBe("Hello world!");
  });

  test("render text", async () => {
    await testCase.get("renderTextHelloWorld");
    expect(testCase.response.body).toBe("hello world");
  });

  test("do with render action and layout false", async () => {
    await testCase.get("helloWorldWithLayoutFalse");
    expect(testCase.response.body).toBe("Hello world!");
  });

  test("render template with instance variables", async () => {
    await testCase.get("renderTemplateWithInstanceVariables");
    expect(testCase.response.body).toBe("The secret is in the sauce\n");
  });

  test("render template with dot in path", async () => {
    await testCase.get("renderTemplateWithDotInPath");
    expect(testCase.response.body).toBe("The secret is in the sauce\n");
  });

  test("render template with locals", async () => {
    await testCase.get("renderTemplateWithLocals");
    expect(testCase.response.body).toBe("The secret is in the sauce\n");
  });

  test("render custom code", async () => {
    await testCase.get("renderCustomCode");
    testCase.assertResponse(404);
    testCase.assertResponse("missing");
    expect(testCase.response.body).toBe("hello world");
  });

  test("render text with nil", async () => {
    await testCase.get("renderTextWithNil");
    testCase.assertResponse(200);
    expect(testCase.response.body).toBe("");
  });

  test("render text with false", async () => {
    await testCase.get("renderTextWithFalse");
    expect(testCase.response.body).toBe("false");
  });

  test("render nothing with appendix", async () => {
    await testCase.get("renderNothingWithAppendix");
    testCase.assertResponse(200);
    expect(testCase.response.body).toBe("appended");
  });

  test("access to request in view", async () => {
    await testCase.get("accessingRequestInTemplate");
    expect(testCase.response.body).toBe("Hello: www.nextangle.com");
  });

  test("access to action name in view", async () => {
    await testCase.get("accessingActionNameInTemplate");
    expect(testCase.response.body).toBe("accessingActionNameInTemplate");
  });

  test("layout rendering", async () => {
    await testCase.get("layoutTest");
    expect(testCase.response.body).toBe("<html>Hello world!</html>");
  });

  test("should render formatted template", async () => {
    await testCase.get("formattedHtmlErb");
    expect(testCase.response.body).toBe("formatted HTML erb");
  });

  test("should render formatted html erb template", async () => {
    await testCase.get("formattedXmlErb");
    expect(testCase.response.body).toBe("<test>passed formatted HTML erb</test>");
  });

  test("should render formatted html erb template with bad accepts header", async () => {
    testCase.request.env["HTTP_ACCEPT"] = "; q=dsf";
    await testCase.get("formattedXmlErb");
    expect(testCase.response.body).toBe("<test>passed formatted HTML erb</test>");
  });

  test("layout test with different layout", async () => {
    await testCase.get("layoutTestWithDifferentLayout");
    expect(testCase.response.body).toBe("<html>Hello world!</html>");
  });

  test("layout test with different layout and string action", async () => {
    await testCase.get("layoutTestWithDifferentLayoutAndStringAction");
    expect(testCase.response.body).toBe("<html>Hello world!</html>");
  });

  test("rendering without layout", async () => {
    await testCase.get("renderingWithoutLayout");
    expect(testCase.response.body).toBe("Hello world!");
  });

  test("rendering nothing on layout", async () => {
    await testCase.get("renderingNothingOnLayout");
    expect(testCase.response.body).toBe("");
  });

  test("accessing params in template with layout", async () => {
    await testCase.get("accessingParamsInTemplateWithLayout", { params: { name: "David" } });
    expect(testCase.response.body).toBe("<html>Hello: David</html>");
  });

  test("render with explicit template", async () => {
    await testCase.get("renderWithExplicitTemplate");
    testCase.assertResponse("success");
  });

  test("render with explicit string template", async () => {
    await testCase.get("renderWithExplicitStringTemplate");
    expect(testCase.response.body).toBe("<html>Hello world!</html>");
  });

  test("double render", async () => {
    await expect(testCase.get("doubleRender")).rejects.toThrow(
      AbstractController.DoubleRenderError,
    );
  });

  test("render and redirect", async () => {
    await expect(testCase.get("renderAndRedirect")).rejects.toThrow(
      AbstractController.DoubleRenderError,
    );
  });

  test("render to string and render", async () => {
    await testCase.get("renderToStringAndRender");
    expect(testCase.response.body).toBe("Hi web users! here is some cached stuff");
  });

  test("render text with assigns", async () => {
    await testCase.get("renderTextWithAssigns");
    expect((testCase.controller as TestController).hello).toBe("world");
  });

  test("template with locals", async () => {
    await testCase.get("renderWithExplicitTemplateWithLocals");
    expect(testCase.response.body).toBe("The secret is area51\n");
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
