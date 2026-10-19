import { Tags } from "../../namespaces.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { TextField } from "./text-field.js";

export class EmailField extends TextField {}

rbModConstSet(Tags, "EmailField", EmailField);
