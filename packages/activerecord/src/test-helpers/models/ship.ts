import { throwAbort } from "@blazetrails/activesupport";
import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Temporal, Time as RubyTime } from "@blazetrails/date";
import type { Developer } from "./developer.js";
import type { FamousPirate } from "./pirate.js";
import type { Pirate } from "./pirate.js";
import type { ShipPart } from "./ship-part.js";
import type { Treasure } from "./treasure.js";
import { Base } from "../../base.js";
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";
import { registerModel } from "../../associations.js";

export class Ship extends Base {
  declare pirate: Pirate | null;
  declare updateOnlyPirate: Pirate | null;
  declare developer: Developer | null;
  declare parts: AssociationProxy<ShipPart>;
  declare treasures: AssociationProxy<Treasure>;
  declare loadBelongsTo: ((name: "pirate") => Promise<Pirate | null>) &
    ((name: "updateOnlyPirate") => Promise<Pirate | null>) &
    ((name: "developer") => Promise<Developer | null>);
  declare created_at: RubyTime | Temporal.PlainDateTime;
  declare created_on: RubyTime | Temporal.PlainDateTime;
  declare developer_id: number;
  declare name: string;
  declare pirate_id: number;
  declare treasures_count: number | null;
  declare update_only_pirate_id: number;
  declare updated_at: RubyTime | Temporal.PlainDateTime;
  declare updated_on: RubyTime | Temporal.PlainDateTime;

  cancelSaveFromCallback: boolean = false;

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
    throwAbort();
  }
}

acceptsNestedAttributesFor(Ship, "parts", { allowDestroy: true });
acceptsNestedAttributesFor(Ship, "pirate", {
  allowDestroy: true,
  rejectIf: (attrs) => Object.keys(attrs).length === 0,
});
acceptsNestedAttributesFor(Ship, "updateOnlyPirate", { updateOnly: true });

export class ShipWithoutNestedAttributes extends Base {
  declare prisoners: AssociationProxy<Prisoner>;
  declare parts: AssociationProxy<ShipPart>;

  static {
    this.tableName = "ships";
    this.hasMany("prisoners", { inverseOf: "ship" });
    this.hasMany("parts", { className: "ShipPart", foreignKey: "ship_id" });

    this.validates("name", { presence: true, if: () => true });
    this.validates("name", { presence: true, if: () => true });
  }
}

export class Prisoner extends Base {
  declare ship: ShipWithoutNestedAttributes | null;
  declare loadBelongsTo: (name: "ship") => Promise<ShipWithoutNestedAttributes | null>;
  declare ship_id: number;

  static {
    this.belongsTo("ship", {
      autosave: true,
      className: "ShipWithoutNestedAttributes",
      inverseOf: "prisoners",
    });
  }
}

export class FamousShip extends Base {
  declare famousPirate: FamousPirate | null;
  declare loadBelongsTo: (name: "famousPirate") => Promise<FamousPirate | null>;

  static {
    this.tableName = "ships";
    this.belongsTo("famousPirate", { foreignKey: "pirate_id" });
    this.validates("name", { presence: true, on: "conference" });
  }
}

registerModel(Ship);
