import { beforeEach, describe, it } from "vitest";
import { assertEqual, toXml } from "@blazetrails/activesupport";
import { include } from "@blazetrails/ruby-compat/include";
import "../../../test-helpers/abstract-unit.js";
import { Rendering as AbstractControllerRendering } from "../../../abstract-controller/rendering.js";
import { Metal } from "../../metal.js";
import { Renderers } from "../../metal/renderers.js";
import { Rendering } from "../../metal/rendering.js";
import { TestCase } from "../../test-case.js";

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

  beforeEach(async ({ task }) => {
    tc = new RenderersMetalTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("render json", async () => {
    await tc.get("one");
    tc.assertResponse("success");
    assertEqual(JSON.stringify({ a: "b" }), tc.response.body);
    assertEqual("application/json", tc.response.mediaType);
  });

  it("render xml", async () => {
    await tc.get("two");
    tc.assertResponse("success");
    assertEqual(" ", tc.response.body);
    assertEqual("text/plain", tc.response.mediaType);
  });
});
