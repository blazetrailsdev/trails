import { NamedBase } from "../../named-base.js";

export class TaskGenerator extends NamedBase {
  static {
    this.argument("actions", { type: "array", default: [], banner: "action action" });
    this.methodAdded("createTaskFiles");
  }

  declare actions: string[];

  /** @missingRailsCall template — CONVERGEABLE converge-generators-onto-thor-template */
  async createTaskFiles(): Promise<void> {
    const actions = this.actions;
    const ext = this.ext();
    const filename = `lib/tasks/${this.fileName}${ext}`;
    const actionLines = actions
      .map((a) => `// TODO\nexport async function ${a}(): Promise<void> {}\n`)
      .join("\n");

    await this.createFile(filename, `// namespace: ${this.fileName}\n\n${actionLines}`);
  }
}
