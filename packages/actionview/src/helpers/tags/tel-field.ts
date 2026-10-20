import { Tags } from "../../namespaces.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { TextField } from "./text-field.js";

export class TelField extends TextField {}

rbModConstSet(Tags, "TelField", TelField);
