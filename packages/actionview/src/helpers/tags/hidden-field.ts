import { TextField } from "./text-field.js";

export class HiddenField extends TextField {
  override render(): unknown {
    this._options["autocomplete"] = "off";
    return super.render();
  }
}
