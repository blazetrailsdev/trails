import { isModuleIncluded } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";

import { FooHelper } from "../../test-helpers/fixtures/alternate-helpers/foo-helper.js";
import { Base } from "../base.js";

describe("AbstractController::Helpers inherited", () => {
  it("includes the default helper module beneath a helper the class body declares", () => {
    class FooController extends Base {
      static {
        this.helper({
          baz(): string {
            return "class body";
          },
        });
      }
    }

    expect(isModuleIncluded(FooController._helpers, FooHelper)).toBe(true);
    expect((FooController.helpers() as unknown as { baz(): string }).baz()).toBe("class body");
  });
});
