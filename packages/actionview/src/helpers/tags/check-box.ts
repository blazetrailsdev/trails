import { htmlSafe, stringifyKeys, type SafeBuffer } from "@blazetrails/activesupport";
import { hashDelete, include, rbObjRespondTo, slice, toI } from "@blazetrails/ruby-compat";

import { Base } from "./base.js";
import { Checkable } from "./checkable.js";

export class CheckBox extends Base {
  declare protected isInputChecked: (options: Record<string, unknown>) => boolean;
  private _checkedValue: unknown;
  private _uncheckedValue: unknown;

  constructor(
    objectName: unknown,
    methodName: unknown,
    templateObject: unknown,
    checkedValue: unknown,
    uncheckedValue: unknown,
    options: Record<string, unknown>,
  ) {
    super(objectName, methodName, templateObject, options);
    this._checkedValue = checkedValue;
    this._uncheckedValue = uncheckedValue;
  }

  override render(): unknown {
    const options = stringifyKeys(this._options);
    options["type"] = "checkbox";
    options["value"] = this._checkedValue;
    if (this.isInputChecked(options)) options["checked"] = "checked";

    if (options["multiple"] != null && options["multiple"] !== false) {
      this.addDefaultNameAndIdForValue(this._checkedValue, options);
      delete options["multiple"];
    } else {
      this.addDefaultNameAndId(options);
    }

    const includeHidden = hashDelete(options, "includeHidden", () => true);
    const checkbox = this.tag("input", options) as SafeBuffer;

    if (includeHidden != null && includeHidden !== false) {
      const hidden = this.hiddenFieldForCheckbox(options);
      return hidden.plus(checkbox);
    } else {
      return checkbox;
    }
  }

  private isChecked(value: unknown): boolean {
    if (typeof value === "boolean") {
      return value === (this._checkedValue != null && this._checkedValue !== false);
    } else if (value == null) {
      return false;
    } else if (typeof value === "string") {
      return value === this._checkedValue;
    } else if (rbObjRespondTo(value, "includes")) {
      return (value as { includes(v: unknown): boolean }).includes(this._checkedValue);
    } else {
      return toI(value) === toI(this._checkedValue);
    }
  }

  private hiddenFieldForCheckbox(options: Record<string, unknown>): SafeBuffer {
    return this._uncheckedValue != null && this._uncheckedValue !== false
      ? (this.tag(
          "input",
          Object.assign(slice(options, "name", "disabled", "form"), {
            type: "hidden",
            value: this._uncheckedValue,
            autocomplete: "off",
          }),
        ) as SafeBuffer)
      : htmlSafe("");
  }
}

include(CheckBox, Checkable);
