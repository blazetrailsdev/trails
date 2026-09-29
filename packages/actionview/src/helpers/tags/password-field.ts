import { mergeBang } from "@blazetrails/ruby-compat";

import { TextField } from "./text-field.js";

export class PasswordField extends TextField {
  override render(): unknown {
    this._options = mergeBang({ value: null }, this._options);
    return super.render();
  }
}
