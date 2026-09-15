import { kernelThrow } from "@blazetrails/ruby-compat";
import type { Relation } from "../../relation.js";
import type { Car } from "./car.js";
import { Base } from "../../base.js";
import {
  association as associationInstance,
  collectionProxyFor as association,
} from "../../associations.js";

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
    this.defaultScope((q: any) => q.where({ name: "defaulty" }));
    this.belongsTo("car", { touch: true, counterCache: { active: false } as any });
    this.scope("awesome", function (this: any) {
      return this.where({ frickinawesome: true });
    });

    this.afterInitialize((record: Bulb) => {
      record.scopeAfterInitialize = (record.constructor as typeof Bulb).all();
    });
    this.afterInitialize((record: Bulb) => {
      record.attributesAfterInitialize = { ...(record as any).attributes };
    });
    this.afterCreate(async (record: Bulb) => {
      record.countAfterCreate = await Bulb.unscoped(async () => {
        const car = (await associationInstance.call(record, "car").loadTarget()) as Car | null;
        return car ? ((await association(car, "bulbs").count()) as number) : undefined;
      });
    });
  }

  set color(color: string) {
    this.writeAttribute("color", color.toUpperCase() + "!");
  }
}
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
    if ((this as any).name === "Dude") {
      this.writeAttribute("frickinawesome", true);
    }
  }
}

export class FunkyBulb extends Bulb {
  static {
    this.beforeDestroy(async function () {
      throw new Error("before_destroy was called");
    });
  }
}

export class FailedBulb extends Bulb {
  static {
    this.beforeDestroy(async function () {
      kernelThrow(":abort");
    });
  }
}
