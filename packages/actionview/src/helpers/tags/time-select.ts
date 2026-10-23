import { rbModConstSet } from "@blazetrails/ruby-compat";

import { Tags } from "../../namespaces.js";
import { DateSelect } from "./date-select.js";

export class TimeSelect extends DateSelect {}

rbModConstSet(Tags, "TimeSelect", TimeSelect);
