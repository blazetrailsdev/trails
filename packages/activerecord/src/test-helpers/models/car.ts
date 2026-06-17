import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Relation } from "../../relation.js";
import type { Bulb } from "./bulb.js";
import type { Engine } from "./engine.js";
import type { FailedBulb } from "./bulb.js";
import type { FunkyBulb } from "./bulb.js";
import type { Person } from "./person.js";
import type { PriceEstimate } from "./price-estimate.js";
import type { Tyre } from "./tyre.js";
import type { Wheel } from "./wheel.js";
// vendor/rails/activerecord/test/models/car.rb
import { Base } from "../../base.js";
import { Temporal } from "@blazetrails/activesupport/temporal";

export class Car extends Base {
  declare person: Person | null;
  declare bulbs: AssociationProxy<Bulb>;
  declare allBulbs: AssociationProxy<Bulb>;
  declare allBulbs2: AssociationProxy<Bulb>;
  declare otherBulbs: AssociationProxy<Bulb>;
  declare oldBulbs: AssociationProxy<Bulb>;
  declare funkyBulbs: AssociationProxy<FunkyBulb>;
  declare failedBulbs: AssociationProxy<FailedBulb>;
  declare fooBulbs: AssociationProxy<Bulb>;
  declare awesomeBulbs: AssociationProxy<Bulb>;
  declare bulb: Bulb | null;
  declare tyres: AssociationProxy<Tyre>;
  declare engines: AssociationProxy<Engine>;
  declare wheels: AssociationProxy<Wheel>;
  declare priceEstimates: AssociationProxy<PriceEstimate>;
  declare static inclTyres: () => Relation<Car>;
  declare static inclEngines: () => Relation<Car>;
  declare static orderUsingNewStyle: () => Relation<Car>;
  declare wheels_owned_at: Temporal.Instant | Temporal.PlainDateTime;
  declare loadBelongsTo: (name: "person") => Promise<Person | null>;
  declare loadHasOne: (name: "bulb") => Promise<Bulb | null>;
  declare bulbs_count: number;
  declare created_at: Temporal.Instant | Temporal.PlainDateTime;
  declare custom_tyres_count: number;
  declare engines_count: number;
  declare lock_version: number;
  declare name: string;
  declare person_id: number;
  declare updated_at: Temporal.Instant | Temporal.PlainDateTime;
  declare wheels_count: number;

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
