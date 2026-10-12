import type { Company } from "./company.js";
import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class Vegetable extends Base {
  declare custom_type: string;
  declare name: string;
  declare seller_id: number;

  static {
    this.validates("name", { presence: true });
  }

  static override get inheritanceColumn(): string {
    return "custom_type";
  }
}
registerModel(Vegetable);

export class Cucumber extends Vegetable {}
registerModel(Cucumber);

export class Cabbage extends Vegetable {}
registerModel(Cabbage);

export class GreenCabbage extends Cabbage {}
registerModel(GreenCabbage);

export class KingCole extends GreenCabbage {}
registerModel(KingCole);

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class RedCabbage extends Cabbage {
  static {
    this.belongsTo("seller", { className: "Company" });
  }
}
registerModel(RedCabbage);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface RedCabbage {
  get seller(): Company | null | Promise<Company | null>;
  set seller(value: Company | null);
}

export class YellingVegetable extends Vegetable {
  static {
    this.afterInitialize(function (this: YellingVegetable) {
      this.formatName();
    });
  }

  formatName() {
    const name = this.readAttribute("name") as string | null;
    this.writeAttribute("name", name?.toUpperCase() ?? null);
  }
}
registerModel(YellingVegetable);
