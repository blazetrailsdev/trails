import { rbSetClassPathString } from "@blazetrails/ruby-compat";
import type { ThorClass } from "@blazetrails/thor";
import { Base } from "../command/base.js";
import { DevCaching } from "../dev-caching.js";

export class DevCommand extends Base {
  static {
    const klass = this as unknown as ThorClass;
    klass.desc("cache", "Toggle Action Controller development mode caching on/off");
    klass.methodAdded("cache");
  }

  cache(): void {
    DevCaching.enableByFile();
  }
}

rbSetClassPathString(DevCommand, { name: "Rails::Command" }, "DevCommand");
