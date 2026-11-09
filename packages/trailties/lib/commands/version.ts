import "../constants.version.generated.js";
import type { ThorClass } from "@blazetrails/thor";
import { Base } from "../command/base.js";
import { invoke } from "../command.js";

export class VersionCommand extends Base {
  static {
    const klass = this as unknown as ThorClass;

    this.desc("version", "Show the Trails version");
    klass.methodAdded("perform");
  }

  async perform(): Promise<void> {
    await invoke("application", ["--version"]);
  }
}
