import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class Frog extends Base {
  declare name: string;

  static {
    this.afterSave(async (frog: Frog) => {
      await frog.withLock(async () => {});
    });
  }
}
registerModel(Frog);
