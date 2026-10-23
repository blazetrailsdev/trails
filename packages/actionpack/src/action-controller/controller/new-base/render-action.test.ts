import { beforeEach, describe, it } from "vitest";
import { FixtureResolver, MissingTemplate } from "@blazetrails/actionview";
import { assertRaises } from "@blazetrails/activesupport";
import { ArgumentError, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { controllerConstants } from "../../../action-dispatch/http/request.js";
import { ApplicationController, Rack } from "../../../test-helpers/abstract-unit.js";

{
  registerConstant("RenderAction", { name: "RenderAction" });

  class BasicController extends Base {
    static {
      Object.defineProperty(this, "name", { value: "RenderAction::BasicController" });
      this.viewPaths([
        new FixtureResolver({ "render-action/basic/hello-world.html.tse": "Hello world!" }),
      ]);
    }

    async helloWorld(): Promise<void> {
      await this.render({ action: "helloWorld" });
    }

    async helloWorldAsString(): Promise<void> {
      await this.render("helloWorld");
    }

    async helloWorldAsStringWithOptions(): Promise<void> {
      await this.render("helloWorld", { status: 404 });
    }

    async helloWorldAsSymbol(): Promise<void> {
      await this.render("helloWorld");
    }

    async helloWorldWithSymbol(): Promise<void> {
      await this.render({ action: "helloWorld" });
    }

    async helloWorldWithLayout(): Promise<void> {
      await this.render({ action: "helloWorld", layout: true });
    }

    async helloWorldWithLayoutFalse(): Promise<void> {
      await this.render({ action: "helloWorld", layout: false });
    }

    async helloWorldWithLayoutNil(): Promise<void> {
      await this.render({ action: "helloWorld", layout: null });
    }

    async helloWorldWithCustomLayout(): Promise<void> {
      await this.render({ action: "helloWorld", layout: "greetings" });
    }
  }

  controllerConstants.set("render_action/basic", BasicController);

  class RenderActionTest extends Rack.TestCase {}

  describe("RenderActionTest", () => {
    let t: RenderActionTest;
    const assertBody = (body: string): void => t.assertBody(body);
    const assertStatus = (code: number): void => t.assertStatus(code);

    beforeEach(({ task }) => {
      t = new RenderActionTest(task.name);
    });

    it("rendering an action using :action => <String>", async () => {
      await t.get("/render_action/basic/helloWorld");

      assertBody("Hello world!");
      assertStatus(200);
    });

    it("rendering an action using '<action>'", async () => {
      await t.get("/render_action/basic/helloWorldAsString");

      assertBody("Hello world!");
      assertStatus(200);
    });

    it("rendering an action using '<action>' and options", async () => {
      await t.get("/render_action/basic/helloWorldAsStringWithOptions");

      assertBody("Hello world!");
      assertStatus(404);
    });

    it("rendering an action using :action", async () => {
      await t.get("/render_action/basic/helloWorldAsSymbol");

      assertBody("Hello world!");
      assertStatus(200);
    });

    it("rendering an action using :action => :hello_world", async () => {
      await t.get("/render_action/basic/helloWorldWithSymbol");

      assertBody("Hello world!");
      assertStatus(200);
    });
  });

  class RenderLayoutTest extends Rack.TestCase {}

  describe("RenderLayoutTest", () => {
    let t: RenderLayoutTest;
    const assertBody = (body: string): void => t.assertBody(body);
    const assertStatus = (code: number): void => t.assertStatus(code);

    beforeEach(({ task }) => {
      t = new RenderLayoutTest(task.name);
    });

    it("rendering with layout => true", async () => {
      await assertRaises([ArgumentError], {}, async () => {
        await t.get("/render_action/basic/helloWorldWithLayout", {
          headers: { "action_dispatch.show_exceptions": "none" },
        });
      });
    });

    it("rendering with layout => false", async () => {
      await t.get("/render_action/basic/helloWorldWithLayoutFalse");

      assertBody("Hello world!");
      assertStatus(200);
    });

    it("rendering with layout => :nil", async () => {
      await t.get("/render_action/basic/helloWorldWithLayoutNil");

      assertBody("Hello world!");
      assertStatus(200);
    });

    it("rendering with layout => 'greetings'", async () => {
      await assertRaises([MissingTemplate], {}, async () => {
        await t.get("/render_action/basic/helloWorldWithCustomLayout", {
          headers: { "action_dispatch.show_exceptions": "none" },
        });
      });
    });
  });
}

{
  registerConstant("RenderActionWithApplicationLayout", {
    name: "RenderActionWithApplicationLayout",
  });

  class BasicController extends ApplicationController {
    static {
      Object.defineProperty(this, "name", {
        value: "RenderActionWithApplicationLayout::BasicController",
      });
      this.viewPaths([
        new FixtureResolver({
          "render-action-with-application-layout/basic/hello-world.html.tse": "Hello World!",
          "render-action-with-application-layout/basic/hello.html.builder": "xml.p 'Hello'",
          "layouts/application.html.tse": "Hi <%= yield %> OK, Bye",
          "layouts/greetings.html.tse": "Greetings <%= yield %> Bye",
          "layouts/builder.html.builder": "xml.html do\n  xml << yield\nend",
        }),
      ]);
    }

    async helloWorld(): Promise<void> {
      await this.render({ action: "helloWorld" });
    }

    async helloWorldWithLayout(): Promise<void> {
      await this.render({ action: "helloWorld", layout: true });
    }

    async helloWorldWithLayoutFalse(): Promise<void> {
      await this.render({ action: "helloWorld", layout: false });
    }

    async helloWorldWithLayoutNil(): Promise<void> {
      await this.render({ action: "helloWorld", layout: null });
    }

    async helloWorldWithCustomLayout(): Promise<void> {
      await this.render({ action: "helloWorld", layout: "greetings" });
    }

    async withBuilderAndLayout(): Promise<void> {
      await this.render({ action: "hello", layout: "builder" });
    }
  }

  controllerConstants.set("render_action_with_application_layout/basic", BasicController);

  class LayoutTest extends Rack.TestCase {}

  describe("LayoutTest", () => {
    let t: LayoutTest;
    const assertBody = (body: string): void => t.assertBody(body);
    const assertStatus = (code: number): void => t.assertStatus(code);

    beforeEach(({ task }) => {
      t = new LayoutTest(task.name);
    });

    it("rendering implicit application.html.erb as layout", async () => {
      await t.get("/render_action_with_application_layout/basic/helloWorld");

      assertBody("Hi Hello World! OK, Bye");
      assertStatus(200);
    });

    it("rendering with layout => true", async () => {
      await t.get("/render_action_with_application_layout/basic/helloWorldWithLayout");

      assertBody("Hi Hello World! OK, Bye");
      assertStatus(200);
    });

    it("rendering with layout => false", async () => {
      await t.get("/render_action_with_application_layout/basic/helloWorldWithLayoutFalse");

      assertBody("Hello World!");
      assertStatus(200);
    });

    it("rendering with layout => :nil", async () => {
      await t.get("/render_action_with_application_layout/basic/helloWorldWithLayoutNil");

      assertBody("Hello World!");
      assertStatus(200);
    });

    it("rendering with layout => 'greetings'", async () => {
      await t.get("/render_action_with_application_layout/basic/helloWorldWithCustomLayout");

      assertBody("Greetings Hello World! Bye");
      assertStatus(200);
    });
  });

  class TestLayout extends Rack.TestCase {
    static {
      this.testing(BasicController);
    }
  }

  describe("TestLayout", () => {
    let t: TestLayout;
    const assertResponse = (body: string): void => t.assertResponse(body);

    beforeEach(({ task }) => {
      t = new TestLayout(task.name);
    });

    // PERMANENT-SKIP: renders a `.builder` template; `template/handlers/builder.rb` is unported (scripts/parity/unported-files/actionview.ts), the `builder` gem being a third-party runtime dep.
    it.skip("builder works with layouts", async () => {
      await t.get(":withBuilderAndLayout");
      assertResponse("<html>\n<p>Hello</p>\n</html>\n");
    });
  });
}

{
  registerConstant("RenderActionWithControllerLayout", {
    name: "RenderActionWithControllerLayout",
  });

  class BasicController extends Base {
    static {
      Object.defineProperty(this, "name", {
        value: "RenderActionWithControllerLayout::BasicController",
      });
      this.viewPaths([
        new FixtureResolver({
          "render-action-with-controller-layout/basic/hello-world.html.tse": "Hello World!",
          "layouts/render-action-with-controller-layout/basic.html.tse":
            "With Controller Layout! <%= yield %> Bye",
        }),
      ]);
    }

    async helloWorld(): Promise<void> {
      await this.render({ action: "helloWorld" });
    }

    async helloWorldWithLayout(): Promise<void> {
      await this.render({ action: "helloWorld", layout: true });
    }

    async helloWorldWithLayoutFalse(): Promise<void> {
      await this.render({ action: "helloWorld", layout: false });
    }

    async helloWorldWithLayoutNil(): Promise<void> {
      await this.render({ action: "helloWorld", layout: null });
    }

    async helloWorldWithCustomLayout(): Promise<void> {
      await this.render({ action: "helloWorld", layout: "greetings" });
    }
  }

  controllerConstants.set("render_action_with_controller_layout/basic", BasicController);

  class ControllerLayoutTest extends Rack.TestCase {}

  describe("ControllerLayoutTest", () => {
    let t: ControllerLayoutTest;
    const assertBody = (body: string): void => t.assertBody(body);
    const assertStatus = (code: number): void => t.assertStatus(code);

    beforeEach(({ task }) => {
      t = new ControllerLayoutTest(task.name);
    });

    it("render hello_world and implicitly use <controller_path>.html.erb as a layout.", async () => {
      await t.get("/render_action_with_controller_layout/basic/helloWorld");

      assertBody("With Controller Layout! Hello World! Bye");
      assertStatus(200);
    });

    it("rendering with layout => true", async () => {
      await t.get("/render_action_with_controller_layout/basic/helloWorldWithLayout");

      assertBody("With Controller Layout! Hello World! Bye");
      assertStatus(200);
    });

    it("rendering with layout => false", async () => {
      await t.get("/render_action_with_controller_layout/basic/helloWorldWithLayoutFalse");

      assertBody("Hello World!");
      assertStatus(200);
    });

    it("rendering with layout => :nil", async () => {
      await t.get("/render_action_with_controller_layout/basic/helloWorldWithLayoutNil");

      assertBody("Hello World!");
      assertStatus(200);
    });
  });
}

{
  registerConstant("RenderActionWithBothLayouts", { name: "RenderActionWithBothLayouts" });

  class BasicController extends Base {
    static {
      Object.defineProperty(this, "name", {
        value: "RenderActionWithBothLayouts::BasicController",
      });
      this.viewPaths([
        new FixtureResolver({
          "render-action-with-both-layouts/basic/hello-world.html.tse": "Hello World!",
          "layouts/application.html.tse": "Oh Hi <%= yield %> Bye",
          "layouts/render-action-with-both-layouts/basic.html.tse":
            "With Controller Layout! <%= yield %> Bye",
        }),
      ]);
    }

    async helloWorld(): Promise<void> {
      await this.render({ action: "helloWorld" });
    }

    async helloWorldWithLayout(): Promise<void> {
      await this.render({ action: "helloWorld", layout: true });
    }

    async helloWorldWithLayoutFalse(): Promise<void> {
      await this.render({ action: "helloWorld", layout: false });
    }

    async helloWorldWithLayoutNil(): Promise<void> {
      await this.render({ action: "helloWorld", layout: null });
    }
  }

  controllerConstants.set("render_action_with_both_layouts/basic", BasicController);

  class ControllerLayoutTest extends Rack.TestCase {}

  describe("ControllerLayoutTest", () => {
    let t: ControllerLayoutTest;
    const assertBody = (body: string): void => t.assertBody(body);
    const assertStatus = (code: number): void => t.assertStatus(code);

    beforeEach(({ task }) => {
      t = new ControllerLayoutTest(task.name);
    });

    it("rendering implicitly use <controller_path>.html.erb over application.html.erb as a layout", async () => {
      await t.get("/render_action_with_both_layouts/basic/helloWorld");

      assertBody("With Controller Layout! Hello World! Bye");
      assertStatus(200);
    });

    it("rendering with layout => true", async () => {
      await t.get("/render_action_with_both_layouts/basic/helloWorldWithLayout");

      assertBody("With Controller Layout! Hello World! Bye");
      assertStatus(200);
    });

    it("rendering with layout => false", async () => {
      await t.get("/render_action_with_both_layouts/basic/helloWorldWithLayoutFalse");

      assertBody("Hello World!");
      assertStatus(200);
    });

    it("rendering with layout => :nil", async () => {
      await t.get("/render_action_with_both_layouts/basic/helloWorldWithLayoutNil");

      assertBody("Hello World!");
      assertStatus(200);
    });
  });
}
