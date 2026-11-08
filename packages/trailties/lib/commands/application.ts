import "../constants.application.generated.js";
import type { ThorClass } from "@blazetrails/thor";
import { Base } from "../command/base.js";
import { AppGenerator, ARGVScrubber } from "../generators/trails/app/app-generator.js";

AppGenerator.isExitOnFailure = () => true;

export class ApplicationCommand extends Base {
  static {
    const klass = this as unknown as ThorClass;
    this.hideCommandBang();

    this.bin = "trails";
    klass.methodAdded("help");
    klass.methodAdded("perform");
  }

  async help(): Promise<void> {
    await this.perform();
  }

  async perform(...args: string[]): Promise<void> {
    await (AppGenerator as unknown as ThorClass).start(await new ARGVScrubber(args).prepareBang());
  }
}
