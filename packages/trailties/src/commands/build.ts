import type { ThorClass } from "@blazetrails/thor";
import { Base } from "../command/base.js";

/** @noRailsEquivalent PERMANENT */
export class BuildCommand extends Base {
  static {
    const klass = this as unknown as ThorClass;
    klass.desc("build", "Write the autoload manifests to .trails/autoload");
    klass.methodAdded("perform");
  }

  /** @noRailsEquivalent PERMANENT */
  async perform(): Promise<void> {
    const { buildAutoload } = await import("@blazetrails/trails-tsc");
    await buildAutoload();
  }
}
