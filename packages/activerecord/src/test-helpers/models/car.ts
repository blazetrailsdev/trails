// vendor/rails/activerecord/test/models/car.rb
import { Base } from "../../base.js";
import { Temporal } from "@blazetrails/activesupport/temporal";

export class Car extends Base {
  static {
    this.belongsTo("person", { counterCache: true });
    this.hasMany("bulbs");
    this.hasMany("allBulbs", {
      scope: (q: any) => q.unscope({ where: "name" }),
      className: "Bulb",
    });
    this.hasMany("allBulbs2", {
      scope: (q: any) => q.unscope("where"),
      className: "Bulb",
    });
    this.hasMany("otherBulbs", {
      scope: (q: any) => q.unscope({ where: "name" }).where({ name: "other" }),
      className: "Bulb",
    });
    this.hasMany("oldBulbs", {
      scope: (q: any) => q.rewhere({ name: "old" }),
      className: "Bulb",
    });
    this.hasMany("funkyBulbs", { className: "FunkyBulb", dependent: "destroy" });
    this.hasMany("failedBulbs", { className: "FailedBulb", dependent: "destroy" });
    this.hasMany("fooBulbs", {
      scope: (q: any) => q.where({ name: "foo" }),
      className: "Bulb",
    });
    this.hasMany("awesomeBulbs", {
      scope: (q: any) => q.awesome(),
      className: "Bulb",
    });

    this.hasOne("bulb");

    this.hasMany("tyres", { counterCache: "custom_tyres_count" });
    this.hasMany("engines", { dependent: "destroy", inverseOf: "myCar" });
    this.hasMany("wheels", { as: "wheelable", dependent: "destroy" });

    this.hasMany("priceEstimates", { as: "estimateOf" });

    this.scope("inclTyres", (q: any) => q.includes("tyres"));
    this.scope("inclEngines", (q: any) => q.includes("engines"));
    this.scope("orderUsingNewStyle", (q: any) => q.order("name asc"));

    this.attribute("wheels_owned_at", "datetime", { default: () => Temporal.Now.instant() });
  }
}

export class CoolCar extends Car {
  static {
    this.defaultScope((q: any) => q.order("name desc"));
  }
}

export class FastCar extends Car {
  static {
    this.defaultScope((q: any) => q.order("name desc"));
  }
}
