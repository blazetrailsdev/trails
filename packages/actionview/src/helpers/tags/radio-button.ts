import { stringifyKeys } from "@blazetrails/activesupport";
import { include } from "@blazetrails/ruby-compat";

import { Base } from "./base.js";
import { Checkable } from "./checkable.js";

export class RadioButton extends Base {
  declare protected isInputChecked: (options: Record<string, unknown>) => boolean;
  private _tagValue: unknown;

  constructor(
    objectName: unknown,
    methodName: unknown,
    templateObject: unknown,
    tagValue: unknown,
    options: Record<string, unknown>,
  ) {
    super(objectName, methodName, templateObject, options);
    this._tagValue = tagValue;
  }

  override render(): unknown {
    const options = stringifyKeys(this._options);
    options["type"] = "radio";
    options["value"] = this._tagValue;
    if (this.isInputChecked(options)) options["checked"] = "checked";
    this.addDefaultNameAndIdForValue(this._tagValue, options);
    return this.tag("input", options);
  }

  private isChecked(value: unknown): boolean {
    return String(value ?? "") === String(this._tagValue ?? "");
  }
}

include(RadioButton, Checkable);
