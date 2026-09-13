import type { Chef } from "./chef.js";
import { Base } from "../../base.js";

export class CakeDesigner extends Base {
  declare chef: Chef | null;

  static {
    this.hasOne("chef", { as: "employable" });
  }
}
