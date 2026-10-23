import { assertEqual } from "@blazetrails/activesupport";
import { beforeEach, describe, it } from "vitest";
import { SharedTestRoutes } from "../../../test-helpers/abstract-unit.js";
import { API } from "../../api.js";
import { TestCase } from "../../test-case.js";

class UrlForApiController extends API {
  declare urlFor: (options?: unknown) => string;

  one() {}
  two() {}
}

describe("UrlForApiTest", () => {
  class UrlForApiTest extends TestCase {
    declare controller: UrlForApiController;

    static {
      this.tests(UrlForApiController);
    }

    override setup(): void {
      super.setup();
      this.routes = SharedTestRoutes;
      this.request.host = "www.example.com";
    }
  }

  let tc: UrlForApiTest;

  beforeEach(async ({ task }) => {
    tc = new UrlForApiTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("url for", async () => {
    await tc.get("one");
    assertEqual("http://www.example.com/url_for_api/one", tc.controller.urlFor());
  });
});
