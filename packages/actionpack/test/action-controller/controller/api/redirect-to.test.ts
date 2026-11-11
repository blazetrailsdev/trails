import { assertEqual } from "@blazetrails/activesupport/testing/assertions";
import { beforeEach, describe, it } from "vitest";
import { SharedTestRoutes } from "../../../support/abstract-unit.js";
import { API } from "../../../../lib/action-controller/api.js";
import { TestCase } from "../../../../lib/action-controller/test-case.js";

class RedirectToApiController extends API {
  one() {
    this.redirectTo({ action: "two" });
  }

  two() {}
}

describe("RedirectToApiTest", () => {
  class RedirectToApiTest extends TestCase {
    static {
      this.tests(RedirectToApiController);
    }

    override setup(): void {
      super.setup();
      this.routes = SharedTestRoutes;
    }
  }

  let tc: RedirectToApiTest;

  beforeEach(async ({ task }) => {
    tc = new RedirectToApiTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("redirect to", async () => {
    await tc.get("one");
    tc.assertResponse(":redirect");
    assertEqual("http://test.host/redirect_to_api/two", tc.redirectToUrl());
  });
});
