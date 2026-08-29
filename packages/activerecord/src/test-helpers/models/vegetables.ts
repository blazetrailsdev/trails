import type { Company } from "./company.js";
import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";
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

export class Cucumber extends Vegetable {}

export class Cabbage extends Vegetable {}

export class GreenCabbage extends Cabbage {}

export class KingCole extends GreenCabbage {}

export class RedCabbage extends Cabbage {
  declare seller: Company | null;
  declare loadBelongsTo: (name: "seller") => Promise<Company | null>;

  static {
    this.belongsTo("seller", { className: "Company" });
  }
}

registerModel([Vegetable, Cucumber, Cabbage, GreenCabbage, KingCole, RedCabbage]);
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
