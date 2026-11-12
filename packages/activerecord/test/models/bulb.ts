import { DescendantsTracker } from "@blazetrails/activesupport";
import { RuntimeError, kernelThrow, constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { Relation } from "../../lib/relation.js";
import type { ScopeOn } from "../../lib/scoping/named.js";
import type { Car } from "./car.js";
import { Base } from "../../lib/base.js";
import { association as associationInstance } from "../../lib/associations.js";

declare module "../../lib/relation.js" {
  interface RelationScopes<T extends Base> {
    awesome: ScopeOn<T, Bulb>;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Bulb extends Base {
  declare static awesome: () => Relation<Bulb>;
  declare car_id: number;
  declare frickinawesome: boolean | null;
  declare ID: number;
  declare name: string;

  declare scopeAfterInitialize: any;
  declare attributesAfterInitialize: any;
  declare countAfterCreate: number | undefined;

  static {
    this.defaultScope(function () {
      return this.where({ name: "defaulty" });
    });
    this.belongsTo("car", { touch: true, counterCache: { active: false } as any });
    this.scope("awesome", function () {
      return this.where({ frickinawesome: true });
    });

    this.afterInitialize((record: Bulb) => {
      record.scopeAfterInitialize = (record.constructor as typeof Bulb).all();
    });
    this.afterInitialize((record: Bulb) => {
      record.attributesAfterInitialize = { ...record.attributes };
    });
    this.afterCreate(async (record: Bulb) => {
      record.countAfterCreate = await Bulb.unscoped(async () => {
        const car = (await associationInstance.call(record, "car").loadTarget()) as Car | null;
        return car ? ((await car.bulbs.count()) as number) : undefined;
      });
    });
  }

  set color(color: string) {
    this.writeAttribute("color", color.toUpperCase() + "!");
  }
}
constSet(TopLevel, "Bulb", Bulb);
DescendantsTracker.registerSubclass(Base, Bulb);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Bulb {
  get car(): Car | null | Promise<Car | null>;
  set car(value: Car | null);
}

export class CustomBulb extends Bulb {
  static {
    this.afterInitialize((record: CustomBulb) => {
      record.setAwesomeness();
    });
  }

  /** @internal */
  private setAwesomeness() {
    if (this.name === "Dude") {
      this.writeAttribute("frickinawesome", true);
    }
  }
}
constSet(TopLevel, "CustomBulb", CustomBulb);
DescendantsTracker.registerSubclass(Bulb, CustomBulb);

export class FunkyBulb extends Bulb {
  static {
    this.beforeDestroy(async function () {
      throw new RuntimeError("before_destroy was called");
    });
  }
}
constSet(TopLevel, "FunkyBulb", FunkyBulb);
DescendantsTracker.registerSubclass(Bulb, FunkyBulb);

export class FailedBulb extends Bulb {
  static {
    this.beforeDestroy(async function () {
      kernelThrow(":abort");
    });
  }
}
constSet(TopLevel, "FailedBulb", FailedBulb);
DescendantsTracker.registerSubclass(Bulb, FailedBulb);
