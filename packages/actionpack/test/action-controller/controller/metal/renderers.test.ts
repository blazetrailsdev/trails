import { beforeEach, describe, it } from "vitest";
import { toXml } from "@blazetrails/activesupport";
import { assertEqual } from "@blazetrails/activesupport/testing/assertions";
import { include } from "@blazetrails/ruby-compat/include";
import "../../../support/abstract-unit.js";
import { Rendering as AbstractControllerRendering } from "../../../../lib/abstract-controller/rendering.js";
import { Metal } from "../../../../lib/action-controller/metal.js";
import { Renderers } from "../../../../lib/action-controller/metal/renderers.js";
import { Rendering } from "../../../../lib/action-controller/metal/rendering.js";
import { TestCase } from "../../../../lib/action-controller/test-case.js";

class MetalRenderingController extends Metal {
  declare static useRenderers: (typeof Renderers.ClassMethods)["useRenderers"];
  declare static _renderers: ReadonlySet<string>;
  declare render: (...args: unknown[]) => unknown;

  static {
    include(this, AbstractControllerRendering);
    include(this, Rendering);
    include(this, Renderers);
  }
}

class MetalRenderingJsonController extends MetalRenderingController {
  static Model = class Model {
    toJSON(_options: Record<string, unknown> = {}): unknown {
      return JSON.stringify({ a: "b" });
    }

    toXml(options: Record<string, unknown> = {}): string {
      return toXml({ a: "b" }, options);
    }
  };

  static {
    this.useRenderers("json");
  }

  async one() {
    await this.render({ json: new MetalRenderingJsonController.Model() });
  }

  async two() {
    await this.render({ xml: new MetalRenderingJsonController.Model() });
  }
}

describe("RenderersMetalTest", () => {
  class RenderersMetalTest extends TestCase {
    static {
      this.tests(MetalRenderingJsonController);
    }
  }

  let tc: RenderersMetalTest;
  const assertResponse = (type: number | string): void => tc.assertResponse(type);

  beforeEach(async ({ task }) => {
    tc = new RenderersMetalTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("render json", async () => {
    await tc.get("one");
    assertResponse("success");
    assertEqual(JSON.stringify({ a: "b" }), tc.response.body);
    assertEqual("application/json", tc.response.mediaType);
  });

  it("render xml", async () => {
    await tc.get("two");
    assertResponse("success");
    assertEqual(" ", tc.response.body);
    assertEqual("text/plain", tc.response.mediaType);
  });
});
