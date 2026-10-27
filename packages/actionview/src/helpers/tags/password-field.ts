import { TextField } from "./text-field.js";

export class PasswordField extends TextField {
  override render(): unknown {
    this._options = Object.assign({ value: null }, this._options);
    return super.render();
  }
}
