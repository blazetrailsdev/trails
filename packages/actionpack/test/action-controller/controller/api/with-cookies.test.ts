import { hashAset } from "@blazetrails/ruby-compat";
import { include } from "@blazetrails/activesupport";
import { assertEqual } from "@blazetrails/activesupport/testing/assertions";
import { beforeEach, describe, it } from "vitest";
import "../../../support/abstract-unit.js";
import { API } from "../../../../lib/action-controller/api.js";
import { Cookies } from "../../../../lib/action-controller/metal/cookies.js";
import { TestCase } from "../../../../lib/action-controller/test-case.js";

class WithCookiesController extends API {
  declare cookies: Cookies["cookies"];

  static {
    include(this, Cookies);
  }

  async withCookies() {
    await this.render({ plain: this.cookies().get("foobar") });
  }
}

describe("WithCookiesTest", () => {
  class WithCookiesTest extends TestCase {
    static {
      this.tests(WithCookiesController);
    }
  }

  let tc: WithCookiesTest;

  beforeEach(async ({ task }) => {
    tc = new WithCookiesTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("with cookies", async () => {
    hashAset(tc.request.cookies, "foobar", "bazbang");

    await tc.get("withCookies");

    assertEqual("bazbang", tc.response.body);
  });
});
