// vendor/rails/activerecord/test/models/bulb.rb
import { Base } from "../../base.js";

export class Bulb extends Base {
  scopeAfterInitialize: any;
  attributesAfterInitialize: any;
  countAfterCreate: number | undefined;

  static {
    this.defaultScope((q: any) => q.where({ name: "defaulty" }));
    // Rails: counter_cache: { active: false } — object form not yet typed; cast as any
    this.belongsTo("car", { touch: true, counterCache: { active: false } as any });
    this.scope("awesome", (q: any) => q.where({ frickinawesome: true }));

    this.afterInitialize((record: Bulb) => {
      record.scopeAfterInitialize = (record.constructor as typeof Bulb).all();
    });
    this.afterInitialize((record: Bulb) => {
      record.attributesAfterInitialize = { ...(record as any).attributes };
    });
    this.afterCreate(async function (this: Bulb) {
      const carId = this.readAttribute("car_id") as number | null;
      this.countAfterCreate = carId
        ? await Bulb.unscoped(async () => (Bulb as any).where({ car_id: carId }).count())
        : undefined;
    });
  }

  set color(color: string) {
    this.writeAttribute("color", color.toUpperCase() + "!");
  }
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
      throw "abort";
    });
  }
}
