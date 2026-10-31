import { File } from "@blazetrails/ruby-compat";
import { NamedBase } from "../../named-base.js";

const __dir__ = File.dirname(decodeURIComponent(new URL(import.meta.url).pathname));

export class ScriptGenerator extends NamedBase {
  static {
    void this.sourceRoot(File.expandPath("templates", __dir__));
    this.methodAdded("generateScript");
  }

  async generateScript(): Promise<void> {
    await this.template("script.ts", `script/${this.filePath()}${this.ext()}`);
  }

  private depth(): number {
    return this.classPathParts.length + 1;
  }
}
