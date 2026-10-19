import { Tags } from "../../namespaces.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { TextField } from "./text-field.js";

export class HiddenField extends TextField {
  override render(): unknown {
    this._options["autocomplete"] = "off";
    return super.render();
  }
}

rbModConstSet(Tags, "HiddenField", HiddenField);
