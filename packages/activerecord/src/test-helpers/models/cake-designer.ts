import type { Chef } from "./chef.js";
import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CakeDesigner extends Base {
  static {
    this.hasOne("chef", { as: "employable" });
  }
}
registerModel(CakeDesigner);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CakeDesigner {
  get chef(): Chef | null | Promise<Chef | null>;
  set chef(value: Chef | null);
}
