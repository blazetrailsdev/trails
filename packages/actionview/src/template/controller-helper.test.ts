import { describe, expect, it } from "vitest";

import { Base } from "../base.js";
import { FormBuilder } from "../helpers/form-helper.js";
import { LookupContext } from "../lookup-context.js";
import { assert, assertNil, assertNot } from "@blazetrails/activesupport";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";

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

  it("respond to", () => {
    const view = new (Base.withEmptyTemplateCache())(new LookupContext(null, {}, []), {}, null);
    const controller: Record<string, unknown> = {};
    view.assignController(controller);
    assertNot(rbObjRespondTo(view, "params"));
    assert(rbObjRespondTo(view, "assignController"));

    controller.params = () => ({});
    assert(rbObjRespondTo(view, "params"));
    assert(rbObjRespondTo(view, "assignController"));
  });
});
