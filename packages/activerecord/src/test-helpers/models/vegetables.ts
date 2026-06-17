import type { Company } from "./company.js";
// vendor/rails/activerecord/test/models/vegetables.rb
import { Base } from "../../base.js";

export class Vegetable extends Base {
  declare custom_type: string;
  declare name: string;
  declare seller_id: number;

  static {
    this.inheritanceColumn = "custom_type";
    this.validates("name", { presence: true });
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
