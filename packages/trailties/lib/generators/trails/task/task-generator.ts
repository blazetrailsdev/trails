import "../../../constants.trails-task-task-generator.generated.js";
import { File } from "@blazetrails/ruby-compat";
import { NamedBase } from "../../named-base.js";

export class TaskGenerator extends NamedBase {
  static {
    this.argument("actions", { type: "array", default: [], banner: "action action" });
    this.methodAdded("createTaskFiles");
  }

  declare actions: string[];

  async createTaskFiles(): Promise<void> {
    await this.template("task.ts", File.join("lib/tasks", `${this.fileName}${this.ext()}`));
  }
}
