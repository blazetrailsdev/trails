import { DSL } from "./dsl-definition.js";
import { Task } from "./task.js";

DSL.task("phony");

const task = await Task.get("phony");
task.timestamp = async () => new Date(0);
