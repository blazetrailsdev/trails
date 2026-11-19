import "../constants.about.generated.js";
import type { ThorClass } from "@blazetrails/thor";
import { Base } from "../command/base.js";
import { Info } from "../info.js";

export class AboutCommand extends Base {
  static {
    const klass = this as unknown as ThorClass;
    klass.desc("about", "List versions of all Trails frameworks and the environment");
    klass.methodAdded("perform");
  }

  async perform(): Promise<void> {
    await this.bootApplicationBang();

    this.say(Info);
  }
}
