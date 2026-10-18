import { rbModConstSet } from "@blazetrails/ruby-compat";

import { Tags } from "../../namespaces.js";
import { DateSelect } from "./date-select.js";

export class DatetimeSelect extends DateSelect {}

rbModConstSet(Tags, "DatetimeSelect", DatetimeSelect);
