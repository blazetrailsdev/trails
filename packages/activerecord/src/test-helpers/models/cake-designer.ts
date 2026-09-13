import type { Chef } from "./chef.js";
import { Base } from "../../base.js";

export class CakeDesigner extends Base {
  static {
    this.hasOne("chef", { as: "employable" });
  }
}
export interface CakeDesigner {
  get chef(): Chef | null | Promise<Chef | null>;
  set chef(value: Chef | null);
}
