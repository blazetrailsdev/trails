import { include } from "@blazetrails/ruby-compat";
import { Cloneable } from "./cloneable.js";
import { DSL } from "./dsl-definition.js";

export class TaskLib {}
include(TaskLib, Cloneable);
include(TaskLib, DSL);
