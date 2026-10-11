import { beforeEach, describe, it } from "vitest";
import { FixtureResolver } from "@blazetrails/actionview";
import { assertMatch } from "@blazetrails/activesupport";
import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { controllerConstants } from "../../../action-dispatch/http/request.js";
import { deprecator } from "../../../action-dispatch/deprecator.js";
import type { RouteSet } from "../../../action-dispatch/routing/route-set.js";
import { ApplicationController, Rack } from "../../../test-helpers/abstract-unit.js";

registerConstant("RenderTemplate", { name: "RenderTemplate" });

class WithoutLayoutController extends Base {
  static {
    Object.defineProperty(this, "name", { value: "RenderTemplate::WithoutLayoutController" });
    this.viewPaths([
      new FixtureResolver({
        "test/basic.html.tse": "Hello from basic.html.erb",
        "shared.html.tse": "Elastica",
        "locals.html.tse": "The secret is <%= secret %>",
        "xml_template.xml.builder": "xml.html do\n  xml.p 'Hello'\nend",
        "with_raw.html.tse": "Hello <%=raw('<strong>this is raw</strong>') %>",
        "with_implicit_raw.html.tse":
          "Hello <%== '<strong>this is also raw</strong>' %> in an HTML template",
        "with_implicit_raw.text.tse":
          "Hello <%== '<strong>this is also raw</strong>' %> in a text template",
        "test/with_json.html.tse":
          "<%= render({ template: 'test/with_json', formats: [':json'] }) %>",
        "test/with_json.json.tse": "<%= render({ template: 'test/final', formats: [':json'] }) %>",
        "test/final.json.tse": "{ final: json }",
        "test/with_error.html.tse": "<%= (() => { throw new Error('i do not exist') })() %>",
      }),
    ]);
  }

  async index(): Promise<void> {
    await this.render({ template: "test/basic" });
  }

  async htmlWithJsonInsideJson(): Promise<void> {
    await this.render({ template: "test/with_json" });
  }

  async indexWithoutKey(): Promise<void> {
    await this.render("test/basic");
  }

  async inTopDirectory(): Promise<void> {
    await this.render({ template: "shared" });
  }

  async inTopDirectoryWithSlash(): Promise<void> {
    await this.render({ template: "/shared" });
  }

  async inTopDirectoryWithSlashWithoutKey(): Promise<void> {
    await this.render("/shared");
  }

  async withLocals(): Promise<void> {
    await this.render({ template: "locals", locals: { secret: "area51" } });
  }

  async withLocalsWithSlash(): Promise<void> {
    await this.render({ template: "/locals", locals: { secret: "area51" } });
  }

  async withLocalsWithSlashWithoutKey(): Promise<void> {
    await this.render("/locals", { locals: { secret: "area51" } });
  }

  async builderTemplate(): Promise<void> {
    await this.render({ template: "xml_template" });
  }

  async withRaw(): Promise<void> {
    await this.render({ template: "with_raw" });
  }

  async withImplicitRaw(): Promise<void> {
    await this.render({ template: "with_implicit_raw" });
  }

  async withError(): Promise<void> {
    await this.render({ template: "test/with_error" });
  }

  /** @internal */
  override isShowDetailedExceptions = function (this: WithoutLayoutController): boolean {
    return this.request.isLocal;
  };
}

class TestWithoutLayout extends Rack.TestCase {
  static {
    this.testing(WithoutLayoutController);
  }
}

describe("TestWithoutLayout", () => {
  let t: TestWithoutLayout;

  const assertBody = (body: string): void => t.assertBody(body);

  const assertStatus = (code: number): void => t.assertStatus(code);

  const assertContentType = (type: string): void => t.assertContentType(type);

  const assertResponse = (body: string): void => t.assertResponse(body);

  beforeEach(({ task }) => {
    t = new TestWithoutLayout(task.name);
  });

  it("rendering a normal template with full path without layout", async () => {
    await t.get(":index");
    assertResponse("Hello from basic.html.erb");
  });

  it("rendering a normal template with full path without layout without key", async () => {
    await t.get(":indexWithoutKey");
    assertResponse("Hello from basic.html.erb");
  });

  it("rendering a template not in a subdirectory", async () => {
    await t.get(":inTopDirectory");
    assertResponse("Elastica");
  });

  it("rendering a template not in a subdirectory with a leading slash", async () => {
    await t.get(":inTopDirectoryWithSlash");
    assertResponse("Elastica");
  });

  it("rendering a template not in a subdirectory with a leading slash without key", async () => {
    await t.get(":inTopDirectoryWithSlashWithoutKey");
    assertResponse("Elastica");
  });

  it("rendering a template with local variables", async () => {
    await t.get(":withLocals");
    assertResponse("The secret is area51");
  });

  it("rendering a template with local variables with a leading slash", async () => {
    await t.get(":withLocalsWithSlash");
    assertResponse("The secret is area51");
  });

  it("rendering a template with local variables with a slash without key", async () => {
    await t.get(":withLocalsWithSlashWithoutKey");
    assertResponse("The secret is area51");
  });

  // PERMANENT-SKIP: renders a `.builder` template; `template/handlers/builder.rb` is unported (scripts/parity/unported-files/actionview.ts), the `builder` gem being a third-party runtime dep.
  it.skip("rendering a builder template", async () => {
    await t.get(":builderTemplate", { params: { format: "xml" } });
    assertResponse("<html>\n  <p>Hello</p>\n</html>\n");
  });

  it("rendering a template with <%=raw stuff %>", async () => {
    await t.get(":withRaw");

    assertBody("Hello <strong>this is raw</strong>");
    assertStatus(200);

    await t.get(":withImplicitRaw");

    assertBody("Hello <strong>this is also raw</strong> in an HTML template");
    assertStatus(200);

    await t.get(":withImplicitRaw", { params: { format: "text" } });

    assertBody("Hello <strong>this is also raw</strong> in a text template");
    assertStatus(200);
  });

  it("rendering a template with renders another template with other format that renders other template in the same format", async () => {
    await t.get(":htmlWithJsonInsideJson");
    assertContentType("text/html; charset=utf-8");
    assertResponse("{ final: json }");
  });

  it("rendering a template with error properly excerts the code", async () => {
    await t.get(":withError");
    assertStatus(500);
    assertMatch("i do not exist", t.response.body);
  });
});

class WithLayoutController extends ApplicationController {
  static {
    Object.defineProperty(this, "name", { value: "RenderTemplate::WithLayoutController" });
    this.viewPaths([
      new FixtureResolver({
        "test/basic.html.tse": "Hello from basic.html.erb",
        "shared.html.tse": "Elastica",
        "layouts/application.html.tse": "<%= yield %>, I'm here!",
        "layouts/greetings.html.tse": "<%= yield %>, I wish thee well.",
      }),
    ]);
  }

  async index(): Promise<void> {
    await this.render({ template: "test/basic" });
  }

  async withLayout(): Promise<void> {
    await this.render({ template: "test/basic", layout: true });
  }

  async withLayoutFalse(): Promise<void> {
    await this.render({ template: "test/basic", layout: false });
  }

  async withLayoutNil(): Promise<void> {
    await this.render({ template: "test/basic", layout: null });
  }

  async withCustomLayout(): Promise<void> {
    await this.render({ template: "test/basic", layout: "greetings" });
  }
}

controllerConstants.set("render_template/without_layout", WithoutLayoutController);
controllerConstants.set("render_template/with_layout", WithLayoutController);

class TestWithLayout extends Rack.TestCase {}

describe("TestWithLayout", () => {
  let t: TestWithLayout;

  const assertBody = (body: string): void => t.assertBody(body);

  const assertStatus = (code: number): void => t.assertStatus(code);

  beforeEach(({ task }) => {
    t = new TestWithLayout(task.name);
  });

  it("rendering with implicit layout", async () => {
    await t.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        deprecator().silence(() => {
          this.get(":controller", { action: "index" });
        });
      });

      await t.get("/render_template/with_layout");

      assertBody("Hello from basic.html.erb, I'm here!");
      assertStatus(200);
    });
  });

  it("rendering with layout => true", async () => {
    await t.get("/render_template/with_layout/withLayout");

    assertBody("Hello from basic.html.erb, I'm here!");
    assertStatus(200);
  });

  it("rendering with layout => false", async () => {
    await t.get("/render_template/with_layout/withLayoutFalse");

    assertBody("Hello from basic.html.erb");
    assertStatus(200);
  });

  it("rendering with layout => nil", async () => {
    await t.get("/render_template/with_layout/withLayoutNil");

    assertBody("Hello from basic.html.erb");
    assertStatus(200);
  });

  it("rendering layout => 'greetings'", async () => {
    await t.get("/render_template/with_layout/withCustomLayout");

    assertBody("Hello from basic.html.erb, I wish thee well.");
    assertStatus(200);
  });
});

{
  registerConstant("RenderTemplate::Compatibility", { name: "RenderTemplate::Compatibility" });

  class WithoutLayoutController extends Base {
    static {
      Object.defineProperty(this, "name", {
        value: "RenderTemplate::Compatibility::WithoutLayoutController",
      });
      this.viewPaths([
        new FixtureResolver({
          "test/basic.html.tse": "Hello from basic.html.erb",
          "shared.html.tse": "Elastica",
        }),
      ]);
    }

    async withForwardSlash(): Promise<void> {
      await this.render({ template: "/test/basic" });
    }
  }

  controllerConstants.set("render_template/compatibility/without_layout", WithoutLayoutController);

  class TestTemplateRenderWithForwardSlash extends Rack.TestCase {}

  describe("TestTemplateRenderWithForwardSlash", () => {
    let t: TestTemplateRenderWithForwardSlash;

    const assertBody = (body: string): void => t.assertBody(body);

    const assertStatus = (code: number): void => t.assertStatus(code);

    beforeEach(({ task }) => {
      t = new TestTemplateRenderWithForwardSlash(task.name);
    });

    it("rendering a normal template with full path starting with a leading slash", async () => {
      await t.get("/render_template/compatibility/without_layout/withForwardSlash");

      assertBody("Hello from basic.html.erb");
      assertStatus(200);
    });
  });
}
