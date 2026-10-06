import { Module } from "@blazetrails/ruby-compat";
import { assertEqual, include } from "@blazetrails/activesupport";
import type { Base as ActionViewBase } from "@blazetrails/actionview";
import { beforeEach, describe, it } from "vitest";
import type { HelpersClass } from "../../../abstract-controller/helpers.js";
import "../../../test-helpers/abstract-unit.js";
import { API } from "../../api.js";
import { Helpers } from "../../metal/helpers.js";
import { TestCase } from "../../test-case.js";

const ApiWithHelper = new Module().include({
  myHelper(): string {
    return "helper";
  },
});

type WithHelpers = typeof API &
  HelpersClass & { helpers(): ActionViewBase & { myHelper(): string } };

class WithHelpersController extends API {
  static {
    include(this, Helpers);
    (this as unknown as WithHelpers).helper(ApiWithHelper);
  }

  async withHelpers() {
    await this.render({
      plain: (this.constructor as unknown as WithHelpers).helpers().myHelper(),
    });
  }
}

class SubclassWithHelpersController extends WithHelpersController {
  override async withHelpers() {
    await this.render({
      plain: (this.constructor as unknown as WithHelpers).helpers().myHelper(),
    });
  }
}

describe("WithHelpersTest", () => {
  class WithHelpersTest extends TestCase {
    static {
      this.tests(WithHelpersController);
    }
  }

  let tc: WithHelpersTest;

  beforeEach(async ({ task }) => {
    tc = new WithHelpersTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("with helpers", async () => {
    await tc.get("with_helpers");

    assertEqual("helper", tc.response.body);
  });
});

describe("SubclassWithHelpersTest", () => {
  void SubclassWithHelpersController;

  class SubclassWithHelpersTest extends TestCase {
    static {
      this.tests(WithHelpersController);
    }
  }

  let tc: SubclassWithHelpersTest;

  beforeEach(async ({ task }) => {
    tc = new SubclassWithHelpersTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("with helpers", async () => {
    await tc.get("with_helpers");

    assertEqual("helper", tc.response.body);
  });
});
