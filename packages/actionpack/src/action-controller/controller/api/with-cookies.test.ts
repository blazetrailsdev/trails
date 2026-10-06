import { assertEqual, include } from "@blazetrails/activesupport";
import { beforeEach, describe, it } from "vitest";
import "../../../test-helpers/abstract-unit.js";
import { API } from "../../api.js";
import { Cookies } from "../../metal/cookies.js";
import { TestCase } from "../../test-case.js";

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
    tc.request.cookies["foobar"] = "bazbang";

    await tc.get("with_cookies");

    assertEqual("bazbang", tc.response.body);
  });
});
