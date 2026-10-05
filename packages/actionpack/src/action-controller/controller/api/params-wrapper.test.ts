import { assertEqual } from "@blazetrails/activesupport";
import { registerConstant } from "@blazetrails/ruby-compat";
import { beforeEach, describe, it } from "vitest";
import { API } from "../../api.js";
import { TestCase } from "../../test-case.js";
import { SharedTestRoutes } from "../../../test-helpers/abstract-unit.js";

describe("ParamsWrapperForApiTest", () => {
  class UsersController extends API {
    lastParameters: Record<string, unknown> | undefined;

    static {
      this.wrapParameters("person", { format: [":json"] });
    }

    test() {
      this.lastParameters = this.params.except("controller", "action").toUnsafeH();
      this.head("ok");
    }
  }
  Object.defineProperty(UsersController, "name", {
    value: "ParamsWrapperForApiTest::UsersController",
  });

  registerConstant("ParamsWrapperForApiTest::Person", class Person {});

  class ParamsWrapperForApiTest extends TestCase {
    static {
      this.tests(UsersController);
    }

    override setup(): void {
      super.setup();
      this.routes = SharedTestRoutes;
    }
  }

  let tc: ParamsWrapperForApiTest;

  beforeEach(async ({ task }) => {
    tc = new ParamsWrapperForApiTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("specify wrapper name", async () => {
    tc.request.env["CONTENT_TYPE"] = "application/json";
    await tc.post("test", { params: { username: "sikachu" } });

    const expected = { username: "sikachu", person: { username: "sikachu" } };
    assertEqual(expected, (tc.controller as UsersController).lastParameters);
  });
});
