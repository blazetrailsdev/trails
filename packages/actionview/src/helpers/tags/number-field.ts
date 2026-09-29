import { stringifyKeys } from "@blazetrails/activesupport";
import { hashDelete, type Range } from "@blazetrails/ruby-compat";

import { TextField } from "./text-field.js";

export class NumberField extends TextField {
  override render(): unknown {
    const options = stringifyKeys(this._options);

    let range = hashDelete(options, "in");
    if (range == null || range === false) range = hashDelete(options, "within");
    if (range != null && range !== false) {
      Object.assign(options, { min: (range as Range).min(), max: (range as Range).max() });
    }

    this._options = options;
    return super.render();
  }
}
