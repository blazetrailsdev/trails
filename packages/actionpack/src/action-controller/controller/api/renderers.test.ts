import { beforeEach, describe, it } from "vitest";
import { assertEqual, toXml } from "@blazetrails/activesupport";
import "../../../test-helpers/abstract-unit.js";
import { API } from "../../api.js";
import { TestCase } from "../../test-case.js";

class RenderersApiController extends API {
  static Model = class Model {
    toJSON(_options: Record<string, unknown> = {}): unknown {
      return JSON.stringify({ a: "b" });
    }

    toXml(options: Record<string, unknown> = {}): string {
      return toXml({ a: "b" }, options);
    }
  };

  async one() {
    await this.render({ json: new RenderersApiController.Model() });
  }

  async two() {
    await this.render({ xml: new RenderersApiController.Model() });
  }

  async plain() {
    await this.render({ plain: "Hi from plain", status: 500 });
  }
}

describe("RenderersApiTest", () => {
  class RenderersApiTest extends TestCase {
    static {
      this.tests(RenderersApiController);
    }
  }

  let tc: RenderersApiTest;

  beforeEach(async ({ task }) => {
    tc = new RenderersApiTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("render json", async () => {
    await tc.get("one");
    tc.assertResponse("success");
    assertEqual(JSON.stringify({ a: "b" }), tc.response.body);
  });

  it("render xml", async () => {
    await tc.get("two");
    tc.assertResponse("success");
    assertEqual(toXml({ a: "b" }), tc.response.body);
  });

  it("render plain", async () => {
    await tc.get("plain");
    tc.assertResponse("internal_server_error");
    assertEqual("Hi from plain", tc.response.body);
  });
});
