import { Tags } from "../../namespaces.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { TextField } from "./text-field.js";

export class UrlField extends TextField {}

rbModConstSet(Tags, "UrlField", UrlField);
