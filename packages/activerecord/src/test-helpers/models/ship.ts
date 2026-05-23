// vendor/rails/activerecord/test/models/ship.rb
import { Base } from "../../base.js";

export class Ship extends Base {
  static {
    this.recordTimestamps = false;
    this.belongsTo("pirate");
    this.belongsTo("updateOnlyPirate", { className: "Pirate" });
    this.belongsTo("developer", { dependent: "destroy" });
    this.hasMany("parts", { className: "ShipPart" });
    this.hasMany("treasures");

    this.validates("name", { presence: true });

    this.beforeSave(
      function (this: any) {
        this.cancelSaveCallbackMethod();
      },
      { if: (r: any) => r.cancelSaveFromCallback },
    );
  }

  cancelSaveCallbackMethod() {
    throw "abort";
  }
}

export class ShipWithoutNestedAttributes extends Base {
  static {
    this.tableName = "ships";
    this.hasMany("prisoners", { inverseOf: "ship" });
    this.hasMany("parts", { className: "ShipPart", foreignKey: "ship_id" });

    this.validates("name", { presence: true, if: () => true });
    this.validates("name", { presence: true, if: () => true });
  }
}

export class Prisoner extends Base {
  static {
    this.belongsTo("ship", {
      autosave: true,
      className: "ShipWithoutNestedAttributes",
      inverseOf: "prisoners",
    });
  }
}

export class FamousShip extends Base {
  static {
    this.tableName = "ships";
    this.belongsTo("famousPirate", { foreignKey: "pirate_id" });
    this.validates("name", { presence: true, on: "conference" });
  }
}
