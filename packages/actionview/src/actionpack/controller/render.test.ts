import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { AbstractController, ActionController, RouteSet } from "@blazetrails/actionpack";
import { Logger } from "@blazetrails/activesupport";
import {
  ArgumentError,
  File,
  rbModConstSet,
  rbObjIvarGet,
  rbObjIvarSet,
  registerConstant,
  stringSplit,
} from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { Template } from "../../template.js";
import { MissingTemplate } from "../../template/error.js";
import { FormBuilder } from "../../helpers/form-helper.js";
import { DetailsKey } from "../../lookup-context.js";
import type { PathSet } from "../../path-set.js";
import { FIXTURE_LOAD_PATH } from "../../test-helpers/abstract-unit.js";
import { BadCustomer, Customer, GoodCustomer } from "../../test-helpers/fake-models.js";

const Quiz = {} as { Question: typeof Question; QuestionsController: typeof QuestionsController };
registerConstant("Quiz", Quiz);

class Question extends Customer {}
rbModConstSet(Quiz, "Question", Question);

class QuestionsController extends ActionController.Base {
  async new(): Promise<void> {
    await this.render({ partial: new Quiz.Question("Namespaced Partial") });
  }
}
rbModConstSet(Quiz, "QuestionsController", QuestionsController);

const Fun = {} as { GamesController: typeof GamesController };
registerConstant("Fun", Fun);

class GamesController extends ActionController.Base {
  async helloWorld(): Promise<void> {}

  async nestedPartialWithFormBuilder(): Promise<void> {
    await this.render({ partial: new FormBuilder("post", null, this.viewContext(), {}) });
  }
}
rbModConstSet(Fun, "GamesController", GamesController);

class TestController extends ActionController.Base {
  declare person: string;
  declare secret: string;
  declare stuff: unknown;
  declare hello: string;
  declare path: string;
  declare name: string;
  declare customers: Customer[];
  declare testUnchanged: string;
  declare foo: unknown;
  declare before: string;
  declare after: string;
  declare variableForLayout: string | null;
  declare text: unknown;
  declare html: unknown;
  declare customer: Customer;

  static LabellingFormBuilder = class LabellingFormBuilder extends FormBuilder {};

  static {
    this.protectFromForgery();
    this.beforeAction("setVariableForLayout");
    this.layout(":determineLayout");
    this.beforeAction(
      (c) => {
        ((c as TestController).request as unknown as { format: string }).format = "xml";
      },
      { only: "renderWithFilters" },
    );
  }

  async helloWorld(): Promise<void> {}

  async helloWorldFile(): Promise<void> {
    await this.render({ file: File.join(FIXTURE_LOAD_PATH, "actionpack", "hello.html") });
  }

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

  async renderActionUpcasedHelloWorld(): Promise<void> {
    await this.render({ action: "Hello_world" });
  }

  async renderActionHelloWorldWithSymbol(): Promise<void> {
    await this.render({ action: "helloWorld" });
  }

  async renderTextHelloWorldWithLayout(): Promise<void> {
    this.variableForLayout = ", I am here!";
    await this.render({ plain: "hello world", layout: true });
  }

  async renderInstanceVariables(): Promise<void> {
    await this.render({ inline: "<%= Object.keys(this).sort() %>" });
  }

  async renderFileNotUsingFullPath(): Promise<void> {
    await this.render({ file: "test/render_template_with_ivar" });
  }

  async renderFileUsingPathname(): Promise<void> {
    await this.render({
      file: File.join(FIXTURE_LOAD_PATH, "test", "dot.directory", "render_template_with_ivar.tse"),
    });
  }

  async renderFileFromTemplate(): Promise<void> {
    this.path = File.join(FIXTURE_LOAD_PATH, "test", "render_template_with_ivar.tse");
  }

  async accessingLoggerInTemplate(): Promise<void> {
    await this.render({ inline: "<%= logger.constructor.name %>" });
  }

  async accessingControllerNameInTemplate(): Promise<void> {
    await this.render({ inline: "<%= controllerName() %>" });
  }

  async renderTextWithResource(): Promise<void> {
    await this.render({ plain: new Customer("David") as unknown as string });
  }

  async renderXmlHello(): Promise<void> {
    this.name = "David";
    await this.render({ template: "test/hello" });
  }

  async renderXmlHelloAsStringTemplate(): Promise<void> {
    this.name = "David";
    await this.render("test/hello");
  }

  async renderLineOffset(): Promise<void> {
    await this.render({ template: "test/raise" });
  }

  async greeting(): Promise<void> {}

  async builderLayoutTest(): Promise<void> {
    this.name = null as unknown as string;
    await this.render({ action: "hello", layout: "layouts/builder" });
  }

  async builderPartialTest(): Promise<void> {
    await this.render({ action: "hello_world_container" });
  }

  async partialsList(): Promise<void> {
    this.testUnchanged = "hello";
    this.customers = [new Customer("david"), new Customer("mary")];
    await this.render({ action: "list" });
  }

  async partialOnly(): Promise<void> {
    await this.render({ partial: true });
  }

  async helloInAString(): Promise<void> {
    this.customers = [new Customer("david"), new Customer("mary")];
    await this.render({
      plain: "How's there? " + (await this.renderToString({ template: "test/list" })),
    });
  }

  async renderImplicitHtmlTemplateFromXhrRequest(): Promise<void> {}

  async renderImplicitJsTemplateWithoutLayout(): Promise<void> {}

  async renderToStringTest(): Promise<void> {
    this.foo = await this.renderToString({ inline: "this is a test" });
  }

  async layoutTestWithDifferentLayoutAndSymbolAction(): Promise<void> {
    await this.render("helloWorld", { layout: "standard" });
  }

  async layoutOverridingLayout(): Promise<void> {
    await this.render({ action: "helloWorld", layout: "standard" });
  }

  async renderToStringWithAssigns(): Promise<void> {
    this.before = "i'm before the render";
    await this.renderToString({ plain: "foo" });
    this.after = "i'm after the render";
    await this.render({ template: "test/hello-world" });
  }

  async renderToStringWithException(): Promise<void> {
    await this.renderToString({
      template: "exception that will not be caught - this will certainly not work",
    });
  }

  async renderToStringWithCaughtException(): Promise<void> {
    this.before = "i'm before the render";
    try {
      await this.renderToString({
        file: "exception that will be caught- hope my future instance vars still work!",
      });
    } catch {
      /** @empty */
    }
    this.after = "i'm after the render";
    await this.render({ template: "test/hello-world" });
  }

  async renderWithExplicitUnescapedTemplate(): Promise<void> {
    await this.render({ template: "test/h*llo-world" });
  }

  async renderWithExplicitEscapedTemplate(): Promise<void> {
    await this.render({ template: "test/hello,world" });
  }

  async doubleRedirect(): Promise<void> {
    this.redirectTo({ action: "doubleRender" });
    this.redirectTo({ action: "doubleRender" });
  }

  async renderToStringWithInlineAndRender(): Promise<void> {
    await this.renderToString({ inline: "<%= [...'dlrow olleh'].reverse().join('') %>" });
    await this.render({ template: "test/hello-world" });
  }

  async renderingWithConflictingLocalVars(): Promise<void> {
    this.name = "David";
    await this.render({ action: "potentialConflicts" });
  }

  async helloWorldFromRxmlUsingAction(): Promise<void> {
    await this.render({ action: "hello_world_from_rxml", handlers: ["builder"] });
  }

  async helloWorldFromRxmlUsingTemplate(): Promise<void> {
    await this.render({ template: "test/hello_world_from_rxml", handlers: ["builder"] });
  }

  async actionTalkToLayout(): Promise<void> {}

  async renderWithAssignsOption(): Promise<void> {
    await this.render({
      inline: "<%= this.hello %>",
      assigns: { hello: "world" },
    } as { inline: string });
  }

  async yieldContentFor(): Promise<void> {
    await this.render({ action: "contentFor", layout: "yield" });
  }

  async renderUsingLayoutAroundBlock(): Promise<void> {
    await this.render({ action: "usingLayoutAroundBlock" });
  }

  async renderUsingLayoutAroundBlockInMainLayoutAndWithinContentForLayout(): Promise<void> {
    await this.render({ action: "usingLayoutAroundBlock", layout: "layouts/block_with_layout" });
  }

  async partialFormatsHtml(): Promise<void> {
    await this.render({ partial: "partial", formats: [":html"] });
  }

  async partial(): Promise<void> {
    await this.render({ partial: "partial" });
  }

  async partialHtmlErb(): Promise<void> {
    await this.render({ partial: "partial_html_erb" });
  }

  async renderToStringWithPartial(): Promise<void> {
    rbObjIvarSet(this, "@partial_only", await this.renderToString({ partial: "partial_only" }));
    rbObjIvarSet(
      this,
      "@partial_with_locals",
      await this.renderToString({
        partial: "customer",
        locals: { customer: new Customer("david") },
      }),
    );
    await this.render({ template: "test/hello-world" });
  }

  async renderToStringWithTemplateAndHtmlPartial(): Promise<void> {
    this.text = await this.renderToString({ template: "test/with_partial", formats: [":text"] });
    this.html = await this.renderToString({ template: "test/with_partial", formats: [":html"] });
    await this.render({ template: "test/with_html_partial" });
  }

  async renderToStringAndRenderWithDifferentFormats(): Promise<void> {
    this.html = await this.renderToString({ template: "test/with_partial", formats: [":html"] });
    await this.render({ template: "test/with_partial", formats: [":text"] });
  }

  async renderTemplateWithinATemplateWithOtherFormat(): Promise<void> {
    await this.render({
      template: "test/with_xml_template",
      formats: [":html"],
      layout: "with_html_partial",
    });
  }

  async partialWithCounter(): Promise<void> {
    await this.render({ partial: "counter", locals: { counter_counter: 5 } });
  }

  async partialWithLocals(): Promise<void> {
    await this.render({ partial: "customer", locals: { customer: new Customer("david") } });
  }

  async partialWithHashlikeLocals(): Promise<void> {
    await this.render({
      partial: "customer",
      locals: new ActionController.Parameters({
        customer: new Customer("david"),
      }) as unknown as Record<string, unknown>,
    });
  }

  async partialWithFormBuilder(): Promise<void> {
    await this.render({ partial: new FormBuilder("post", null, this.viewContext(), {}) });
  }

  async partialWithFormBuilderSubclass(): Promise<void> {
    await this.render({
      partial: new TestController.LabellingFormBuilder("post", null, this.viewContext(), {}),
    });
  }

  async partialCollection(): Promise<void> {
    await this.render({
      partial: "customer",
      collection: [new Customer("david"), new Customer("mary")],
    });
  }

  async partialCollectionWithAs(): Promise<void> {
    await this.render({
      partial: "customer_with_var",
      collection: [new Customer("david"), new Customer("mary")],
      as: "customer",
    });
  }

  async partialCollectionWithIteration(): Promise<void> {
    await this.render({
      partial: "customer_iteration",
      collection: [new Customer("david"), new Customer("mary"), new Customer("christine")],
    });
  }

  async partialCollectionWithAsAndIteration(): Promise<void> {
    await this.render({
      partial: "customer_iteration_with_as",
      collection: [new Customer("david"), new Customer("mary"), new Customer("christine")],
      as: "client",
    });
  }

  async partialCollectionWithCounter(): Promise<void> {
    await this.render({
      partial: "customer_counter",
      collection: [new Customer("david"), new Customer("mary")],
    });
  }

  async partialCollectionWithAsAndCounter(): Promise<void> {
    await this.render({
      partial: "customer_counter_with_as",
      collection: [new Customer("david"), new Customer("mary")],
      as: "client",
    });
  }

  async partialCollectionWithLocals(): Promise<void> {
    await this.render({
      partial: "customer_greeting",
      collection: [new Customer("david"), new Customer("mary")],
      locals: { greeting: "Bonjour" },
    });
  }

  async partialCollectionWithSpacer(): Promise<void> {
    await this.render({
      partial: "customer",
      spacerTemplate: "partial_only",
      collection: [new Customer("david"), new Customer("mary")],
    });
  }

  async partialCollectionWithSpacerWhichUsesRender(): Promise<void> {
    await this.render({
      partial: "customer",
      spacerTemplate: "partial_with_partial",
      collection: [new Customer("david"), new Customer("mary")],
    });
  }

  async partialCollectionShorthandWithLocals(): Promise<void> {
    await this.render({
      partial: [new Customer("david"), new Customer("mary")],
      locals: { greeting: "Bonjour" },
    });
  }

  async partialCollectionShorthandWithDifferentTypesOfRecords(): Promise<void> {
    await this.render({
      partial: [
        new BadCustomer("mark"),
        new GoodCustomer("craig"),
        new BadCustomer("john"),
        new GoodCustomer("zach"),
        new GoodCustomer("brandon"),
        new BadCustomer("dan"),
      ],
      locals: { greeting: "Bonjour" },
    });
  }

  async emptyPartialCollection(): Promise<void> {
    await this.render({ partial: "customer", collection: [] });
  }

  async missingPartial(): Promise<void> {
    await this.render({ partial: "thisFileIsntHere" });
  }

  async partialWithHashObject(): Promise<void> {
    await this.render({ partial: "hash_object", object: { first_name: "Sam" } });
  }

  async partialWithNestedObject(): Promise<void> {
    await this.render({ partial: "quiz/questions/question", object: new Quiz.Question("first") });
  }

  async partialWithNestedObjectShorthand(): Promise<void> {
    await this.render(new Quiz.Question("first") as unknown as string);
  }

  async partialHashCollection(): Promise<void> {
    await this.render({
      partial: "hash_object",
      collection: [{ first_name: "Pratik" }, { first_name: "Amy" }],
    });
  }

  async partialHashCollectionWithLocals(): Promise<void> {
    await this.render({
      partial: "hash_greeting",
      collection: [{ first_name: "Pratik" }, { first_name: "Amy" }],
      locals: { greeting: "Hola" },
    });
  }

  async renderCallToPartialWithLayout(): Promise<void> {
    await this.render({ action: "callingPartialWithLayout" });
  }

  async renderCallToPartialWithLayoutInMainLayoutAndWithinContentForLayout(): Promise<void> {
    await this.render({
      action: "callingPartialWithLayout",
      layout: "layouts/partial_with_layout",
    });
  }

  async renderWithFilters(): Promise<void> {
    await this.render({ action: "formattedXmlErb" });
  }

  private setVariableForLayout(): void {
    this.variableForLayout = null;
  }

  private determineLayout(): string | undefined {
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

  // BLOCKED: render-test-controller-gaps
  test.skip("controller does not leak instance variables", async () => {
    const expected = [
      "_assigns",
      "_config",
      "_controller",
      "_defaultFormBuilder",
      "_ivars",
      "_request",
      "currentTemplate",
      "lookupContext",
      "outputBuffer",
      "variableForLayout",
      "viewFlow",
      "viewRenderer",
      "virtualPath",
    ].join(",");
    await testCase.get("renderInstanceVariables");
    testCase.assertResponse(200);
    expect(testCase.response.body).toBe(expected);
  });

  test("renders default template for missing action", async () => {
    await testCase.get("hyphen-ated");
    expect(testCase.response.body).toBe("hyphen-ated.erb");
  });

  test("render", async () => {
    await testCase.get("renderHelloWorld");
    expect(testCase.response.body).toBe("Hello world!");
  });

  test("line offset", async () => {
    await expect(testCase.get("renderLineOffset")).rejects.toThrow(Template.Error);
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

  // BLOCKED: render-test-controller-gaps
  test.skip("render action upcased", async () => {
    await expect(testCase.get("renderActionUpcasedHelloWorld")).rejects.toThrow(MissingTemplate);
  });

  test("render action hello world as string", async () => {
    await testCase.get("renderActionHelloWorldAsString");
    expect(testCase.response.body).toBe("Hello world!");
  });

  test("render action with symbol", async () => {
    await testCase.get("renderActionHelloWorldWithSymbol");
    expect(testCase.response.body).toBe("Hello world!");
  });

  test("render text", async () => {
    await testCase.get("renderTextHelloWorld");
    expect(testCase.response.body).toBe("hello world");
  });

  test("do with render text and layout", async () => {
    await testCase.get("renderTextHelloWorldWithLayout");
    expect(testCase.response.body).toBe("{{hello world, I am here!}}\n");
  });

  test("do with render action and layout false", async () => {
    await testCase.get("helloWorldWithLayoutFalse");
    expect(testCase.response.body).toBe("Hello world!");
  });

  test("render template with instance variables", async () => {
    await testCase.get("renderTemplateWithInstanceVariables");
    expect(testCase.response.body).toBe("The secret is in the sauce\n");
  });

  test("render file", async () => {
    await testCase.get("helloWorldFile");
    expect(testCase.response.body).toBe("Hello world!");
  });

  test("render file not using full path", async () => {
    await expect(testCase.get("renderFileNotUsingFullPath")).rejects.toThrow(ArgumentError);
  });

  test("render template with dot in path", async () => {
    await testCase.get("renderTemplateWithDotInPath");
    expect(testCase.response.body).toBe("The secret is in the sauce\n");
  });

  test("render file using pathname", async () => {
    await testCase.get("renderFileUsingPathname");
    expect(testCase.response.body).toBe("The secret is <%= this.secret %>\n");
  });

  test("render template with locals", async () => {
    await testCase.get("renderTemplateWithLocals");
    expect(testCase.response.body).toBe("The secret is in the sauce\n");
  });

  test("render file from template", async () => {
    await testCase.get("renderFileFromTemplate");
    expect(testCase.response.body).toBe("The secret is &lt;%= this.secret %&gt;\n");
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

  test("render text with resource", async () => {
    await testCase.get("renderTextWithResource");
    expect(testCase.response.body).toBe('name: "David"');
  });

  test("attempt to access object method", async () => {
    await expect(testCase.get("clone")).rejects.toThrow(AbstractController.ActionNotFound);
  });

  // PERMANENT-SKIP: CLAUDE.md, "Method visibility is compile-time only (`Module#private`, `basic_obj_respond_to`'s `pub`)" — a private `determine_layout` is still a defined action.
  test.skip("private methods", async () => {
    await expect(testCase.get("determineLayout")).rejects.toThrow(
      AbstractController.ActionNotFound,
    );
  });

  test("access to request in view", async () => {
    await testCase.get("accessingRequestInTemplate");
    expect(testCase.response.body).toBe("Hello: www.nextangle.com");
  });

  test("access to logger in view", async () => {
    await testCase.get("accessingLoggerInTemplate");
    expect(testCase.response.body).toBe("Logger");
  });

  test("access to action name in view", async () => {
    await testCase.get("accessingActionNameInTemplate");
    expect(testCase.response.body).toBe("accessingActionNameInTemplate");
  });

  test("access to controller name in view", async () => {
    await testCase.get("accessingControllerNameInTemplate");
    expect(testCase.response.body).toBe("test");
  });

  // BLOCKED: template/handlers/builder.rb is unported (scripts/parity/unported-files/actionview.ts)
  test.skip("render xml", async () => {
    await testCase.get("renderXmlHello");
    expect(testCase.response.body).toBe(
      "<html>\n  <p>Hello David</p>\n<p>This is grand!</p>\n</html>\n",
    );
    expect(testCase.response.mediaType).toBe("application/xml");
  });

  // BLOCKED: template/handlers/builder.rb is unported (scripts/parity/unported-files/actionview.ts)
  test.skip("render xml as string template", async () => {
    await testCase.get("renderXmlHelloAsStringTemplate");
    expect(testCase.response.body).toBe(
      "<html>\n  <p>Hello David</p>\n<p>This is grand!</p>\n</html>\n",
    );
    expect(testCase.response.mediaType).toBe("application/xml");
  });

  test("render xml with default", async () => {
    await testCase.get("greeting");
    expect(testCase.response.body).toBe("<p>This is grand!</p>\n");
  });

  // BLOCKED: template/handlers/builder.rb is unported (scripts/parity/unported-files/actionview.ts)
  test.skip("render xml with partial", async () => {
    await testCase.get("builderPartialTest");
    expect(testCase.response.body).toBe("<test>\n  <hello/>\n</test>\n");
  });

  test("layout rendering", async () => {
    await testCase.get("layoutTest");
    expect(testCase.response.body).toBe("<html>Hello world!</html>");
  });

  // BLOCKED: template/handlers/builder.rb is unported (scripts/parity/unported-files/actionview.ts)
  test.skip("render xml with layouts", async () => {
    await testCase.get("builderLayoutTest");
    expect(testCase.response.body).toBe(
      "<wrapper>\n<html>\n  <p>Hello </p>\n<p>This is grand!</p>\n</html>\n</wrapper>\n",
    );
  });

  test("rendered format without format", async () => {
    await testCase.get("inlineRenderedFormatWithoutFormat");
    expect(testCase.response.body).toBe("test");
    expect(testCase.response.mediaType).toBe("text/html");
  });

  test("partials list", async () => {
    await testCase.get("partialsList");
    expect(testCase.response.body).toBe("goodbyeHello: davidHello: marygoodbye\n");
  });

  test("render to string", async () => {
    await testCase.get("helloInAString");
    expect(testCase.response.body).toBe("How's there? goodbyeHello: davidHello: marygoodbye\n");
  });

  test("render to string resets assigns", async () => {
    await testCase.get("renderToStringTest");
    expect(testCase.response.body).toBe("The value of foo is: ::this is a test::\n");
  });

  test("render to string inline", async () => {
    await testCase.get("renderToStringWithInlineAndRender");
    expect(testCase.response.body).toBe("Hello world!");
  });

  test("nested rendering", async () => {
    testCase.controller = new Fun.GamesController();
    await testCase.get("helloWorld");
    expect(testCase.response.body).toBe("Living in a nested world");
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

  test("should implicitly render html template from xhr request", async () => {
    await testCase.get("renderImplicitHtmlTemplateFromXhrRequest", { xhr: true });
    expect(testCase.response.body).toBe("XHR!\nHello HTML!");
  });

  test("should implicitly render js template without layout", async () => {
    await testCase.get("renderImplicitJsTemplateWithoutLayout", { format: "js", xhr: true });
    expect(testCase.response.body).not.toMatch(/<html>/);
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

  test("should render formatted html erb template with faulty accepts header", async () => {
    testCase.request.accept =
      "image/gif, image/x-xbitmap, image/jpeg, image/pjpeg, application/x-shockwave-flash, */*";
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

  test("layout test with different layout and symbol action", async () => {
    await testCase.get("layoutTestWithDifferentLayoutAndSymbolAction");
    expect(testCase.response.body).toBe("<html>Hello world!</html>");
  });

  test("rendering without layout", async () => {
    await testCase.get("renderingWithoutLayout");
    expect(testCase.response.body).toBe("Hello world!");
  });

  test("layout overriding layout", async () => {
    await testCase.get("layoutOverridingLayout");
    expect(testCase.response.body).not.toMatch(/<title>/);
  });

  test("rendering nothing on layout", async () => {
    await testCase.get("renderingNothingOnLayout");
    expect(testCase.response.body).toBe("");
  });

  test("render to string doesnt break assigns", async () => {
    await testCase.get("renderToStringWithAssigns");
    expect((testCase.controller as TestController).before).toBe("i'm before the render");
    expect((testCase.controller as TestController).after).toBe("i'm after the render");
  });

  test("bad render to string still throws exception", async () => {
    await expect(testCase.get("renderToStringWithException")).rejects.toThrow(MissingTemplate);
  });

  test("render to string that throws caught exception doesnt break assigns", async () => {
    await testCase.get("renderToStringWithCaughtException");
    expect((testCase.controller as TestController).before).toBe("i'm before the render");
    expect((testCase.controller as TestController).after).toBe("i'm after the render");
  });

  test("accessing params in template with layout", async () => {
    await testCase.get("accessingParamsInTemplateWithLayout", { params: { name: "David" } });
    expect(testCase.response.body).toBe("<html>Hello: David</html>");
  });

  test("render with explicit template", async () => {
    await testCase.get("renderWithExplicitTemplate");
    testCase.assertResponse("success");
  });

  test("render with explicit unescaped template", async () => {
    await expect(testCase.get("renderWithExplicitUnescapedTemplate")).rejects.toThrow(
      MissingTemplate,
    );
    await testCase.get("renderWithExplicitEscapedTemplate");
    expect(testCase.response.body).toBe("Hello w*rld!");
  });

  test("render with explicit string template", async () => {
    await testCase.get("renderWithExplicitStringTemplate");
    expect(testCase.response.body).toBe("<html>Hello world!</html>");
  });

  // BLOCKED: render-test-controller-gaps
  test.skip("render with filters", async () => {
    await testCase.get("renderWithFilters");
    expect(testCase.response.body).toBe("<test>passed formatted xml erb</test>");
  });

  test("double render", async () => {
    await expect(testCase.get("doubleRender")).rejects.toThrow(
      AbstractController.DoubleRenderError,
    );
  });

  // BLOCKED: render-test-controller-gaps
  test.skip("double redirect", async () => {
    await expect(testCase.get("doubleRedirect")).rejects.toThrow(
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

  // BLOCKED: render-test-controller-gaps
  test.skip("rendering with conflicting local vars", async () => {
    await testCase.get("renderingWithConflictingLocalVars");
    expect(testCase.response.body).toBe(
      "First: David\nSecond: Stephan\nThird: David\nFourth: David\nFifth: ",
    );
  });

  test("action talk to layout", async () => {
    await testCase.get("actionTalkToLayout");
    expect(testCase.response.body).toBe("<title>Talking to the layout</title>\nAction was here!");
  });

  test("render text with assigns", async () => {
    await testCase.get("renderTextWithAssigns");
    expect((testCase.controller as TestController).hello).toBe("world");
  });

  test("render text with assigns option", async () => {
    await testCase.get("renderWithAssignsOption");
    expect(testCase.response.body).toBe("world");
  });

  test("template with locals", async () => {
    await testCase.get("renderWithExplicitTemplateWithLocals");
    expect(testCase.response.body).toBe("The secret is area51\n");
  });

  test("yield content for", async () => {
    await testCase.get("yieldContentFor");
    expect(testCase.response.body).toBe(
      "<title>Putting stuff in the title!</title>\nGreat stuff!\n",
    );
  });

  // BLOCKED: template/handlers/builder.rb is unported (scripts/parity/unported-files/actionview.ts)
  test.skip("overwriting rendering relative file with extension", async () => {
    await testCase.get("helloWorldFromRxmlUsingTemplate");
    expect(testCase.response.body).toBe("<html>\n  <p>Hello</p>\n</html>\n");
    await testCase.get("helloWorldFromRxmlUsingAction");
    expect(testCase.response.body).toBe("<html>\n  <p>Hello</p>\n</html>\n");
  });

  test("using layout around block", async () => {
    await testCase.get("renderUsingLayoutAroundBlock");
    expect(testCase.response.body).toBe("Before (David)\nInside from block\nAfter");
  });

  test("using layout around block in main layout and within content for layout", async () => {
    await testCase.get("renderUsingLayoutAroundBlockInMainLayoutAndWithinContentForLayout");
    expect(testCase.response.body).toBe(
      "Before (Anthony)\nInside from first block in layout\nAfter\nBefore (David)\nInside from block\nAfter\nBefore (Ramm)\nInside from second block in layout\nAfter\n",
    );
  });

  test("partial only", async () => {
    await testCase.get("partialOnly");
    expect(testCase.response.body).toBe("only partial");
    expect(testCase.response.mediaType).toBe("text/html");
  });

  test("should render html formatted partial", async () => {
    await testCase.get("partial");
    expect(testCase.response.body).toBe("partial html");
    expect(testCase.response.mediaType).toBe("text/html");
  });

  test("render html formatted partial even with other mime time in accept", async () => {
    testCase.request.accept = "text/javascript, text/html";
    await testCase.get("partialHtmlErb");
    expect(testCase.response.body.trim()).toBe("partial.html.erb");
    expect(testCase.response.mediaType).toBe("text/html");
  });

  test("should render html partial with formats", async () => {
    await testCase.get("partialFormatsHtml");
    expect(testCase.response.body).toBe("partial html");
    expect(testCase.response.mediaType).toBe("text/html");
  });

  test("render to string partial", async () => {
    await testCase.get("renderToStringWithPartial");
    expect(String(rbObjIvarGet(testCase.controller, "@partial_only"))).toBe("only partial");
    expect(String(rbObjIvarGet(testCase.controller, "@partial_with_locals"))).toBe("Hello: david");
    expect(testCase.response.mediaType).toBe("text/html");
  });

  test("render to string with template and html partial", async () => {
    await testCase.get("renderToStringWithTemplateAndHtmlPartial");
    expect(String((testCase.controller as TestController).text)).toBe("**only partial**\n");
    expect(String((testCase.controller as TestController).html)).toBe(
      "<strong>only partial</strong>\n",
    );
    expect(testCase.response.body).toBe("<strong>only HTML partial</strong>\n");
    expect(testCase.response.mediaType).toBe("text/html");
  });

  test("render to string and render with different formats", async () => {
    await testCase.get("renderToStringAndRenderWithDifferentFormats");
    expect(String((testCase.controller as TestController).html)).toBe(
      "<strong>only partial</strong>\n",
    );
    expect(testCase.response.body).toBe("**only partial**\n");
    expect(testCase.response.mediaType).toBe("text/plain");
  });

  test("render template within a template with other format", async () => {
    await testCase.get("renderTemplateWithinATemplateWithOtherFormat");
    const expected = "only HTML partial<p>This is grand!</p>";
    expect(testCase.response.body.trim()).toBe(expected);
    expect(testCase.response.mediaType).toBe("text/html");
  });

  test("partial with counter", async () => {
    await testCase.get("partialWithCounter");
    expect(testCase.response.body).toBe("5");
  });

  test("partial with locals", async () => {
    await testCase.get("partialWithLocals");
    expect(testCase.response.body).toBe("Hello: david");
  });

  // BLOCKED: render-test-controller-gaps
  test.skip("partial with hashlike locals", async () => {
    await testCase.get("partialWithHashlikeLocals");
    expect(testCase.response.body).toBe("Hello: david");
  });

  test("partial with form builder", async () => {
    await testCase.get("partialWithFormBuilder");
    expect(testCase.response.body).toBe('<label for="post_title">Title</label>\n');
  });

  // BLOCKED: render-test-controller-gaps
  test.skip("partial with form builder and invalid model", async () => {
    await testCase.get("partialWithFormBuilderAndInvalidModel");
    expect(testCase.response.body.trim()).toBe(
      '<div class="field_with_errors"><label for="post_title">Title</label></div>',
    );
  });

  // BLOCKED: render-test-controller-gaps
  test.skip("partial with form builder and invalid model custom field error proc", async () => {
    const oldProc = Base.fieldErrorProc;
    Base.fieldErrorProc = function (html) {
      return (this.tag() as unknown as { div(...args: unknown[]): unknown }).div(html, {
        class: "errors",
      });
    };
    try {
      await testCase.get("partialWithFormBuilderAndInvalidModel");
      expect(testCase.response.body.trim()).toBe(
        '<div class="errors"><label for="post_title">Title</label></div>',
      );
    } finally {
      if (oldProc) Base.fieldErrorProc = oldProc;
    }
  });

  // BLOCKED: render-test-controller-gaps
  test.skip("partial with form builder and invalid model custom rendering field error proc", async () => {
    const oldProc = Base.fieldErrorProc;
    Base.fieldErrorProc = function (htmlTag, instance) {
      return this.render({
        inline:
          '<div class="field_with_errors"><%= html_tag %> <span class="error"><%= [instance.errorMessage()].join(", ") %></span></div>\n',
        locals: { html_tag: htmlTag, instance },
      });
    };
    try {
      await testCase.get("partialWithFormBuilderAndInvalidModel");
      expect(testCase.response.body.trim()).toBe(
        '<div class="field_with_errors"><label for="post_title">Title</label> <span class="error">can&#39;t be blank</span></div>',
      );
    } finally {
      if (oldProc) Base.fieldErrorProc = oldProc;
    }
  });

  test("partial with form builder subclass", async () => {
    await testCase.get("partialWithFormBuilderSubclass");
    expect(testCase.response.body).toBe('<label for="post_title">Title</label>\n');
  });

  test("nested partial with form builder", async () => {
    testCase.controller = new Fun.GamesController();
    await testCase.get("nestedPartialWithFormBuilder");
    expect(testCase.response.body).toBe('<label for="post_title">Title</label>\n');
  });

  test("namespaced object partial", async () => {
    testCase.controller = new Quiz.QuestionsController();
    await testCase.get("new");
    expect(testCase.response.body).toBe("Namespaced Partial");
  });

  test("partial collection", async () => {
    await testCase.get("partialCollection");
    expect(testCase.response.body).toBe("Hello: davidHello: mary");
  });

  test("partial collection with as", async () => {
    await testCase.get("partialCollectionWithAs");
    expect(testCase.response.body).toBe("david david davidmary mary mary");
  });

  test("partial collection with iteration", async () => {
    await testCase.get("partialCollectionWithIteration");
    expect(testCase.response.body).toBe("3-0: david-first3-1: mary3-2: christine-last");
  });

  test("partial collection with as and iteration", async () => {
    await testCase.get("partialCollectionWithAsAndIteration");
    expect(testCase.response.body).toBe("3-0: david-first3-1: mary3-2: christine-last");
  });

  test("partial collection with counter", async () => {
    await testCase.get("partialCollectionWithCounter");
    expect(testCase.response.body).toBe("david0mary1");
  });

  test("partial collection with as and counter", async () => {
    await testCase.get("partialCollectionWithAsAndCounter");
    expect(testCase.response.body).toBe("david0mary1");
  });

  test("partial collection with locals", async () => {
    await testCase.get("partialCollectionWithLocals");
    expect(testCase.response.body).toBe("Bonjour: davidBonjour: mary");
  });

  test("partial collection with spacer", async () => {
    await testCase.get("partialCollectionWithSpacer");
    expect(testCase.response.body).toBe("Hello: davidonly partialHello: mary");
  });

  test("partial collection with spacer which uses render", async () => {
    await testCase.get("partialCollectionWithSpacerWhichUsesRender");
    expect(testCase.response.body).toBe(
      "Hello: davidpartial html\npartial with partial\nHello: mary",
    );
  });

  test("partial collection shorthand with locals", async () => {
    await testCase.get("partialCollectionShorthandWithLocals");
    expect(testCase.response.body).toBe("Bonjour: davidBonjour: mary");
  });

  // BLOCKED: render-test-controller-gaps
  test.skip("partial collection shorthand with different types of records", async () => {
    await testCase.get("partialCollectionShorthandWithDifferentTypesOfRecords");
    expect(testCase.response.body).toBe(
      "Bonjour bad customer: mark0Bonjour good customer: craig1Bonjour bad customer: john2Bonjour good customer: zach3Bonjour good customer: brandon4Bonjour bad customer: dan5",
    );
  });

  test("empty partial collection", async () => {
    await testCase.get("emptyPartialCollection");
    expect(testCase.response.body).toBe(" ");
  });

  test("partial with hash object", async () => {
    await testCase.get("partialWithHashObject");
    expect(testCase.response.body).toBe("Sam\nmaS\n");
  });

  test("partial with nested object", async () => {
    await testCase.get("partialWithNestedObject");
    expect(testCase.response.body).toBe("first");
  });

  test("partial with nested object shorthand", async () => {
    await testCase.get("partialWithNestedObjectShorthand");
    expect(testCase.response.body).toBe("first");
  });

  test("hash partial collection", async () => {
    await testCase.get("partialHashCollection");
    expect(testCase.response.body).toBe("Pratik\nkitarP\nAmy\nymA\n");
  });

  test("partial hash collection with locals", async () => {
    await testCase.get("partialHashCollectionWithLocals");
    expect(testCase.response.body).toBe("Hola: PratikHola: Amy");
  });

  test("render missing partial template", async () => {
    await expect(testCase.get("missingPartial")).rejects.toThrow(MissingTemplate);
  });

  test("render call to partial with layout", async () => {
    await testCase.get("renderCallToPartialWithLayout");
    expect(testCase.response.body).toBe("Before (David)\nInside from partial (David)\nAfter");
  });

  test("render call to partial with layout in main layout and within content for layout", async () => {
    await testCase.get("renderCallToPartialWithLayoutInMainLayoutAndWithinContentForLayout");
    expect(testCase.response.body).toBe(
      "Before (Anthony)\nInside from partial (Anthony)\nAfter\nBefore (David)\nInside from partial (David)\nAfter\nBefore (Ramm)\nInside from partial (Ramm)\nAfter",
    );
  });

  // BLOCKED: render-test-controller-gaps
  test.skip("template annotations", async () => {
    await withAnnotationsEnabled(() => testCase.get("greeting"));
    expect(testCase.response.body).toContain("<!-- BEGIN");
    expect(testCase.response.body).toContain("<!-- END");
    expect(testCase.response.body).toContain("fixtures/actionpack/test/greeting.html.tse");
    expect(testCase.response.body).toContain("This is grand!");
  });

  // BLOCKED: render-test-controller-gaps
  test.skip("template annotations do not render for non html format", async () => {
    await withAnnotationsEnabled(() => testCase.get("renderWithExplicitTemplateWithLocals"));
    expect(testCase.response.body).not.toContain("BEGIN");
    expect(stringSplit(testCase.response.body, "\n").length).toBe(1);
  });

  test("line offset with annotations enabled", async () => {
    await expect(withAnnotationsEnabled(() => testCase.get("renderLineOffset"))).rejects.toThrow(
      Template.Error,
    );
  });

  async function withAnnotationsEnabled(block: () => Promise<unknown>): Promise<void> {
    Base.annotateRenderedViewWithFilenames = true;
    DetailsKey.clear();
    try {
      await block();
    } finally {
      Base.annotateRenderedViewWithFilenames = false;
      DetailsKey.clear();
    }
  }
});
