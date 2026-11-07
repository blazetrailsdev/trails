import { beforeEach, describe, it } from "vitest";
import { assertEqual } from "@blazetrails/activesupport";
import { FormBuilder } from "@blazetrails/actionview";
import "../../test-helpers/abstract-unit.js";
import { Base } from "../base.js";

class FormBuilderController extends Base {
  static SpecializedFormBuilder = class SpecializedFormBuilder extends FormBuilder {};

  static {
    this.defaultFormBuilder(this.SpecializedFormBuilder);
  }
}

describe("ControllerFormBuilderTest", () => {
  let controller: FormBuilderController;

  beforeEach(() => {
    controller = new FormBuilderController();
  });

  it("default form builder assigned", () => {
    assertEqual(FormBuilderController.SpecializedFormBuilder, controller.defaultFormBuilder());
  });
});
