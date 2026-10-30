import { DSL } from "./dsl-definition.js";
import { Rake } from "./rake-module.js";

DSL.task("phony");

const task = await Rake.application!.get("phony");
task.timestamp = async () => new Date(0);
