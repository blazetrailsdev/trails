import type { AssociationProxy } from "../../associations/collection-proxy.js";
import { CollectionProxy } from "../../associations/collection-proxy.js";
import type { Temporal, Time as RubyTime } from "@blazetrails/date";
import type { Bird } from "./bird.js";
import type { Bulb } from "./bulb.js";
import type { FamousShip } from "./ship.js";
import type { Matey } from "./matey.js";
import type { Parrot } from "./parrot.js";
import type { PriceEstimate } from "./price-estimate.js";
import type { Ship } from "./ship.js";
import type { Treasure } from "./treasure.js";
import { throwAbort } from "@blazetrails/activesupport";
import { Base } from "../../base.js";
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- a generated attribute accessor's reader and writer types differ (CLAUDE.md, "Generated attribute readers are properties"); a class body cannot hold a bodiless accessor, so the pair lives in an interface that merges with the class. */
export interface Pirate {
  get parrot_id(): number;
  set parrot_id(value: unknown);
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- the reader/writer accessor pair for this model's generated attributes lives in the interface merged above. */
export class Pirate extends Base {
  declare parrotsLimit: number;

  cancelSaveFromCallback: boolean = false;
  declare catchphrase: string;

  declare parrot: Parrot | null;
  declare nonValidatedParrot: Parrot | null;
  declare parrots: AssociationProxy<Parrot>;
  declare nonValidatedParrots: AssociationProxy<Parrot>;
  declare parrotsWithMethodCallbacks: AssociationProxy<Parrot>;
  declare parrotsWithProcCallbacks: AssociationProxy<Parrot>;
  declare autosavedParrots: AssociationProxy<Parrot>;
  declare treasures: AssociationProxy<Treasure>;
  declare treasureEstimates: AssociationProxy<PriceEstimate>;
  declare ship: Ship | null;
  declare updateOnlyShip: Ship | null;
  declare nonValidatedShip: Ship | null;
  declare birds: AssociationProxy<Bird>;
  declare birdsWithMethodCallbacks: AssociationProxy<Bird>;
  declare birdsWithProcCallbacks: AssociationProxy<Bird>;
  declare birdsWithRejectAllBlank: AssociationProxy<Bird>;
  declare fooBulb: Bulb | null;
  declare mateys: AssociationProxy<Matey>;
  declare attackerMatey: Matey | null;
  declare loadBelongsTo: ((name: "parrot") => Promise<Parrot | null>) &
    ((name: "nonValidatedParrot") => Promise<Parrot | null>);
  declare loadHasOne: ((name: "ship") => Promise<Ship | null>) &
    ((name: "updateOnlyShip") => Promise<Ship | null>) &
    ((name: "nonValidatedShip") => Promise<Ship | null>) &
    ((name: "fooBulb") => Promise<Bulb | null>) &
    ((name: "attackerMatey") => Promise<Matey | null>);
  declare created_on: RubyTime | Temporal.PlainDateTime;
  declare non_validated_parrot_id: number;
  declare updated_on: RubyTime | Temporal.PlainDateTime;

  static postTreasuresExtension = {
    build(this: CollectionProxy<Base>, ...args: unknown[]): Base {
      const attributes = (args[0] as Record<string, unknown>) ?? {};
      return CollectionProxy.prototype.build.call(this, {
        name: "from extension",
        ...attributes,
      }) as Base;
    },
  };

  static {
    this.attribute("parrotsLimit", "integer");

    this.belongsTo("parrot", { validate: true });
    this.belongsTo("nonValidatedParrot", { className: "Parrot" });
    this.hasAndBelongsToMany("parrots", (q: any) => q.order("parrots.id ASC"), { validate: true });
    this.hasAndBelongsToMany("nonValidatedParrots", { className: "Parrot" });
    this.hasAndBelongsToMany("parrotsWithMethodCallbacks", {
      className: "Parrot",
      beforeAdd: (p: any, pa: any) => p.logBeforeAdd(pa),
      afterAdd: (p: any, pa: any) => p.logAfterAdd(pa),
      beforeRemove: (p: any, pa: any) => p.logBeforeRemove(pa),
      afterRemove: (p: any, pa: any) => p.logAfterRemove(pa),
    });
    this.hasAndBelongsToMany("parrotsWithProcCallbacks", {
      className: "Parrot",
      beforeAdd: (p: any, pa: any) =>
        p.shipLog.push(`before_adding_proc_parrot_${pa.id ?? "<new>"}`),
      afterAdd: (p: any, pa: any) => p.shipLog.push(`after_adding_proc_parrot_${pa.id ?? "<new>"}`),
      beforeRemove: (p: any, pa: any) => p.shipLog.push(`before_removing_proc_parrot_${pa.id}`),
      afterRemove: (p: any, pa: any) => p.shipLog.push(`after_removing_proc_parrot_${pa.id}`),
    });
    this.hasAndBelongsToMany("autosavedParrots", { className: "Parrot", autosave: true });

    this.hasMany("treasures", { as: "looter", extend: Pirate.postTreasuresExtension });
    this.hasMany("treasureEstimates", { through: "treasures", source: "priceEstimates" });

    this.hasOne("ship");
    this.hasOne("updateOnlyShip", { className: "Ship" });
    this.hasOne("nonValidatedShip", { className: "Ship" });
    this.hasMany("birds", (q: any) => q.order("birds.id ASC"));
    this.hasMany("birdsWithMethodCallbacks", {
      className: "Bird",
      beforeAdd: (p: any, b: any) => p.logBeforeAdd(b),
      afterAdd: (p: any, b: any) => p.logAfterAdd(b),
      beforeRemove: (p: any, b: any) => p.logBeforeRemove(b),
      afterRemove: (p: any, b: any) => p.logAfterRemove(b),
    });
    this.hasMany("birdsWithProcCallbacks", {
      className: "Bird",
      beforeAdd: (p: any, b: any) => p.shipLog.push(`before_adding_proc_bird_${b.id ?? "<new>"}`),
      afterAdd: (p: any, b: any) => p.shipLog.push(`after_adding_proc_bird_${b.id ?? "<new>"}`),
      beforeRemove: (p: any, b: any) => p.shipLog.push(`before_removing_proc_bird_${b.id}`),
      afterRemove: (p: any, b: any) => p.shipLog.push(`after_removing_proc_bird_${b.id}`),
    });
    this.hasMany("birdsWithRejectAllBlank", { className: "Bird" });

    this.hasOne("fooBulb", (q: any) => q.where({ name: "foo" }), {
      foreignKey: "car_id",
      className: "Bulb",
    });

    this.hasMany("mateys", { foreignKey: "pirate_id" });
    this.hasOne("attackerMatey", { foreignKey: "target_id", className: "Matey" });

    this.validates("catchphrase", { presence: true });

    this.beforeSave(
      function (this: any) {
        return this.cancelSaveCallbackMethod();
      },
      { if: (r: any) => r.cancelSaveFromCallback },
    );
  }

  get shipLog(): string[] {
    if (!this._shipLog) this._shipLog = [];
    return this._shipLog;
  }
  private _shipLog?: string[];

  cancelSaveCallbackMethod() {
    throwAbort();
  }

  private log(record: any, callback: string) {
    this.shipLog.push(
      `${callback}_${record.constructor.name.toLowerCase()}_${record.id ?? "<new>"}`,
    );
  }

  private logBeforeAdd(record: any) {
    this.log(record, "before_adding_method");
  }
  private logAfterAdd(record: any) {
    this.log(record, "after_adding_method");
  }
  private logBeforeRemove(record: any) {
    this.log(record, "before_removing_method");
  }
  private logAfterRemove(record: any) {
    this.log(record, "after_removing_method");
  }
}

const rejectIfEmpty = (attrs: Record<string, unknown>) => Object.keys(attrs).length === 0;

acceptsNestedAttributesFor(Pirate, "parrots", { allowDestroy: true, rejectIf: rejectIfEmpty });
acceptsNestedAttributesFor(Pirate, "birds", { allowDestroy: true, rejectIf: rejectIfEmpty });
acceptsNestedAttributesFor(Pirate, "ship", { allowDestroy: true, rejectIf: rejectIfEmpty });
acceptsNestedAttributesFor(Pirate, "updateOnlyShip", { updateOnly: true });
acceptsNestedAttributesFor(Pirate, "parrotsWithMethodCallbacks", { allowDestroy: true });
acceptsNestedAttributesFor(Pirate, "parrotsWithProcCallbacks", { allowDestroy: true });
acceptsNestedAttributesFor(Pirate, "birdsWithMethodCallbacks", { allowDestroy: true });
acceptsNestedAttributesFor(Pirate, "birdsWithProcCallbacks", { allowDestroy: true });
acceptsNestedAttributesFor(Pirate, "birdsWithRejectAllBlank", { rejectIf: "all_blank" });

export class DestructivePirate extends Pirate {
  declare dependentShip: Ship | null;
  declare loadBelongsTo: ((name: "parrot") => Promise<Parrot | null>) &
    ((name: "nonValidatedParrot") => Promise<Parrot | null>);
  declare loadHasOne: ((name: "ship") => Promise<Ship | null>) &
    ((name: "updateOnlyShip") => Promise<Ship | null>) &
    ((name: "nonValidatedShip") => Promise<Ship | null>) &
    ((name: "fooBulb") => Promise<Bulb | null>) &
    ((name: "attackerMatey") => Promise<Matey | null>) &
    ((name: "dependentShip") => Promise<Ship | null>);

  static {
    this.hasOne("dependentShip", {
      className: "Ship",
      foreignKey: "pirate_id",
      dependent: "destroy",
    });
  }
}

export class FamousPirate extends Base {
  declare famousShips: AssociationProxy<FamousShip>;

  static {
    this.tableName = "pirates";
    this.hasMany("famousShips", { inverseOf: "famousPirate" });
    this.validates("catchphrase", { presence: true, on: "conference" });
  }
}

export class SpacePirate extends Base {
  declare parrot: Parrot | null;
  declare parrots: AssociationProxy<Parrot>;
  declare ship: Ship | null;
  declare birds: AssociationProxy<Bird>;
  declare treasures: AssociationProxy<Treasure>;
  declare treasureEstimates: AssociationProxy<PriceEstimate>;
  declare loadBelongsTo: (name: "parrot") => Promise<Parrot | null>;
  declare loadHasOne: (name: "ship") => Promise<Ship | null>;

  static {
    this.tableName = "pirates";
    this.belongsTo("parrot");
    this.hasAndBelongsToMany("parrots", { foreignKey: "pirate_id" });
    this.hasOne("ship", { foreignKey: "pirate_id" });
    this.hasMany("birds", { foreignKey: "pirate_id" });
    this.hasMany("treasures", { as: "looter" });
    this.hasMany("treasureEstimates", { through: "treasures", source: "priceEstimates" });
  }
}
