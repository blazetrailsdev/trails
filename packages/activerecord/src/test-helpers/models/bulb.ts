// vendor/rails/activerecord/test/models/bulb.rb
import { Base } from "../../base.js";
import { association, loadBelongsTo } from "../../associations.js";

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
    this.afterCreate(async (record: Bulb) => {
      record.countAfterCreate = await Bulb.unscoped(async () => {
        const car = await loadBelongsTo(record, "car", {});
        return car ? await association(car, "bulbs").count() : undefined;
      });
    });
  }

  // Rails overrides only `color=` and keeps the generated attribute reader
  // (bulb.rb:27-29). Defining a TS setter on the prototype suppresses our
  // generated `color` getter, so mirror the reader explicitly.
  get color(): unknown {
    return this.readAttribute("color");
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
      return false;
    });
  }
}
