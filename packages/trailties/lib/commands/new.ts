import "../constants.new.generated.js";
import { exit } from "@blazetrails/ruby-compat";
import type { ThorClass } from "@blazetrails/thor";
import { invoke } from "../command.js";
import { Base } from "../command/base.js";

export class NewCommand extends Base {
  static {
    const klass = this as unknown as ThorClass;
    this.bin = "trails";
    klass.noCommands(() => klass.methodAdded("help"));
    klass.methodAdded("perform");
  }

  async help(..._rest: unknown[]): Promise<void> {
    await invoke("application", ["--help"]);
  }

  perform(..._args: unknown[]): void {
    this.say(
      "Can't initialize a new Trails application within the directory of another, please change to a non-Trails directory first.\n",
    );
    this.say("Type 'trails' for help.");
    exit(1);
  }
}
