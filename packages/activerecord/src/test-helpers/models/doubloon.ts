import type { Pirate } from "./pirate.js";
import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AbstractDoubloon extends Base {
  static {
    this.abstractClass = true;
    this.belongsTo("pirate");
  }
}
registerModel(AbstractDoubloon);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface AbstractDoubloon {
  get pirate(): Pirate | null | Promise<Pirate | null>;
  set pirate(value: Pirate | null);
}

export class Doubloon extends AbstractDoubloon {
  declare pirate_id: number;
  declare weight: number;

  static _tableName = "doubloons";
}
registerModel(Doubloon);
