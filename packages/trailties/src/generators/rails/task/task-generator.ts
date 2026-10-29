import { File } from "@blazetrails/ruby-compat";
import { NamedBase } from "../../named-base.js";

export class TaskGenerator extends NamedBase {
  static {
    void this.sourceRoot(
      File.expandPath(
        "templates",
        File.dirname(decodeURIComponent(new URL(import.meta.url).pathname)),
      ),
    );
    this.argument("actions", { type: "array", default: [], banner: "action action" });
    this.methodAdded("createTaskFiles");
  }

  declare actions: string[];

  /** @missingRailsArgs template — PERMANENT */
  async createTaskFiles(): Promise<void> {
    await this.template("task.ts", File.join("lib/tasks", `${this.fileName}${this.ext()}`));
  }
}
