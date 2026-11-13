import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { Pirate } from "./pirate.js";
import { Base } from "../../lib/base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AbstractDoubloon extends Base {
  static {
    this.abstractClass = true;
    this.belongsTo("pirate");
  }
}
constSet(TopLevel, "AbstractDoubloon", AbstractDoubloon);
DescendantsTracker.registerSubclass(Base, AbstractDoubloon);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface AbstractDoubloon {
  get pirate(): Pirate | null | Promise<Pirate | null>;
  set pirate(value: Pirate | null);
}

export class Doubloon extends AbstractDoubloon {
  declare pirate_id: number;
  declare weight: number;

  static tableName = "doubloons";
}
constSet(TopLevel, "Doubloon", Doubloon);
DescendantsTracker.registerSubclass(AbstractDoubloon, Doubloon);
