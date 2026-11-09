import "../../../constants.trails-script-script-generator.generated.js";
import { NamedBase } from "../../named-base.js";

export class ScriptGenerator extends NamedBase {
  static {
    this.methodAdded("generateScript");
  }

  async generateScript(): Promise<void> {
    await this.template("script.ts", `script/${this.filePath()}${this.ext()}`);
  }

  private depth(): number {
    return this.classPathParts.length + 1;
  }
}
