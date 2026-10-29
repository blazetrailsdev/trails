import { CurrentAttributes } from "@blazetrails/activesupport";

/** @internal */
export class Current extends CurrentAttributes {
  static {
    this.attribute("urlOptions");
  }
}
