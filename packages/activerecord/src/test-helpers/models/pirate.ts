// vendor/rails/activerecord/test/models/pirate.rb
import { Base } from "../../base.js";

export class Pirate extends Base {
  static {
    this.belongsTo("parrot", { validate: true });
    this.belongsTo("nonValidatedParrot", { className: "Parrot" });
    this.hasAndBelongsToMany("parrots", {
      scope: (q: any) => q.order("parrots.id ASC"),
      validate: true,
    });
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

    this.hasMany("treasures", { as: "looter" });
    this.hasMany("treasureEstimates", { through: "treasures", source: "priceEstimates" });

    this.hasOne("ship");
    this.hasOne("updateOnlyShip", { className: "Ship" });
    this.hasOne("nonValidatedShip", { className: "Ship" });
    this.hasMany("birds", { scope: (q: any) => q.order("birds.id ASC") });
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

    this.hasOne("fooBulb", {
      scope: (q: any) => q.where({ name: "foo" }),
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
    return this._shipLog as string[];
  }
  private _shipLog?: string[];

  cancelSaveCallbackMethod() {
    throw "abort";
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

export class DestructivePirate extends Pirate {
  static {
    this.hasOne("dependentShip", {
      className: "Ship",
      foreignKey: "pirate_id",
      dependent: "destroy",
    });
  }
}

export class FamousPirate extends Base {
  static {
    this.tableName = "pirates";
    this.hasMany("famousShips", { inverseOf: "famousPirate" });
    this.validates("catchphrase", { presence: true, on: "conference" });
  }
}

export class SpacePirate extends Base {
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
