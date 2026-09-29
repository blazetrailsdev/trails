import { stringifyKeys } from "@blazetrails/activesupport";

import { TextField } from "./text-field.js";

export class ColorField extends TextField {
  override render(): unknown {
    const options = stringifyKeys(this._options);
    if (options["value"] == null || options["value"] === false) {
      options["value"] = this.validateColorString(this.value());
    }
    this._options = options;
    return super.render();
  }

  private validateColorString(string: unknown): string {
    const regex = /#[0-9a-fA-F]{6}/;
    if (typeof string === "string" && regex.test(string)) {
      return string.toLowerCase();
    } else {
      return "#000000";
    }
  }
}
