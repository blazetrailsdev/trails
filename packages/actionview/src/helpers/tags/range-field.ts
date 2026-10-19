import { Tags } from "../../namespaces.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { NumberField } from "./number-field.js";

export class RangeField extends NumberField {}

rbModConstSet(Tags, "RangeField", RangeField);
