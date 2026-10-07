import { beforeEach, describe, it, vi } from "vitest";
import { SharedTestRoutes } from "../../../test-helpers/abstract-unit.js";
import { API } from "../../api.js";
import { TestCase } from "../../test-case.js";

class ImplicitRenderAPITestController extends API {
  emptyAction() {}

  returningMock() {
    return vi.fn();
  }
}

describe("ImplicitRenderAPITest", () => {
  class ImplicitRenderAPITest extends TestCase {
    static {
      this.tests(ImplicitRenderAPITestController);
    }

    override setup(): void {
      super.setup();
      this.routes = SharedTestRoutes;
    }
  }

  let tc: ImplicitRenderAPITest;

  beforeEach(async ({ task }) => {
    tc = new ImplicitRenderAPITest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("implicit no content response", async () => {
    await tc.get("emptyAction");
    tc.assertResponse("no_content");
  });

  it("result independence", async () => {
    await tc.get("returningMock");
    tc.assertResponse("no_content");
  });
});
