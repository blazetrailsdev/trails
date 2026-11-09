import "../constants.gem-help.generated.js";
import type { ThorClass } from "@blazetrails/thor";
import { Base } from "../command/base.js";

export class GemHelpCommand extends Base {
  static {
    const klass = this as unknown as ThorClass;
    this.hideCommandBang();

    klass.methodAdded("perform");
  }

  async perform(): Promise<void> {
    this.say(await (this.constructor as typeof GemHelpCommand).classUsage());
  }
}
