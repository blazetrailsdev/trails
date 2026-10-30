import { CurrentAttributes } from "@blazetrails/activesupport";

/** @internal */
export class Current extends CurrentAttributes {
  declare static urlOptions: Record<string, unknown> | null;

  static {
    this.attribute("urlOptions");
  }
}
