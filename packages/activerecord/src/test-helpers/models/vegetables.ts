import { registerConstant } from "@blazetrails/ruby-compat";
import type { Company } from "./company.js";
import { Base } from "../../base.js";
import { registerSubclass } from "../../inheritance.js";

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
registerConstant("Vegetable", Vegetable);

export class Cucumber extends Vegetable {}
registerConstant("Cucumber", Cucumber);

export class Cabbage extends Vegetable {}
registerConstant("Cabbage", Cabbage);

export class GreenCabbage extends Cabbage {}
registerConstant("GreenCabbage", GreenCabbage);

export class KingCole extends GreenCabbage {}
registerConstant("KingCole", KingCole);

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class RedCabbage extends Cabbage {
  static {
    this.belongsTo("seller", { className: "Company" });
  }
}
registerConstant("RedCabbage", RedCabbage);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface RedCabbage {
  get seller(): Company | null | Promise<Company | null>;
  set seller(value: Company | null);
}

for (const klass of [Cucumber, Cabbage, GreenCabbage, KingCole, RedCabbage]) {
  registerSubclass(klass);
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
registerConstant("YellingVegetable", YellingVegetable);
