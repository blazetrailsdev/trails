import { beforeEach, describe, it } from "vitest";
import { I18n } from "@blazetrails/activesupport";
import { registerConstant } from "@blazetrails/ruby-compat";
import { SharedTestRoutes } from "../../test-helpers/abstract-unit.js";
import { Base } from "../base.js";
import { TestCase } from "../test-case.js";

class ControllerWithBeforeActionAndDefaultUrlOptions extends Base {
  static {
    this.beforeAction((c) => {
      I18n.setLocale(
        (c as ControllerWithBeforeActionAndDefaultUrlOptions).params.get("locale") as string,
      );
    });
    this.afterAction(() => {
      I18n.setLocale("en");
    });
    Object.defineProperty(this.prototype, "defaultUrlOptions", {
      get(): Record<string, unknown> {
        return { locale: "de" };
      },
      configurable: true,
    });
  }

  target() {
    this.render({ plain: "final response" });
  }

  redirect() {
    this.redirectTo({ action: "target" });
  }
}

registerConstant(
  "ControllerWithBeforeActionAndDefaultUrlOptions",
  ControllerWithBeforeActionAndDefaultUrlOptions,
);

describe("ControllerWithBeforeActionAndDefaultUrlOptionsTest", () => {
  class ControllerWithBeforeActionAndDefaultUrlOptionsTest extends TestCase {
    override setup(): void {
      super.setup();
      this.routes = SharedTestRoutes;
    }
  }

  let tc: ControllerWithBeforeActionAndDefaultUrlOptionsTest;

  beforeEach(async ({ task }) => {
    tc = new ControllerWithBeforeActionAndDefaultUrlOptionsTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("should redirect with correct locale :de", async () => {
    await tc.get("redirect", { params: { locale: "de" } });
    tc.assertRedirectedTo(
      "/controller_with_before_action_and_default_url_options/target?locale=de",
    );
  });
});
