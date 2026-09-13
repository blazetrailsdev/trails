import type { Pirate } from "./pirate.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Matey extends Base {
  declare pirate_id: number;
  declare target_id: number;
  declare weight: number;

  static {
    this.belongsTo("pirate");
    this.belongsTo("target", { className: "Pirate" });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Matey {
  get pirate(): Pirate | null | Promise<Pirate | null>;
  set pirate(value: Pirate | null);
  get target(): Pirate | null | Promise<Pirate | null>;
  set target(value: Pirate | null);
}
