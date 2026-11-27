import "../constants.middleware.generated.js";
import type { MiddlewareStack } from "@blazetrails/actionpack";
import { rbModName } from "@blazetrails/ruby-compat/object";
import type { ThorClass } from "@blazetrails/thor";
import { Base } from "../command/base.js";
import { Trails } from "../trails.js";

export class MiddlewareCommand extends Base {
  static {
    const klass = this as unknown as ThorClass;
    klass.desc("middleware", "Print out your Rack middleware stack");
    klass.methodAdded("perform");
  }

  async perform(): Promise<void> {
    await this.bootApplicationBang();

    (Trails.configuration!.middleware as MiddlewareStack).each((middleware) => {
      this.say(`use ${middleware.inspect()}`);
    });
    this.say(`run ${rbModName(Trails.application!.constructor)}.routes`);
  }
}
