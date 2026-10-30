import { include } from "@blazetrails/ruby-compat";
import { DSL } from "./dsl-definition.js";

export class TaskLib {}
include(TaskLib, DSL);
