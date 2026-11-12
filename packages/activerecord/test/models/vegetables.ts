import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { Company } from "./company.js";
import { Base } from "../../lib/base.js";

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
constSet(TopLevel, "Vegetable", Vegetable);
DescendantsTracker.registerSubclass(Base, Vegetable);

export class Cucumber extends Vegetable {}
constSet(TopLevel, "Cucumber", Cucumber);
DescendantsTracker.registerSubclass(Vegetable, Cucumber);

export class Cabbage extends Vegetable {}
constSet(TopLevel, "Cabbage", Cabbage);
DescendantsTracker.registerSubclass(Vegetable, Cabbage);

export class GreenCabbage extends Cabbage {}
constSet(TopLevel, "GreenCabbage", GreenCabbage);
DescendantsTracker.registerSubclass(Cabbage, GreenCabbage);

export class KingCole extends GreenCabbage {}
constSet(TopLevel, "KingCole", KingCole);
DescendantsTracker.registerSubclass(GreenCabbage, KingCole);

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class RedCabbage extends Cabbage {
  static {
    this.belongsTo("seller", { className: "Company" });
  }
}
constSet(TopLevel, "RedCabbage", RedCabbage);
DescendantsTracker.registerSubclass(Cabbage, RedCabbage);
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
constSet(TopLevel, "YellingVegetable", YellingVegetable);
DescendantsTracker.registerSubclass(Vegetable, YellingVegetable);
