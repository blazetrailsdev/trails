import "../constants.restart.generated.js";
import { FileUtils } from "@blazetrails/ruby-compat";
import type { ThorClass } from "@blazetrails/thor";
import { applicationRoot } from "../command.js";
import { Base } from "../command/base.js";

export class RestartCommand extends Base {
  static {
    const klass = this as unknown as ThorClass;
    klass.desc("restart", "Restart app by touching tmp/restart.txt");
    klass.methodAdded("perform");
  }

  perform(): void {
    FileUtils.mkdirP(applicationRoot()!.join("tmp").toString());
    FileUtils.touch(applicationRoot()!.join("tmp/restart.txt").toString());
  }
}
