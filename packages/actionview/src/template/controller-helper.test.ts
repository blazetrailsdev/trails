import { describe, expect, it } from "vitest";

import { Base } from "../base.js";
import { FormBuilder } from "../helpers/form-helper.js";
import { LookupContext } from "../lookup-context.js";
import { assertNil } from "@blazetrails/activesupport";

describe("ControllerHelperTest", () => {
  class SpecializedFormBuilder extends FormBuilder {}

  it("assign controller sets default form builder", () => {
    const view = new (Base.withEmptyTemplateCache())(new LookupContext(null, {}, []), {}, null);
    const controller = { defaultFormBuilder: () => SpecializedFormBuilder };
    view.assignController(controller);

    expect(view.defaultFormBuilder).toBe(SpecializedFormBuilder);
  });

  it("assign controller skips default form builder", () => {
    const view = new (Base.withEmptyTemplateCache())(new LookupContext(null, {}, []), {}, null);
    const controller = {};
    view.assignController(controller);

    assertNil(view.defaultFormBuilder);
  });
});
