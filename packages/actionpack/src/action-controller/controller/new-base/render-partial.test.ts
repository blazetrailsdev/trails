import { beforeEach, describe, it } from "vitest";
import { FixtureResolver } from "@blazetrails/actionview";
import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { controllerConstants } from "../../../action-dispatch/http/request.js";
import { Rack } from "../../../test-helpers/abstract-unit.js";

registerConstant("RenderPartial", { name: "RenderPartial" });

class BasicController extends Base {
  declare testUnchanged: string;

  static {
    Object.defineProperty(this, "name", { value: "RenderPartial::BasicController" });
    this.viewPaths([
      new FixtureResolver({
        "render-partial/basic/_basic.html.tse": "BasicPartial!",
        "render-partial/basic/basic.html.tse":
          "<%= this.testUnchanged = 'goodbye' %><%= render({ partial: 'basic' }) %><%= this.testUnchanged %>",
        "render-partial/basic/with-json.html.tse":
          "<%= render({ partial: 'with_json', formats: [':json'] }) %>",
        "render-partial/basic/_with_json.json.tse":
          "<%= render({ partial: 'final', formats: [':json'] }) %>",
        "render-partial/basic/_final.json.tse": "{ final: json }",
        "render-partial/basic/overridden.html.tse":
          "<%= this.testUnchanged = 'goodbye' %><%= render({ partial: 'overridden' }) %><%= this.testUnchanged %>",
        "render-partial/basic/_overridden.html.tse": "ParentPartial!",
        "render-partial/child/_overridden.html.tse": "OverriddenPartial!",
      }),
    ]);
  }

  async htmlWithJsonInsideJson(): Promise<void> {
    await this.render({ action: "withJson" });
  }

  async changing(): Promise<void> {
    this.testUnchanged = "hello";
    await this.render({ action: "basic" });
  }

  overridden(): void {
    this.testUnchanged = "hello";
  }
}

class ChildController extends BasicController {
  static {
    Object.defineProperty(this, "name", { value: "RenderPartial::ChildController" });
  }
}

controllerConstants.set("render_partial/basic", BasicController);
controllerConstants.set("render_partial/child", ChildController);

class TestPartial extends Rack.TestCase {
  static {
    this.testing(BasicController);
  }
}

describe("TestPartial", () => {
  let t: TestPartial;

  const assertContentType = (type: string): void => t.assertContentType(type);

  const assertResponse = (body: string): void => t.assertResponse(body);

  beforeEach(({ task }) => {
    t = new TestPartial(task.name);
  });

  it("rendering a partial in ActionView doesn't pull the ivars again from the controller", async () => {
    await t.get(":changing");
    assertResponse("goodbyeBasicPartial!goodbye");
  });

  it("rendering a template with renders another partial with other format that renders other partial in the same format", async () => {
    await t.get(":htmlWithJsonInsideJson");
    assertContentType("text/html; charset=utf-8");
    assertResponse("{ final: json }");
  });
});

class TestInheritedPartial extends Rack.TestCase {
  static {
    this.testing(ChildController);
  }
}

describe("TestInheritedPartial", () => {
  let t: TestInheritedPartial;

  const assertResponse = (body: string): void => t.assertResponse(body);

  beforeEach(({ task }) => {
    t = new TestInheritedPartial(task.name);
  });

  it("partial from parent controller gets picked if missing in child one", async () => {
    await t.get(":changing");
    assertResponse("goodbyeBasicPartial!goodbye");
  });

  it("partial from child controller gets picked", async () => {
    await t.get(":overridden");
    assertResponse("goodbyeOverriddenPartial!goodbye");
  });
});
