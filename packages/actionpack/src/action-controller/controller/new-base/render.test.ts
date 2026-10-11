import { beforeEach, describe, it } from "vitest";
import { FixtureResolver } from "@blazetrails/actionview";
import { assertRaises } from "@blazetrails/activesupport";
import { registerConstant } from "@blazetrails/ruby-compat";
import { ActionNotFound } from "../../../abstract-controller/base.js";
import { DoubleRenderError } from "../../../abstract-controller/rendering.js";
import { Base } from "../../base.js";
import { controllerConstants } from "../../../action-dispatch/http/request.js";
import { deprecator } from "../../../action-dispatch/deprecator.js";
import type { RouteSet } from "../../../action-dispatch/routing/route-set.js";
import { Rack } from "../../../test-helpers/abstract-unit.js";

registerConstant("Render", { name: "Render" });

class BlankRenderController extends Base {
  static {
    Object.defineProperty(this, "name", { value: "Render::BlankRenderController" });
    this.viewPaths([
      new FixtureResolver({
        "render/blank-render/index.html.tse": "Hello world!",
        "render/blank-render/access-request.html.tse":
          "The request: <%= request.method.toString().toUpperCase() %>",
        "render/blank-render/access-action-name.html.tse": "Action Name: <%= actionName %>",
        "render/blank-render/access-controller-name.html.tse":
          "Controller Name: <%= controllerName() %>",
        "render/blank-render/overridden-with-own-view-paths-appended.html.tse": "parent content",
        "render/blank-render/overridden-with-own-view-paths-prepended.html.tse": "parent content",
        "render/blank-render/overridden.html.tse": "parent content",
        "render/child-render/overridden.html.tse": "child content",
      }),
    ]);
  }

  async index(): Promise<void> {
    await this.render();
  }

  async accessRequest(): Promise<void> {
    await this.render({ action: "accessRequest" });
  }

  async renderActionName(): Promise<void> {
    await this.render({ action: "accessActionName" });
  }

  overriddenWithOwnViewPathsAppended(): void {}

  overriddenWithOwnViewPathsPrepended(): void {}

  overridden(): void {}

  /** @internal */
  private async secretz(): Promise<void> {
    await this.render({ plain: "FAIL WHALE!" });
  }
}

class DoubleRenderController extends Base {
  static {
    Object.defineProperty(this, "name", { value: "Render::DoubleRenderController" });
  }

  async index(): Promise<void> {
    await this.render({ plain: "hello" });
    await this.render({ plain: "world" });
  }
}

class ChildRenderController extends BlankRenderController {
  static {
    Object.defineProperty(this, "name", { value: "Render::ChildRenderController" });
    this.appendViewPath(
      new FixtureResolver({
        "render/child-render/overridden-with-own-view-paths-appended.html.tse": "child content",
      }),
    );
    this.prependViewPath(
      new FixtureResolver({
        "render/child-render/overridden-with-own-view-paths-prepended.html.tse": "child content",
      }),
    );
  }
}

controllerConstants.set("render/blank_render", BlankRenderController);
controllerConstants.set("render/double_render", DoubleRenderController);
controllerConstants.set("render/child_render", ChildRenderController);

class RenderTest extends Rack.TestCase {}

describe("RenderTest", () => {
  let t: RenderTest;

  const assertBody = (body: string): void => t.assertBody(body);

  const assertStatus = (code: number): void => t.assertStatus(code);

  beforeEach(({ task }) => {
    t = new RenderTest(task.name);
  });

  it("render with blank", async () => {
    await t.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        deprecator().silence(() => {
          this.get(":controller", { action: "index" });
        });
      });

      await t.get("/render/blank_render");

      assertBody("Hello world!");
      assertStatus(200);
    });
  });

  // BLOCKED: debug-exceptions-gates-on-wrapper-show-and-request-headers
  it.skip("rendering more than once raises an exception", async () => {
    await t.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        deprecator().silence(() => {
          this.get(":controller", { action: "index" });
        });
      });

      await assertRaises([DoubleRenderError], {}, async () => {
        await t.get("/render/double_render", {
          headers: { "action_dispatch.show_exceptions": "none" },
        });
      });
    });
  });
});

class TestOnlyRenderPublicActions extends Rack.TestCase {}

describe("TestOnlyRenderPublicActions", () => {
  let t: TestOnlyRenderPublicActions;

  beforeEach(({ task }) => {
    t = new TestOnlyRenderPublicActions(task.name);
  });

  // BLOCKED: debug-exceptions-gates-on-wrapper-show-and-request-headers
  it.skip("raises an exception when a method of Object is called", async () => {
    await assertRaises([ActionNotFound], {}, async () => {
      await t.get("/render/blank_render/clone", {
        headers: { "action_dispatch.show_exceptions": "none" },
      });
    });
  });

  // PERMANENT-SKIP: Ruby method visibility is not carried at run time (CLAUDE.md, "Method visibility is compile-time only").
  it.skip("raises an exception when a private method is called", async () => {
    await assertRaises([ActionNotFound], {}, async () => {
      await t.get("/render/blank_render/secretz", {
        headers: { "action_dispatch.show_exceptions": "none" },
      });
    });
  });
});

class TestVariousObjectsAvailableInView extends Rack.TestCase {}

describe("TestVariousObjectsAvailableInView", () => {
  let t: TestVariousObjectsAvailableInView;

  const assertBody = (body: string): void => t.assertBody(body);

  beforeEach(({ task }) => {
    t = new TestVariousObjectsAvailableInView(task.name);
  });

  it("The request object is accessible in the view", async () => {
    await t.get("/render/blank_render/accessRequest");
    assertBody("The request: GET");
  });

  it("The action_name is accessible in the view", async () => {
    await t.get("/render/blank_render/renderActionName");
    assertBody("Action Name: renderActionName");
  });

  it("The controller_name is accessible in the view", async () => {
    await t.get("/render/blank_render/accessControllerName");
    assertBody("Controller Name: blank_render");
  });
});

class TestViewInheritance extends Rack.TestCase {}

describe("TestViewInheritance", () => {
  let t: TestViewInheritance;

  const assertBody = (body: string): void => t.assertBody(body);

  beforeEach(({ task }) => {
    t = new TestViewInheritance(task.name);
  });

  it("Template from child controller gets picked over parent one", async () => {
    await t.get("/render/child_render/overridden");
    assertBody("child content");
  });

  it("Template from child controller with custom view_paths prepended gets picked over parent one", async () => {
    await t.get("/render/child_render/overriddenWithOwnViewPathsPrepended");
    assertBody("child content");
  });

  it("Template from child controller with custom view_paths appended gets picked over parent one", async () => {
    await t.get("/render/child_render/overriddenWithOwnViewPathsAppended");
    assertBody("child content");
  });

  it("Template from parent controller gets picked if missing in child controller", async () => {
    await t.get("/render/child_render/index");
    assertBody("Hello world!");
  });
});
