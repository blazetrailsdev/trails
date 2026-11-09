import { File, include } from "@blazetrails/ruby-compat";
import { DSL } from "../dsl-definition.js";
import { Rake } from "../rake-module.js";

export class MakefileLoader {
  static SPACE_MARK = "\0";

  async load(fn: string): Promise<void> {
    let lines = await File.readAsync(fn);
    lines = lines.replace(/\\ /g, MakefileLoader.SPACE_MARK);
    lines = lines.replace(/#[^\n]*\n/g, "");
    lines = lines.replace(/\\\n/g, " ");
    for (const line of lines.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
      this.processLine(line);
    }
  }

  /** @internal */
  private processLine(line: string): void {
    const colon = line.indexOf(":");
    if (colon === -1) return;
    const fileTasks = line.slice(0, colon);
    const args = line.slice(colon + 1);
    const dependents = (args.match(/\S+/g) ?? []).map((d) => this.respace(d));
    for (let fileTask of fileTasks.match(/\S+/g) ?? []) {
      fileTask = this.respace(fileTask);
      (this as unknown as typeof DSL).file({ [fileTask]: dependents });
    }
  }

  /** @internal */
  private respace(str: string): string {
    return str.replaceAll(MakefileLoader.SPACE_MARK, " ");
  }
}
include(MakefileLoader, DSL);

Rake.application!.addLoader("mf", new MakefileLoader());
